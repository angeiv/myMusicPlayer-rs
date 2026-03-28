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

fn normalize_root(root: &PathBuf) -> PathBuf {
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
    let mut sorted: Vec<PathBuf> = roots.iter().map(normalize_root).collect();
    sorted.sort_by_key(|p| p.components().count());

    let mut kept: Vec<PathBuf> = Vec::new();
    for root in sorted {
        if kept.iter().any(|k| root.starts_with(k)) {
            continue;
        }

        if !kept.iter().any(|k| k == &root) {
            kept.push(root);
        }
    }

    kept
}

pub fn is_dangerous_root(path: &Path) -> bool {
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
