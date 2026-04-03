#![allow(dead_code)]

use std::path::{Path, PathBuf};

use super::{
    LibraryPathKind, LibraryPathVisibility, classify_library_path, dedupe_overlapping_roots,
    is_dangerous_root, normalize_path,
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
