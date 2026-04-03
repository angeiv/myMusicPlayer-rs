#![allow(dead_code)]

use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use notify_debouncer_full::{
    DebounceEventHandler, DebounceEventResult, DebouncedEvent, Debouncer, RecommendedCache,
    new_debouncer,
    notify::{EventKind, RecommendedWatcher, RecursiveMode},
};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatcherRuntimeOutcome {
    Ignored,
    DiagnosticOnly,
    Scheduled(WatcherScheduleAction),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatcherTriggerMetadata {
    pub triggered_at_ms: i64,
    pub event_count: usize,
    pub observed_paths: Vec<PathBuf>,
    pub dirty_roots: Vec<PathBuf>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WatcherCoordinatorState {
    pub watched_roots: Vec<PathBuf>,
    pub dirty_roots: Vec<PathBuf>,
    pub queued_follow_up: bool,
    pub last_attempted_roots: Vec<PathBuf>,
    pub last_attempted_at_ms: Option<i64>,
    pub last_scheduler_error: Option<String>,
    pub last_runtime_error: Option<String>,
    pub last_trigger: Option<WatcherTriggerMetadata>,
}

impl WatcherCoordinatorState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_watched_roots(&mut self, watched_roots: &[PathBuf]) {
        self.watched_roots = sanitize_canonical_roots(watched_roots);
    }

    pub fn set_runtime_error(&mut self, error: Option<String>) {
        self.last_runtime_error = error;
    }

    pub fn set_last_trigger(
        &mut self,
        triggered_at_ms: i64,
        event_count: usize,
        observed_paths: &[PathBuf],
        dirty_roots: &[PathBuf],
    ) {
        self.last_trigger = Some(WatcherTriggerMetadata {
            triggered_at_ms,
            event_count,
            observed_paths: dedupe_exact_paths(observed_paths),
            dirty_roots: dedupe_overlapping_roots(dirty_roots),
        });
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

pub struct LibraryWatcherRuntime {
    debouncer: Option<Debouncer<RecommendedWatcher, RecommendedCache>>,
    debounce_window: Duration,
}

impl Default for LibraryWatcherRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl LibraryWatcherRuntime {
    pub fn new() -> Self {
        Self {
            debouncer: None,
            debounce_window: Duration::from_secs(2),
        }
    }

    pub fn is_registered(&self) -> bool {
        self.debouncer.is_some()
    }

    pub fn refresh_roots<F>(
        &mut self,
        watcher_state: &mut WatcherCoordinatorState,
        desired_roots: &[PathBuf],
        event_handler: F,
    ) -> Result<(), String>
    where
        F: DebounceEventHandler,
    {
        self.refresh_roots_with_timeout(
            watcher_state,
            desired_roots,
            self.debounce_window,
            event_handler,
        )
    }

    fn refresh_roots_with_timeout<F>(
        &mut self,
        watcher_state: &mut WatcherCoordinatorState,
        desired_roots: &[PathBuf],
        debounce_window: Duration,
        event_handler: F,
    ) -> Result<(), String>
    where
        F: DebounceEventHandler,
    {
        let root_plan = plan_runtime_watched_roots(desired_roots);

        if desired_roots.is_empty() {
            self.debouncer = None;
            watcher_state.set_watched_roots(&[]);
            watcher_state.set_runtime_error(None);
            return Ok(());
        }

        if root_plan.valid_roots.is_empty() {
            let message = format!(
                "Failed to refresh watcher roots: no valid library roots available ({})",
                format_paths(&root_plan.rejected_roots),
            );
            watcher_state.set_runtime_error(Some(message.clone()));
            return Err(message);
        }

        let mut debouncer = new_debouncer(debounce_window, None, event_handler).map_err(|err| {
            let message = format!("Failed to create watcher runtime: {err}");
            watcher_state.set_runtime_error(Some(message.clone()));
            message
        })?;

        for root in &root_plan.valid_roots {
            debouncer
                .watch(root, RecursiveMode::Recursive)
                .map_err(|err| {
                    let message = format!(
                        "Failed to refresh watcher roots: {} ({})",
                        err,
                        root.display()
                    );
                    watcher_state.set_runtime_error(Some(message.clone()));
                    message
                })?;
        }

        self.debouncer = Some(debouncer);
        watcher_state.set_watched_roots(&root_plan.valid_roots);
        watcher_state.set_runtime_error(if root_plan.rejected_roots.is_empty() {
            None
        } else {
            Some(format!(
                "Rejected watcher roots: {}",
                format_paths(&root_plan.rejected_roots)
            ))
        });

        Ok(())
    }
}

#[derive(Default)]
struct RuntimeWatcherRootPlan {
    valid_roots: Vec<PathBuf>,
    rejected_roots: Vec<PathBuf>,
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

fn plan_runtime_watched_roots(roots: &[PathBuf]) -> RuntimeWatcherRootPlan {
    let mut plan = RuntimeWatcherRootPlan::default();

    for root in roots {
        if root.as_os_str().is_empty() || is_dangerous_root(root.as_path()) {
            plan.rejected_roots.push(normalize_path(root.as_path()));
            continue;
        }

        let candidate = match root.canonicalize() {
            Ok(canonicalized) => normalize_path(&canonicalized),
            Err(_) => normalize_path(root.as_path()),
        };

        if candidate.as_os_str().is_empty() || !candidate.is_absolute() || !candidate.is_dir() {
            plan.rejected_roots.push(candidate);
            continue;
        }

        if is_dangerous_root(candidate.as_path()) {
            plan.rejected_roots.push(candidate);
            continue;
        }

        plan.valid_roots.push(candidate);
    }

    plan.valid_roots = dedupe_overlapping_roots(&plan.valid_roots);
    plan.rejected_roots = dedupe_exact_paths(&plan.rejected_roots);
    plan
}

pub fn handle_debounced_event_result<F>(
    watcher_state: &mut WatcherCoordinatorState,
    scan_phase: ScanPhase,
    result: DebounceEventResult,
    launch_scan: F,
) -> Result<WatcherRuntimeOutcome, String>
where
    F: FnOnce(Vec<PathBuf>) -> Result<(), String>,
{
    handle_debounced_event_result_at(watcher_state, scan_phase, result, now_ms(), launch_scan)
}

pub fn handle_debounced_event_result_at<F>(
    watcher_state: &mut WatcherCoordinatorState,
    scan_phase: ScanPhase,
    result: DebounceEventResult,
    triggered_at_ms: i64,
    launch_scan: F,
) -> Result<WatcherRuntimeOutcome, String>
where
    F: FnOnce(Vec<PathBuf>) -> Result<(), String>,
{
    match result {
        Err(errors) => {
            let observed_paths = observed_paths_from_errors(&errors);
            watcher_state.set_last_trigger(triggered_at_ms, errors.len(), &observed_paths, &[]);
            watcher_state.set_runtime_error(Some(format_notify_errors(&errors)));
            Ok(WatcherRuntimeOutcome::DiagnosticOnly)
        }
        Ok(events) => {
            let observed_paths = observed_paths_from_events(&events);
            if events
                .iter()
                .any(|event| event.need_rescan() || event.paths.is_empty())
            {
                watcher_state.set_last_trigger(triggered_at_ms, events.len(), &observed_paths, &[]);
                watcher_state.set_runtime_error(Some(
                    "watcher runtime dropped malformed debounced event batch".to_string(),
                ));
                return Ok(WatcherRuntimeOutcome::DiagnosticOnly);
            }

            let mut dirty_roots = Vec::new();
            let mut runtime_diagnostics = Vec::new();

            for event in &events {
                if matches!(event.kind, EventKind::Access(_)) {
                    continue;
                }

                for observed_path in &event.paths {
                    match classify_watcher_path(
                        &watcher_state.watched_roots,
                        observed_path.clone(),
                        watcher_event_path_kind(observed_path),
                    ) {
                        WatcherClassification::DirtyRoots { canonical_roots } => {
                            dirty_roots.extend(canonical_roots);
                        }
                        WatcherClassification::Ignored { .. } => {}
                        WatcherClassification::Diagnostic { observed_path, .. } => {
                            runtime_diagnostics.push(format!(
                                "watcher ignored dangerous event path: {}",
                                observed_path.display()
                            ));
                        }
                    }
                }
            }

            let dirty_roots = dedupe_overlapping_roots(&dirty_roots);
            watcher_state.set_last_trigger(
                triggered_at_ms,
                events.len(),
                &observed_paths,
                &dirty_roots,
            );
            watcher_state.set_runtime_error(
                (!runtime_diagnostics.is_empty()).then(|| runtime_diagnostics.join("; ")),
            );

            if dirty_roots.is_empty() {
                return Ok(if runtime_diagnostics.is_empty() {
                    WatcherRuntimeOutcome::Ignored
                } else {
                    WatcherRuntimeOutcome::DiagnosticOnly
                });
            }

            let action = watcher_state.schedule_dirty_roots_at(
                scan_phase,
                &dirty_roots,
                triggered_at_ms,
                launch_scan,
            )?;

            Ok(WatcherRuntimeOutcome::Scheduled(action))
        }
    }
}

fn watcher_event_path_kind(path: &Path) -> LibraryPathKind {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => LibraryPathKind::Directory,
        Ok(_) => LibraryPathKind::File,
        Err(_) => LibraryPathKind::Unknown,
    }
}

fn observed_paths_from_events(events: &[DebouncedEvent]) -> Vec<PathBuf> {
    let mut observed_paths = Vec::new();
    for event in events {
        observed_paths.extend(event.paths.iter().cloned());
    }
    dedupe_exact_paths(&observed_paths)
}

fn observed_paths_from_errors(errors: &[notify_debouncer_full::notify::Error]) -> Vec<PathBuf> {
    let mut observed_paths = Vec::new();
    for error in errors {
        observed_paths.extend(error.paths.iter().cloned());
    }
    dedupe_exact_paths(&observed_paths)
}

fn format_notify_errors(errors: &[notify_debouncer_full::notify::Error]) -> String {
    errors
        .iter()
        .map(|error| {
            if error.paths.is_empty() {
                error.to_string()
            } else {
                format!("{} ({})", error, format_paths(&error.paths))
            }
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn format_paths(paths: &[PathBuf]) -> String {
    let rendered = dedupe_exact_paths(paths)
        .into_iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();

    if rendered.is_empty() {
        "<none>".to_string()
    } else {
        rendered.join(", ")
    }
}

fn dedupe_exact_paths(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut deduped = Vec::new();

    for path in paths {
        if deduped.iter().any(|existing| existing == path) {
            continue;
        }

        deduped.push(path.clone());
    }

    deduped
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
    use notify_debouncer_full::{
        DebouncedEvent,
        notify::{
            Error as NotifyError, Event, EventKind,
            event::{CreateKind, ModifyKind},
        },
    };
    use std::{fs, path::PathBuf, time::Instant};
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

        let follow_up =
            state.handle_scan_terminal_at(ScanPhase::Completed, 30, |roots: Vec<PathBuf>| {
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

        let empty =
            state.schedule_dirty_roots_at(ScanPhase::Idle, &[], 10, |roots: Vec<PathBuf>| {
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
        assert_eq!(
            state.last_scheduler_error.as_deref(),
            Some("launcher failed")
        );

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

    #[test]
    fn watcher_runtime_schedules_dirty_roots_from_mutating_batches() {
        let tmp = TempDir::new().unwrap();
        let root_dir = tmp.path().join("music");
        fs::create_dir_all(root_dir.join("album")).unwrap();
        let track_path = root_dir.join("album").join("track.mp3");
        fs::write(&track_path, b"stub").unwrap();

        let canonical_root = root_dir.canonicalize().unwrap();
        let canonical_track = track_path.canonicalize().unwrap();
        let mut state = WatcherCoordinatorState::new();
        state.set_watched_roots(std::slice::from_ref(&canonical_root));
        let mut launches = Vec::new();

        let outcome = handle_debounced_event_result_at(
            &mut state,
            ScanPhase::Idle,
            Ok(vec![DebouncedEvent::new(
                Event::new(EventKind::Modify(ModifyKind::Any)).add_path(canonical_track.clone()),
                Instant::now(),
            )]),
            50,
            |roots: Vec<PathBuf>| {
                launches.push(roots.clone());
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(
            outcome,
            WatcherRuntimeOutcome::Scheduled(WatcherScheduleAction::Launched)
        );
        assert_eq!(launches, vec![vec![canonical_root.clone()]]);
        assert_eq!(
            state.last_trigger,
            Some(WatcherTriggerMetadata {
                triggered_at_ms: 50,
                event_count: 1,
                observed_paths: vec![canonical_track],
                dirty_roots: vec![canonical_root],
            })
        );
        assert_eq!(state.last_runtime_error, None);
    }

    #[test]
    fn watcher_runtime_ignores_hidden_noise_and_outside_paths() {
        let tmp = TempDir::new().unwrap();
        let root_dir = tmp.path().join("music");
        let hidden_dir = root_dir.join(".hidden");
        let noise_dir = root_dir.join("node_modules");
        let outside_dir = tmp.path().join("outside");
        fs::create_dir_all(&hidden_dir).unwrap();
        fs::create_dir_all(&noise_dir).unwrap();
        fs::create_dir_all(&outside_dir).unwrap();

        let canonical_root = root_dir.canonicalize().unwrap();
        let hidden_path = hidden_dir.join("track.mp3");
        let noise_path = noise_dir.join("track.mp3");
        let outside_path = outside_dir.join("track.mp3");
        let mut state = WatcherCoordinatorState::new();
        state.set_watched_roots(std::slice::from_ref(&canonical_root));
        let mut launches = Vec::new();

        let outcome = handle_debounced_event_result_at(
            &mut state,
            ScanPhase::Idle,
            Ok(vec![
                DebouncedEvent::new(
                    Event::new(EventKind::Create(CreateKind::Any)).add_path(hidden_path.clone()),
                    Instant::now(),
                ),
                DebouncedEvent::new(
                    Event::new(EventKind::Create(CreateKind::Any)).add_path(noise_path.clone()),
                    Instant::now(),
                ),
                DebouncedEvent::new(
                    Event::new(EventKind::Create(CreateKind::Any)).add_path(outside_path.clone()),
                    Instant::now(),
                ),
            ]),
            60,
            |roots: Vec<PathBuf>| {
                launches.push(roots);
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(outcome, WatcherRuntimeOutcome::Ignored);
        assert!(launches.is_empty());
        assert_eq!(
            state.last_trigger,
            Some(WatcherTriggerMetadata {
                triggered_at_ms: 60,
                event_count: 3,
                observed_paths: vec![hidden_path, noise_path, outside_path],
                dirty_roots: Vec::new(),
            })
        );
        assert_eq!(state.last_runtime_error, None);
    }

    #[test]
    fn watcher_runtime_marks_malformed_batches_as_diagnostic_only() {
        let tmp = TempDir::new().unwrap();
        let root_dir = tmp.path().join("music");
        fs::create_dir_all(&root_dir).unwrap();

        let canonical_root = root_dir.canonicalize().unwrap();
        let mut state = WatcherCoordinatorState::new();
        state.set_watched_roots(std::slice::from_ref(&canonical_root));
        let mut launches = Vec::new();

        let outcome = handle_debounced_event_result_at(
            &mut state,
            ScanPhase::Idle,
            Ok(vec![DebouncedEvent::new(
                Event::new(EventKind::Modify(ModifyKind::Any)),
                Instant::now(),
            )]),
            70,
            |roots: Vec<PathBuf>| {
                launches.push(roots);
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(outcome, WatcherRuntimeOutcome::DiagnosticOnly);
        assert!(launches.is_empty());
        assert_eq!(
            state.last_trigger,
            Some(WatcherTriggerMetadata {
                triggered_at_ms: 70,
                event_count: 1,
                observed_paths: Vec::new(),
                dirty_roots: Vec::new(),
            })
        );
        assert!(
            state
                .last_runtime_error
                .as_deref()
                .unwrap_or_default()
                .contains("malformed debounced event batch")
        );
    }

    #[test]
    fn watcher_runtime_records_backend_errors_without_scheduling() {
        let tmp = TempDir::new().unwrap();
        let root_dir = tmp.path().join("music");
        fs::create_dir_all(&root_dir).unwrap();

        let canonical_root = root_dir.canonicalize().unwrap();
        let mut state = WatcherCoordinatorState::new();
        state.set_watched_roots(std::slice::from_ref(&canonical_root));
        let mut launches = Vec::new();

        let outcome = handle_debounced_event_result_at(
            &mut state,
            ScanPhase::Idle,
            Err(vec![
                NotifyError::generic("backend failed").add_path(canonical_root.clone()),
            ]),
            80,
            |roots: Vec<PathBuf>| {
                launches.push(roots);
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(outcome, WatcherRuntimeOutcome::DiagnosticOnly);
        assert!(launches.is_empty());
        assert_eq!(
            state.last_trigger,
            Some(WatcherTriggerMetadata {
                triggered_at_ms: 80,
                event_count: 1,
                observed_paths: vec![canonical_root],
                dirty_roots: Vec::new(),
            })
        );
        assert!(
            state
                .last_runtime_error
                .as_deref()
                .unwrap_or_default()
                .contains("backend failed")
        );
    }

    #[test]
    fn watcher_runtime_refresh_replaces_registered_roots() {
        let tmp = TempDir::new().unwrap();
        let first_dir = tmp.path().join("music-a");
        let second_dir = tmp.path().join("music-b");
        fs::create_dir_all(&first_dir).unwrap();
        fs::create_dir_all(&second_dir).unwrap();

        let first_root = first_dir.canonicalize().unwrap();
        let second_root = second_dir.canonicalize().unwrap();
        let mut state = WatcherCoordinatorState::new();
        let mut runtime = LibraryWatcherRuntime::new();

        runtime
            .refresh_roots(&mut state, std::slice::from_ref(&first_root), |_result| {})
            .unwrap();
        assert_eq!(state.watched_roots, vec![first_root.clone()]);
        assert!(runtime.is_registered());

        runtime
            .refresh_roots(&mut state, std::slice::from_ref(&second_root), |_result| {})
            .unwrap();

        assert_eq!(state.watched_roots, vec![second_root]);
        assert_eq!(state.last_runtime_error, None);
        assert!(runtime.is_registered());
    }

    #[test]
    fn watcher_runtime_refresh_preserves_previous_roots_on_registration_failure() {
        let tmp = TempDir::new().unwrap();
        let watched_dir = tmp.path().join("music");
        let missing_dir = tmp.path().join("missing");
        fs::create_dir_all(&watched_dir).unwrap();
        fs::create_dir_all(&missing_dir).unwrap();

        let watched_root = watched_dir.canonicalize().unwrap();
        let missing_root = missing_dir.canonicalize().unwrap();
        fs::remove_dir_all(&missing_dir).unwrap();

        let mut state = WatcherCoordinatorState::new();
        let mut runtime = LibraryWatcherRuntime::new();
        runtime
            .refresh_roots(
                &mut state,
                std::slice::from_ref(&watched_root),
                |_result| {},
            )
            .unwrap();

        let err = runtime
            .refresh_roots(
                &mut state,
                std::slice::from_ref(&missing_root),
                |_result| {},
            )
            .unwrap_err();

        assert!(err.contains("Failed to refresh watcher roots"));
        assert_eq!(state.watched_roots, vec![watched_root]);
        assert!(
            state
                .last_runtime_error
                .as_deref()
                .unwrap_or_default()
                .contains("missing")
        );
        assert!(runtime.is_registered());
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
