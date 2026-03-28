#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, atomic::AtomicBool};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanPhase {
    Idle,
    Running,
    Cancelling,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanErrorKind {
    InvalidPath,
    Walk,
    ReadMetadata,
    Persist,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanErrorSample {
    pub path: String,
    pub message: String,
    pub kind: ScanErrorKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanStatus {
    pub phase: ScanPhase,
    pub started_at_ms: Option<i64>,
    pub ended_at_ms: Option<i64>,
    pub current_path: Option<String>,
    pub processed_files: u64,
    pub inserted_tracks: u64,
    pub error_count: u64,
    pub sample_errors: Vec<ScanErrorSample>,
}

pub struct LibraryScanState {
    pub status: ScanStatus,
    pub cancel_flag: Arc<AtomicBool>,
}

impl LibraryScanState {
    pub fn new_idle() -> Self {
        Self {
            status: ScanStatus {
                phase: ScanPhase::Idle,
                started_at_ms: None,
                ended_at_ms: None,
                current_path: None,
                processed_files: 0,
                inserted_tracks: 0,
                error_count: 0,
                sample_errors: Vec::new(),
            },
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn normalize_root(root: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in root.components() {
        match component {
            Component::CurDir => {}
            other => normalized.push(other.as_os_str()),
        }
    }

    normalized
}

pub fn dedupe_overlapping_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut sorted: Vec<PathBuf> = roots.iter().map(|r| normalize_root(r)).collect();
    sorted.sort_by_key(|p| p.components().count());

    let mut kept: Vec<PathBuf> = Vec::new();
    for root in sorted {
        // Always dedupe exact duplicates, regardless of dangerousness.
        if kept.iter().any(|k| k == &root) {
            continue;
        }

        // Only treat a kept root as covering a descendant if it's not dangerous.
        if kept
            .iter()
            .any(|k| !is_dangerous_root(k.as_path()) && root.starts_with(k))
        {
            continue;
        }

        kept.push(root);
    }

    kept
}

pub fn is_dangerous_root(path: &Path) -> bool {
    // Reject unnormalized / potentially bypassing inputs.
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return true;
    }

    // exact match
    if path == Path::new("/") {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        if path == Path::new("/Volumes") {
            return true;
        }

        // prefix / descendant reject
        for banned in ["/System", "/Library", "/Applications"] {
            if path.starts_with(banned) {
                return true;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for banned in ["/proc", "/sys", "/dev"] {
            if path.starts_with(banned) {
                return true;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // 盘符根目录：例如 C:\\ （Prefix + RootDir 且没有后续 Normal 组件）
        let mut comps = path.components();
        if matches!(
            (comps.next(), comps.next(), comps.next()),
            (Some(Component::Prefix(_)), Some(Component::RootDir), None)
        ) {
            return true;
        }

        // prefix reject（MVP 先覆盖 C:\\Windows）
        if path.starts_with(Path::new("C:\\Windows")) {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn dedupe_roots_drops_descendants() {
        let roots = vec![PathBuf::from("/music"), PathBuf::from("/music/sub")];
        let deduped = dedupe_overlapping_roots(&roots);
        assert_eq!(deduped, vec![PathBuf::from("/music")]);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn dedupe_roots_keeps_descendant_when_ancestor_is_dangerous() {
        let roots = vec![
            PathBuf::from("/Volumes"),
            PathBuf::from("/Volumes/MyDisk/Music"),
        ];
        let deduped = dedupe_overlapping_roots(&roots);
        assert_eq!(
            deduped,
            vec![
                PathBuf::from("/Volumes"),
                PathBuf::from("/Volumes/MyDisk/Music")
            ]
        );
    }

    #[test]
    fn parent_dir_component_is_dangerous() {
        let path = PathBuf::from("music").join("..").join("secret");
        assert!(is_dangerous_root(&path));
    }

    #[test]
    fn macos_dangerous_root_rules() {
        #[cfg(target_os = "macos")]
        {
            use std::path::Path;

            assert!(is_dangerous_root(Path::new("/")));
            assert!(is_dangerous_root(Path::new("/System")));
            assert!(is_dangerous_root(Path::new("/Library")));
            assert!(is_dangerous_root(Path::new("/Applications")));

            // exact match 拒绝：只拒绝 /Volumes 根本身
            assert!(is_dangerous_root(Path::new("/Volumes")));
            assert!(!is_dangerous_root(Path::new("/Volumes/MyDisk/Music")));
        }
    }
}
