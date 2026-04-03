#![allow(dead_code)]

use std::path::{Path, PathBuf};

use super::{
    LibraryPathKind, LibraryPathVisibility, ScanPhase, classify_library_path,
    dedupe_overlapping_roots, is_dangerous_root, is_scan_phase_active, is_scan_phase_terminal,
    normalize_path, now_ms,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatcherIgnoreReason {
    NoWatchedRoots,
    HiddenPath,
    NoisePath,
    OutsideWatchedRoots,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatcherDiagnosticKind {
    DangerousPath,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatcherClassification {
    Ignored {
        reason: WatcherIgnoreReason,
        observed_path: PathBuf,
    },
    DirtyRoots {
        canonical_roots: Vec<PathBuf>,
    },
    Diagnostic {
        kind: WatcherDiagnosticKind,
        observed_path: PathBuf,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatcherScheduleAction {
    Ignored,
    QueuedFollowUp,
    Launched,
    NoFollowUp,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WatcherCoordinatorState {
    pub watched_roots: Vec<PathBuf>,
    pub dirty_roots: Vec<PathBuf>,
    pub queued_follow_up: bool,
    pub last_attempted_roots: Vec<PathBuf>,
    pub last_attempted_at_ms: Option<i64>,
    pub last_scheduler_error: Option<String>,
}

impl WatcherCoordinatorState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_watched_roots(&mut self, watched_roots: &[PathBuf]) {
        self.watched_roots = sanitize_canonical_roots(watched_roots);
    }

    pub fn schedule_dirty_roots<F>(
        &mut self,
        scan_phase: ScanPhase,
        dirty_roots: &[PathBuf],
        launch_scan: F,
    ) -> Result<WatcherScheduleAction, String>
    where
        F: FnOnce(Vec<PathBuf>) -> Result<(), String>,
    {
        self.schedule_dirty_roots_at(scan_phase, dirty_roots, now_ms(), launch_scan)
    }

    pub fn schedule_dirty_roots_at<F>(
        &mut self,
        scan_phase: ScanPhase,
        dirty_roots: &[PathBuf],
        attempted_at_ms: i64,
        launch_scan: F,
    ) -> Result<WatcherScheduleAction, String>
    where
        F: FnOnce(Vec<PathBuf>) -> Result<(), String>,
    {
        let sanitized_roots = sanitize_canonical_roots(dirty_roots);
        if sanitized_roots.is_empty() {
            return Ok(WatcherScheduleAction::Ignored);
        }

        self.merge_dirty_roots(&sanitized_roots);

        if is_scan_phase_active(scan_phase) {
            self.queued_follow_up = true;
            return Ok(WatcherScheduleAction::QueuedFollowUp);
        }

        let roots_to_launch = std::mem::take(&mut self.dirty_roots);
        self.try_launch(roots_to_launch, attempted_at_ms, false, launch_scan)
    }

    pub fn handle_scan_terminal<F>(
        &mut self,
        scan_phase: ScanPhase,
        launch_scan: F,
    ) -> Result<WatcherScheduleAction, String>
    where
        F: FnOnce(Vec<PathBuf>) -> Result<(), String>,
    {
        self.handle_scan_terminal_at(scan_phase, now_ms(), launch_scan)
    }

    pub fn handle_scan_terminal_at<F>(
        &mut self,
        scan_phase: ScanPhase,
        attempted_at_ms: i64,
        launch_scan: F,
    ) -> Result<WatcherScheduleAction, String>
    where
        F: FnOnce(Vec<PathBuf>) -> Result<(), String>,
    {
        if !is_scan_phase_terminal(scan_phase) {
            let message = "watcher scheduler expected a terminal scan phase".to_string();
            self.last_scheduler_error = Some(message.clone());
            return Err(message);
        }

        if !self.queued_follow_up {
            return Ok(WatcherScheduleAction::NoFollowUp);
        }

        if self.dirty_roots.is_empty() {
            let message = "watcher scheduler queued follow-up without dirty roots".to_string();
            self.last_scheduler_error = Some(message.clone());
            return Err(message);
        }

        let roots_to_launch = std::mem::take(&mut self.dirty_roots);
        self.try_launch(roots_to_launch, attempted_at_ms, true, launch_scan)
    }

    fn merge_dirty_roots(&mut self, dirty_roots: &[PathBuf]) {
        let mut merged = self.dirty_roots.clone();
        merged.extend(dirty_roots.iter().cloned());
        self.dirty_roots = dedupe_overlapping_roots(&merged);
    }

    fn try_launch<F>(
        &mut self,
        roots: Vec<PathBuf>,
        attempted_at_ms: i64,
        preserve_follow_up_on_error: bool,
        launch_scan: F,
    ) -> Result<WatcherScheduleAction, String>
    where
        F: FnOnce(Vec<PathBuf>) -> Result<(), String>,
    {
        self.last_attempted_roots = roots.clone();
        self.last_attempted_at_ms = Some(attempted_at_ms);

        match launch_scan(roots.clone()) {
            Ok(()) => {
                self.queued_follow_up = false;
                self.last_scheduler_error = None;
                Ok(WatcherScheduleAction::Launched)
            }
            Err(err) => {
                self.merge_dirty_roots(&roots);
                self.queued_follow_up = preserve_follow_up_on_error;
                self.last_scheduler_error = Some(err.clone());
                Err(err)
            }
        }
    }
}

fn sanitize_canonical_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut sanitized = Vec::new();

    for root in roots {
        let normalized = normalize_path(root.as_path());
        if !normalized.is_absolute() || normalized.as_os_str().is_empty() || normalized != *root {
            continue;
        }

        if is_dangerous_root(&normalized) {
            continue;
        }

        sanitized.push(normalized);
    }

    dedupe_overlapping_roots(&sanitized)
}

pub fn classify_watcher_path(
    watched_roots: &[PathBuf],
    observed_path: PathBuf,
    path_kind: LibraryPathKind,
) -> WatcherClassification {
    if watched_roots.is_empty() {
        return WatcherClassification::Ignored {
            reason: WatcherIgnoreReason::NoWatchedRoots,
            observed_path,
        };
    }

    if is_dangerous_root(observed_path.as_path()) {
        return WatcherClassification::Diagnostic {
            kind: WatcherDiagnosticKind::DangerousPath,
            observed_path,
        };
    }

    let candidate_paths = watcher_match_candidates(observed_path.as_path());
    let matching_roots = matched_watched_roots(watched_roots, &candidate_paths);
    if matching_roots.is_empty() {
        return WatcherClassification::Ignored {
            reason: WatcherIgnoreReason::OutsideWatchedRoots,
            observed_path,
        };
    }

    let policy_root = matching_roots
        .iter()
        .max_by_key(|root| root.components().count())
        .expect("matching roots should not be empty");
    let policy_path = candidate_paths
        .iter()
        .find(|candidate| candidate.starts_with(policy_root))
        .cloned()
        .unwrap_or_else(|| normalize_path(observed_path.as_path()));

    let relative_path = policy_path
        .strip_prefix(policy_root)
        .map(Path::to_path_buf)
        .unwrap_or_default();

    match classify_library_path(&relative_path, path_kind) {
        LibraryPathVisibility::Visible => WatcherClassification::DirtyRoots {
            canonical_roots: matching_roots,
        },
        LibraryPathVisibility::Hidden => WatcherClassification::Ignored {
            reason: WatcherIgnoreReason::HiddenPath,
            observed_path,
        },
        LibraryPathVisibility::NoisePath => WatcherClassification::Ignored {
            reason: WatcherIgnoreReason::NoisePath,
            observed_path,
        },
    }
}

fn matched_watched_roots(watched_roots: &[PathBuf], candidate_paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut matched = Vec::new();

    for root in watched_roots {
        let normalized_root = normalize_path(root.as_path());
        if candidate_paths
            .iter()
            .any(|candidate| candidate.starts_with(&normalized_root))
        {
            matched.push(normalized_root);
        }
    }

    dedupe_overlapping_roots(&matched)
}

fn watcher_match_candidates(path: &Path) -> Vec<PathBuf> {
    let raw = normalize_path(path);
    let mut candidates = vec![raw.clone()];

    if let Some(canonicalized) = canonicalize_with_existing_ancestor(path) {
        let canonicalized = normalize_path(&canonicalized);
        if canonicalized != raw {
            candidates.push(canonicalized);
        }
    }

    candidates
}

fn canonicalize_with_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut suffix = Vec::new();
    let mut current = Some(path);

    while let Some(candidate) = current {
        match candidate.canonicalize() {
            Ok(canonicalized) => {
                let mut rebuilt = canonicalized;
                for component in suffix.iter().rev() {
                    rebuilt.push(component);
                }
                return Some(rebuilt);
            }
            Err(_) => {
                let file_name = candidate.file_name()?.to_os_string();
                suffix.push(file_name);
                current = candidate.parent();
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};
    use tempfile::TempDir;

    #[test]
    fn watcher_contract_marks_dangerous_paths_as_diagnostic() {
        let observed_path = PathBuf::from("music").join("..").join("secret");

        let decision = classify_watcher_path(
            &[PathBuf::from("/music")],
            observed_path.clone(),
            LibraryPathKind::Directory,
        );

        assert_eq!(
            decision,
            WatcherClassification::Diagnostic {
                kind: WatcherDiagnosticKind::DangerousPath,
                observed_path,
            }
        );
    }

    #[test]
    fn watcher_contract_ignores_empty_watch_sets() {
        let observed_path = PathBuf::from("/music/track.mp3");

        let decision = classify_watcher_path(&[], observed_path.clone(), LibraryPathKind::File);

        assert_eq!(
            decision,
            WatcherClassification::Ignored {
                reason: WatcherIgnoreReason::NoWatchedRoots,
                observed_path,
            }
        );
    }

    #[test]
    fn watcher_contract_ignores_hidden_and_noise_paths() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("library");
        fs::create_dir_all(root.join("visible")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::create_dir_all(root.join("target")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();

        let canonical_root = root.canonicalize().unwrap();
        let hidden_file = canonical_root.join(".hidden-track.mp3");
        let hidden_child = canonical_root.join(".hidden").join("track.mp3");
        let node_modules_child = canonical_root.join("node_modules").join("track.mp3");
        let target_dir = canonical_root.join("target");

        assert_eq!(
            classify_watcher_path(
                std::slice::from_ref(&canonical_root),
                hidden_file.clone(),
                LibraryPathKind::File,
            ),
            WatcherClassification::Ignored {
                reason: WatcherIgnoreReason::HiddenPath,
                observed_path: hidden_file,
            }
        );

        assert_eq!(
            classify_watcher_path(
                std::slice::from_ref(&canonical_root),
                hidden_child.clone(),
                LibraryPathKind::File,
            ),
            WatcherClassification::Ignored {
                reason: WatcherIgnoreReason::HiddenPath,
                observed_path: hidden_child,
            }
        );

        assert_eq!(
            classify_watcher_path(
                std::slice::from_ref(&canonical_root),
                node_modules_child.clone(),
                LibraryPathKind::File,
            ),
            WatcherClassification::Ignored {
                reason: WatcherIgnoreReason::NoisePath,
                observed_path: node_modules_child,
            }
        );

        assert_eq!(
            classify_watcher_path(
                &[canonical_root],
                target_dir.clone(),
                LibraryPathKind::Directory,
            ),
            WatcherClassification::Ignored {
                reason: WatcherIgnoreReason::NoisePath,
                observed_path: target_dir,
            }
        );
    }

    #[test]
    fn watcher_contract_ignores_paths_outside_every_root() {
        let tmp = TempDir::new().unwrap();
        let watched_root = tmp.path().join("watched");
        let outside_root = tmp.path().join("outside");
        fs::create_dir_all(&watched_root).unwrap();
        fs::create_dir_all(&outside_root).unwrap();

        let canonical_root = watched_root.canonicalize().unwrap();
        let outside_path = outside_root.join("track.mp3");

        let decision = classify_watcher_path(
            &[canonical_root],
            outside_path.clone(),
            LibraryPathKind::File,
        );

        assert_eq!(
            decision,
            WatcherClassification::Ignored {
                reason: WatcherIgnoreReason::OutsideWatchedRoots,
                observed_path: outside_path,
            }
        );
    }

    #[test]
    fn watcher_contract_dedupes_overlapping_dirty_roots() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("library");
        let nested = root.join("nested");
        fs::create_dir_all(&nested).unwrap();
        let observed_path = nested.join("track.mp3");

        let canonical_root = root.canonicalize().unwrap();
        let canonical_nested = nested.canonicalize().unwrap();

        let decision = classify_watcher_path(
            &[canonical_root.clone(), canonical_nested],
            observed_path,
            LibraryPathKind::File,
        );

        assert_eq!(
            decision,
            WatcherClassification::DirtyRoots {
                canonical_roots: vec![canonical_root],
            }
        );
    }

    #[test]
    fn watcher_contract_matches_deleted_paths_using_existing_ancestor_canonicalization() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("library");
        fs::create_dir_all(root.join("album")).unwrap();
        let deleted_path = root.join("album").join("deleted-track.mp3");
        fs::write(&deleted_path, b"stub").unwrap();

        let canonical_root = root.canonicalize().unwrap();
        fs::remove_file(&deleted_path).unwrap();

        let decision = classify_watcher_path(
            std::slice::from_ref(&canonical_root),
            deleted_path,
            LibraryPathKind::File,
        );

        assert_eq!(
            decision,
            WatcherClassification::DirtyRoots {
                canonical_roots: vec![canonical_root],
            }
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watcher_contract_matches_var_aliases_to_canonical_roots() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("library");
        fs::create_dir_all(root.join("album")).unwrap();
        let event_path = root.join("album").join("track.mp3");
        fs::write(&event_path, b"stub").unwrap();

        let canonical_root = root.canonicalize().unwrap();
        let canonical_event = event_path.canonicalize().unwrap();
        let alias_event = macos_alias_for(&canonical_event).expect("path should have /var alias");

        let decision = classify_watcher_path(
            std::slice::from_ref(&canonical_root),
            alias_event,
            LibraryPathKind::File,
        );

        assert_eq!(
            decision,
            WatcherClassification::DirtyRoots {
                canonical_roots: vec![canonical_root],
            }
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watcher_contract_keeps_descendant_when_ancestor_root_is_dangerous() {
        let dangerous_root = PathBuf::from("/Volumes");
        let child_root = PathBuf::from("/Volumes/MyDisk/Music");
        let observed_path = child_root.join("track.mp3");

        let decision = classify_watcher_path(
            &[dangerous_root.clone(), child_root.clone()],
            observed_path,
            LibraryPathKind::File,
        );

        assert_eq!(
            decision,
            WatcherClassification::DirtyRoots {
                canonical_roots: vec![dangerous_root, child_root],
            }
        );
    }

    #[test]
    fn watcher_scheduler_queues_single_follow_up_while_scan_is_running() {
        let tmp = TempDir::new().unwrap();
        let root_dir = tmp.path().join("music");
        let later_dir = root_dir.join("new");
        fs::create_dir_all(&later_dir).unwrap();

        let root = root_dir.canonicalize().unwrap();
        let later_root = later_dir.canonicalize().unwrap();
        let mut state = WatcherCoordinatorState::new();
        let mut launches = Vec::new();

        let first = state.schedule_dirty_roots_at(
            ScanPhase::Running,
            std::slice::from_ref(&root),
            10,
            |roots: Vec<PathBuf>| {
                launches.push(roots);
                Ok(())
            },
        );
        assert_eq!(first.unwrap(), WatcherScheduleAction::QueuedFollowUp);
        assert!(launches.is_empty());
        assert!(state.queued_follow_up);
        assert_eq!(state.dirty_roots, vec![root.clone()]);

        let second = state.schedule_dirty_roots_at(
            ScanPhase::Cancelling,
            &[root.clone(), later_root.clone()],
            20,
            |roots: Vec<PathBuf>| {
                launches.push(roots);
                Ok(())
            },
        );
        assert_eq!(second.unwrap(), WatcherScheduleAction::QueuedFollowUp);
        assert!(launches.is_empty());
        assert!(state.queued_follow_up);
        assert_eq!(state.dirty_roots, vec![root.clone()]);

        let follow_up = state.handle_scan_terminal_at(ScanPhase::Completed, 30, |roots: Vec<PathBuf>| {
            launches.push(roots.clone());
            Ok(())
        });
        assert_eq!(follow_up.unwrap(), WatcherScheduleAction::Launched);
        assert_eq!(launches, vec![vec![root.clone()]]);
        assert!(!state.queued_follow_up);
        assert!(state.dirty_roots.is_empty());
        assert_eq!(state.last_attempted_roots, vec![root]);
        assert_eq!(state.last_attempted_at_ms, Some(30));
    }

    #[test]
    fn watcher_scheduler_dedupes_duplicates_and_ignores_empty_or_invalid_roots() {
        let tmp = TempDir::new().unwrap();
        let valid_dir = tmp.path().join("music");
        fs::create_dir_all(&valid_dir).unwrap();

        let valid_root = valid_dir.canonicalize().unwrap();
        let invalid_root = PathBuf::from("music").join("..").join("secret");
        let mut state = WatcherCoordinatorState::new();
        let mut launches = Vec::new();

        let empty = state.schedule_dirty_roots_at(ScanPhase::Idle, &[], 10, |roots: Vec<PathBuf>| {
            launches.push(roots);
            Ok(())
        });
        assert_eq!(empty.unwrap(), WatcherScheduleAction::Ignored);
        assert!(launches.is_empty());

        let invalid = state.schedule_dirty_roots_at(
            ScanPhase::Idle,
            std::slice::from_ref(&invalid_root),
            20,
            |roots: Vec<PathBuf>| {
                launches.push(roots);
                Ok(())
            },
        );
        assert_eq!(invalid.unwrap(), WatcherScheduleAction::Ignored);
        assert!(launches.is_empty());

        let valid = state.schedule_dirty_roots_at(
            ScanPhase::Idle,
            &[valid_root.clone(), valid_root.clone()],
            30,
            |roots: Vec<PathBuf>| {
                launches.push(roots.clone());
                Ok(())
            },
        );
        assert_eq!(valid.unwrap(), WatcherScheduleAction::Launched);
        assert_eq!(launches, vec![vec![valid_root.clone()]]);
        assert_eq!(state.last_attempted_roots, vec![valid_root]);
        assert_eq!(state.last_attempted_at_ms, Some(30));
    }

    #[test]
    fn watcher_scheduler_preserves_dirty_roots_when_launch_fails() {
        let tmp = TempDir::new().unwrap();
        let first_dir = tmp.path().join("music");
        let second_dir = first_dir.join("second");
        fs::create_dir_all(&second_dir).unwrap();

        let first_root = first_dir.canonicalize().unwrap();
        let second_root = second_dir.canonicalize().unwrap();
        let mut state = WatcherCoordinatorState::new();
        let mut launches = Vec::new();

        let first_attempt = state.schedule_dirty_roots_at(
            ScanPhase::Idle,
            std::slice::from_ref(&first_root),
            10,
            |_roots| Err("launcher failed".to_string()),
        );
        assert_eq!(first_attempt.unwrap_err(), "launcher failed");
        assert_eq!(state.dirty_roots, vec![first_root.clone()]);
        assert_eq!(state.last_attempted_roots, vec![first_root.clone()]);
        assert_eq!(state.last_attempted_at_ms, Some(10));
        assert!(!state.queued_follow_up);
        assert_eq!(state.last_scheduler_error.as_deref(), Some("launcher failed"));

        let retry = state.schedule_dirty_roots_at(
            ScanPhase::Failed,
            std::slice::from_ref(&second_root),
            20,
            |roots: Vec<PathBuf>| {
                launches.push(roots.clone());
                Ok(())
            },
        );
        assert_eq!(retry.unwrap(), WatcherScheduleAction::Launched);
        assert_eq!(launches, vec![vec![first_root.clone()]]);
        assert!(state.dirty_roots.is_empty());
        assert_eq!(state.last_attempted_roots, vec![first_root]);
        assert_eq!(state.last_attempted_at_ms, Some(20));
        assert_eq!(state.last_scheduler_error, None);
        assert!(!state.queued_follow_up);
    }

    #[test]
    fn watcher_scheduler_rejects_non_terminal_cleanup_phases() {
        let tmp = TempDir::new().unwrap();
        let root_dir = tmp.path().join("music");
        fs::create_dir_all(&root_dir).unwrap();

        let root = root_dir.canonicalize().unwrap();
        let mut state = WatcherCoordinatorState::new();
        state.dirty_roots = vec![root.clone()];
        state.queued_follow_up = true;

        let err = state
            .handle_scan_terminal_at(ScanPhase::Running, 10, |_roots| Ok(()))
            .unwrap_err();

        assert_eq!(err, "watcher scheduler expected a terminal scan phase");
        assert!(state.queued_follow_up);
        assert_eq!(state.dirty_roots, vec![root]);
        assert_eq!(
            state.last_scheduler_error.as_deref(),
            Some("watcher scheduler expected a terminal scan phase")
        );
    }

    #[test]
    fn watcher_scheduler_clears_terminal_state_without_follow_up() {
        let mut state = WatcherCoordinatorState::new();

        let result = state.handle_scan_terminal_at(ScanPhase::Cancelled, 10, |_roots| Ok(()));

        assert_eq!(result.unwrap(), WatcherScheduleAction::NoFollowUp);
        assert!(!state.queued_follow_up);
        assert!(state.dirty_roots.is_empty());
        assert_eq!(state.last_scheduler_error, None);
    }

    #[cfg(target_os = "macos")]
    fn macos_alias_for(path: &std::path::Path) -> Option<PathBuf> {
        let raw = path.to_string_lossy();
        if let Some(stripped) = raw.strip_prefix("/private/var/") {
            return Some(PathBuf::from(format!("/var/{stripped}")));
        }

        if let Some(stripped) = raw.strip_prefix("/var/") {
            return Some(PathBuf::from(format!("/private/var/{stripped}")));
        }

        None
    }
}
