# 扫描流程产品化（Issue #15）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将库扫描从同步黑盒调用升级为「可观察进度（无总量）/可取消/有错误摘要/多路径去重/默认忽略隐藏项与噪音目录」的 MVP 流程，并在扫描期间对库操作进行锁定提示。

**Architecture:** 后端新增 `ScanState`（独立于 `library` Mutex），通过 3 个 Tauri commands（start/status/cancel）启动后台扫描线程并轮询获取状态；扫描线程持有 `library` 锁执行流式遍历（不 follow symlink）、支持取消、汇总错误样本，并对重叠 root 与文件路径做去重。前端新增 tauri/mock API、scan store（setInterval 轮询）、SettingsView 展示扫描状态并提供取消按钮，AppShell 在 autoScan 时复用同一套命令并在终态后刷新库。

**Tech Stack:** Rust + Tauri 2 + rusqlite + walkdir；Svelte 5 + TypeScript + Vitest + @testing-library/svelte + svelte-check。

---

## File/Module Map（先锁定边界）

### Backend (Rust)
- **Modify:** `src-tauri/src/lib.rs`
  - `AppState` 增加 `library_scan: Arc<Mutex<LibraryScanState>>`
  - 注册新 commands：`start_library_scan` / `get_library_scan_status` / `cancel_library_scan`
- **Modify:** `src-tauri/src/api/library/mod.rs`
  - 新增 3 个 commands，调用 `AppState.library_scan`，并在后台线程中锁住 `AppState.library` 执行扫描
- **Create:** `src-tauri/src/services/library/scan.rs`
  - `ScanPhase` / `ScanErrorKind` / `ScanErrorSample` / `ScanStatus`
  - `LibraryScanState`（包含 `status` + `cancel_flag`）
  - root 规范化 + 去重（包含“重叠路径去重”）
  - entry 忽略规则（隐藏项、噪音目录）
- **Modify:** `src-tauri/src/services/library/mod.rs`
  - 将扫描逻辑重构为流式遍历（不 collect、不 follow_links）
  - 新增可控扫描入口：多 root + 去重 HashSet + cancel flag + status sink
  - 维持 DB 幂等：`tracks.file_path UNIQUE`（重复扫描只 UPDATE，不重复插入）

### Frontend (Svelte/TS)
- **Modify:** `src/lib/types.ts`
  - 新增扫描相关类型（ScanPhase/ScanStatus/ScanErrorSample 等）
- **Modify:** `src/lib/api/tauri/library.ts`
  - 新增：`startLibraryScan` / `getLibraryScanStatus` / `cancelLibraryScan`
- **Modify:** `src/lib/api/mock/library.ts`
  - 新增同名函数（web 模式下返回稳定的 Completed/Idle 模拟状态）
- **Modify:** `src/lib/api/library.ts`
  - export 透传上述新函数
- **Create:** `src/lib/features/library-scan/store.ts`
  - scan store（轮询 status、start/cancel、终态停止轮询但保留摘要）
- **Modify:** `src/App.svelte`
  - 从 appShell 解构并传递 `scanStatus/isScanning/runLibraryScan/cancelLibraryScan` 给 `SettingsView`
- **Modify:** `src/lib/views/SettingsView.svelte`
  - “Rescan Now” 改为调用父组件注入的 `runLibraryScan(libraryPaths)`（确保全局扫描状态一致）
  - 展示扫描面板（phase/currentPath/processed/inserted/errors/sampleErrors 摘要）
  - 取消按钮：调用父组件注入的 `cancelLibraryScan()`
  - 扫描终态后触发 `dispatch('refreshLibrary')`（由 AppShell 执行 `loadLibrary()`）
- **Modify:** `src/lib/features/app-shell/store.ts`
  - 创建**单例** scan store（`createLibraryScanStore`），并暴露：`scanStatus` / `isScanning`
  - 提供 `runLibraryScan(paths)`：开始扫描 + 等待终态（用于 autoScan 与 Settings 手动扫描）
  - autoScan 改为调用 `runLibraryScan`，扫描 Running/Cancelling 期间置 `isLibraryLoading=true`（锁定提示）

### Tests
- **Modify:** `src/tests/app-shell.test.ts`
  - 更新 bootstrap 测试：从 `scanDirectory` 改为 start/status（或 `runLibraryScan`）
- **Modify:** `src/tests/app-shell-wiring.test.ts`
  - 若 `App.svelte` 需要向 `SettingsView` 传 scan props，需补齐 mock store 字段以避免解构失败
- **Modify:** `src/tests/api-adapter-selection.test.ts`
  - libraryStub 增加新函数，避免 module stub 缺 export
- **Modify:** `src/tests/tauri-library-bridge.test.ts`
  - 覆盖新命令的 invoke payload
- **Create:** `src/tests/library-scan-store.test.ts`
  - 覆盖 scan store：轮询、终态停止、cancel 调用
- **(Optional, if UI 需要更强保障):** `src/tests/settings-library-scan-ui.test.ts`
  - SettingsView 的 Rescan/Cancel/摘要渲染（可在最后再决定是否需要）

---

## Task 0: 创建实现 worktree（隔离开发环境）

**Files:** none

- [ ] **Step 1: 创建 worktree 与分支**

Run:
```bash
git fetch origin
git worktree add .worktrees/issue-15-library-scan origin/main -b issue-15-library-scan
```

Expected: worktree list 中出现新目录。

- [ ] **Step 2: 在 worktree 中跑基线验证**

Run:
```bash
cd .worktrees/issue-15-library-scan
cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture
npm --prefix ./src run test
npm --prefix ./src run check
```

Expected: Rust 38 passed；Vitest 127 passed；svelte-check 0 errors。

---

## Task 1: 后端 ScanStatus/ScanState 数据结构（独立于 library 锁）

**Files:**
- Create: `src-tauri/src/services/library/scan.rs`
- Modify: `src-tauri/src/services/library/mod.rs` (declare submodule)

- [ ] **Step 1: 写 failing tests（root 去重 + 重叠去重）**

Create/extend `src-tauri/src/services/library/scan.rs` test module：
```rust
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
}
```

Expected: FAIL（函数不存在）。

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml services::library::scan::tests::dedupe_roots_drops_descendants -- --nocapture
```

Expected: compilation error / missing symbol.

- [ ] **Step 3: 实现最小通过：root 规范化 + 重叠去重函数**

In `scan.rs`:
```rust
pub fn dedupe_overlapping_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
  let mut sorted: Vec<PathBuf> = roots.to_vec();
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
```

- [ ] **Step 4: 重新跑测试确认通过**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml services::library::scan::tests::dedupe_roots_drops_descendants -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: 写 failing tests：危险/系统路径识别规则（exact/prefix）**

在 `src-tauri/src/services/library/scan.rs` 的 tests 模块里追加（用 `cfg` 保证跨平台可编译）：
```rust
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
```

Expected: FAIL（`is_dangerous_root` 尚未实现）。

- [ ] **Step 6: 实现 `is_dangerous_root()` helper（按 spec exact/prefix 规则）**

In `scan.rs`:
```rust
use std::path::Path;

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
    use std::path::Component;

    // 盘符根目录：例如 C:\\ （Prefix + RootDir 且没有后续 Normal 组件）
    let mut comps = path.components();
    if matches!(
      (comps.next(), comps.next(), comps.next()),
      (Some(Component::Prefix(_)), Some(Component::RootDir), None)
    ) {
      return true;
    }

    // prefix reject（MVP 先覆盖 C:\\Windows）
    if path.starts_with(Path::new("C:\\\\Windows")) {
      return true;
    }
  }

  false
}
```

- [ ] **Step 7: 定义 ScanPhase/ScanErrorKind/ScanStatus/LibraryScanState（带 serde rename）**

In `scan.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::sync::{Arc, atomic::AtomicBool};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanPhase { Idle, Running, Cancelling, Completed, Cancelled, Failed }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanErrorKind { InvalidPath, Walk, ReadMetadata, Persist }

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
```

- [ ] **Step 8: 在 `services/library/mod.rs` 声明子模块**

Add near top:
```rust
mod scan;
pub use scan::*;
```

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/services/library/mod.rs src-tauri/src/services/library/scan.rs
git commit -m "feat(library-scan): add scan status model and validation helpers"
```

---

## Task 2: 后端：新增 3 个 Tauri commands（start/status/cancel）与 AppState 挂载

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/api/library/mod.rs`

- [ ] **Step 1: 写 failing test：AppState 初始化包含 scan state**

Update `src-tauri/src/lib.rs` tests:
```rust
#[test]
fn app_state_initializes() {
  let state = AppState::initialize().expect("app state should initialize");
  assert!(state.library_scan.try_lock().is_ok());
}
```

Expected: FAIL（字段不存在）。

- [ ] **Step 2: 实现 AppState 新字段 + initialize**

In `src-tauri/src/lib.rs`:
```rust
pub struct AppState {
  pub audio: Arc<Mutex<services::audio::AudioService>>,
  pub library: Arc<Mutex<services::library::LibraryService>>,
  pub playlists: Arc<Mutex<services::playlist::PlaylistService>>,
  pub library_scan: Arc<Mutex<services::library::LibraryScanState>>,
}
```

Initialize:
```rust
library_scan: Arc::new(Mutex::new(services::library::LibraryScanState::new_idle())),
```

> 在 `scan.rs` 提供 `new_idle()`：phase=Idle、计数清零、cancel_flag=false。

- [ ] **Step 3: 在 `api/library/mod.rs` 添加命令壳（先让编译通过）**

Add:
```rust
#[tauri::command]
pub async fn get_library_scan_status(state: State<'_, AppState>) -> Result<ScanStatus, String> { ... }

#[tauri::command]
pub async fn cancel_library_scan(state: State<'_, AppState>) -> Result<(), String> { ... }

#[tauri::command]
pub async fn start_library_scan(paths: Vec<PathBuf>, state: State<'_, AppState>) -> Result<(), String> { ... }
```

暂时实现为：锁 `library_scan` 返回/修改状态（不启动线程），使之可编译。

- [ ] **Step 4: 在 `src-tauri/src/lib.rs` 注册新 commands**

Add to `generate_handler![]` near library commands:
```rust
crate::api::library::start_library_scan,
crate::api::library::get_library_scan_status,
crate::api::library::cancel_library_scan,
```

- [ ] **Step 5: 跑 Rust tests（编译 + 现有测试）**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/api/library/mod.rs src-tauri/src/services/library/scan.rs
git commit -m "feat(library-scan): add tauri commands and app state wiring"
```

---

## Task 3: 后端：实现后台扫描线程（流式遍历 / 去重 / 忽略 / 取消 / 错误摘要）

**Files:**
- Modify: `src-tauri/src/api/library/mod.rs`
- Modify: `src-tauri/src/services/library/mod.rs`
- Modify: `src-tauri/src/services/library/scan.rs`

- [ ] **Step 1: 写 failing Rust tests：忽略隐藏项（不计入 processed_files）**

在 `src-tauri/src/services/library/mod.rs` 的 tests 增加：
```rust
#[test]
fn scan_skips_hidden_entries() {
  use tempfile::tempdir;
  let dir = tempdir().unwrap();
  std::fs::create_dir(dir.path().join(".hidden")).unwrap();
  std::fs::write(dir.path().join(".hidden").join("a.mp3"), b"").unwrap();
  std::fs::write(dir.path().join("b.mp3"), b"").unwrap();

  let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

  let mut svc = LibraryService::new_with_path_for_tests(dir.path().join("lib.sqlite")).unwrap();
  let summary = svc.scan_roots_with_control(&[dir.path().to_path_buf()], &cancel, 20, |_| {}).unwrap();

  assert_eq!(summary.processed_files, 1);
  assert_eq!(summary.error_count, 1);
}
```

Expected: FAIL（helper/new methods 未实现）。

> 说明：本测试使用空 mp3 文件触发 ReadMetadata 错误，验证 processed_files 口径与隐藏项 prune。

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml services::library::tests::scan_skips_hidden_entries -- --nocapture
```

Expected: FAIL.

- [ ] **Step 3: 在 LibraryService 增加可控扫描入口（多 root + status sink + cancel）**

在 `src-tauri/src/services/library/mod.rs` 增加（示意签名，可按实现调整）：
```rust
pub struct ScanSummary {
  pub processed_files: u64,
  pub inserted_tracks: u64,
  pub error_count: u64,
  pub sample_errors: Vec<ScanErrorSample>,
}

pub struct ScanProgress {
  pub current_path: Option<String>,
  pub processed_files: u64,
  pub inserted_tracks: u64,
  pub error_count: u64,
  pub sample_errors_len: usize,
}

impl LibraryService {
  pub fn scan_roots_with_control<F>(
    &mut self,
    roots: &[PathBuf],
    cancel_flag: &Arc<AtomicBool>,
    sample_limit: usize,
    mut on_progress: F,
  ) -> Result<ScanSummary>
  where
    F: FnMut(&ScanProgress),
  {
    /* ... */
  }
}
```

实现要点（必须逐条覆盖）：
- `WalkDir::new(root).follow_links(false)`
- `filter_entry` prune：隐藏项 + 噪音目录（.git/node_modules/target）
- 仅对支持扩展名文件计入 `processed_files`（`is_supported_extension`）
- `HashSet<PathBuf>` 去重：重复文件 path 只处理一次
- 每个候选音频文件处理前检查 `cancel_flag.load(Ordering::SeqCst)`，若 true：停止遍历并 `tx.commit()`
- 每处理一个文件（或每 N 个文件）调用一次 `on_progress(&ScanProgress { ... })` 上报进度（**on_progress 内部只做短锁更新**）
- metadata 读取失败：`error_count += 1`，`sample_errors.push(...)`（<= sample_limit）

- [ ] **Step 4: 为测试提供 `new_with_path_for_tests`（仅 cfg(test)）**

在 `LibraryService` impl 中增加：
```rust
#[cfg(test)]
pub fn new_with_path_for_tests(path: PathBuf) -> Result<Self> {
  let mut conn = Connection::open(path)?;
  initialize_schema(&mut conn)?;
  Ok(Self { conn })
}
```

- [ ] **Step 5: 追加 failing tests：错误摘要 cap + 文件级去重 + cancel**

在 `services/library/mod.rs` tests 继续加：
```rust
#[test]
fn scan_caps_error_samples() { /* 30 个空 mp3，error_count=30, sample_errors.len()==20 */ }

#[test]
fn scan_dedupes_overlapping_roots() { /* roots: [root, root/sub]，同一文件只算一次 */ }

#[test]
fn scan_honors_cancel_flag_and_commits_partial_work() { /* status sink 在 processed==1 时置 cancel */ }
```

- [ ] **Step 6: 实现 API 层后台线程（start/status/cancel 完整语义）**

在 `src-tauri/src/api/library/mod.rs`：
- `start_library_scan(paths, state)`：
  - 先锁 `library_scan`：
    - 若 `status.phase` 为 `Running` 或 `Cancelling`：直接 `return Err("Scan already running".to_string())`（防重入，符合 spec）。
    - reset 状态：计数清零、`sample_errors` 清空、`started_at_ms=now`、`ended_at_ms=None`、`current_path=None`，并将 `phase` 置为 `Running`。
    - `cancel_flag.store(false, Ordering::SeqCst)`。
  - 规范化 + 校验 + 去重 roots（调用 `scan.rs` helper）：
    - 尽量 `canonicalize`（失败则保留原 path）。
    - `exists && is_dir` 校验。
    - 危险路径过滤：`is_dangerous_root(&path)`（exact/prefix 规则按 spec）。
    - 对无效/危险路径：追加一次 `InvalidPath` 错误样本（计数 + 采样），并跳过该 path。
    - 重叠路径去重：`dedupe_overlapping_roots`（丢弃子路径）。
  - 若最终没有任何有效 roots：将 `phase` 置回 `Idle`（并可保留 `InvalidPath` 摘要供 UI 展示），然后 `return Err("No valid scan paths".to_string())`。
  - `std::thread::spawn(move || { ... })`：
    - **注意：先 clone Arc 再 move**（`let library = state.library.clone(); let scan = state.library_scan.clone();`），不要捕获 `State<'_, AppState>` 进线程（避免 `'static`/Send 编译问题）。
    - lock `library`
    - 调用 `scan_roots_with_control(..., |progress| { /* 短锁更新 scan.status */ })`
      - **重要：禁止长时间持有 `library_scan` 的 mutex**。必须做到每次更新都是 `lock → update → drop`，确保 `get_library_scan_status` 轮询与 `cancel_library_scan` 不被阻塞。
    - 结束时根据 cancel_flag 与结果设置 `phase=Completed/Cancelled/Failed` + `ended_at_ms=now`
- `get_library_scan_status`：只锁 `library_scan` 返回 clone（不得触碰 `state.library`）
- `cancel_library_scan`：
  - 若当前 `phase` 为 `Running`：将 `phase` 切为 `Cancelling` 并 `cancel_flag.store(true, Ordering::SeqCst)`
  - 若处于 `Idle/Completed/Cancelled/Failed`：no-op，返回 `Ok(())`（符合 spec）

- [ ] **Step 7: 跑 Rust 全量 tests**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/api/library/mod.rs src-tauri/src/services/library/mod.rs src-tauri/src/services/library/scan.rs
git commit -m "feat(library-scan): background scan with progress, cancel, ignore rules, dedupe, error summary"
```

---

## Task 4: 前端：补齐 tauri/mock API 与 adapter selection stubs

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api/tauri/library.ts`
- Modify: `src/lib/api/mock/library.ts`
- Modify: `src/lib/api/library.ts`
- Modify: `src/tests/api-adapter-selection.test.ts`
- Modify: `src/tests/tauri-library-bridge.test.ts`

- [ ] **Step 1: 写 failing tests：tauri bridge 覆盖新 invoke**

Extend `src/tests/tauri-library-bridge.test.ts`：
```ts
import { cancelLibraryScan, getLibraryScanStatus, startLibraryScan } from '../lib/api/tauri/library';

it('invokes start_library_scan with paths payload', async () => {
  invokeMock.mockResolvedValueOnce(undefined);
  await expect(startLibraryScan(['/music'])).resolves.toBeUndefined();
  expect(invokeMock).toHaveBeenCalledWith('start_library_scan', { paths: ['/music'] });
});
```

Expected: FAIL（函数不存在）。

- [ ] **Step 2: 实现 tauri API wrappers**

In `src/lib/api/tauri/library.ts`（记得补齐 `import type { ScanStatus } from '../../types'`）：
```ts
export async function startLibraryScan(paths: string[]): Promise<void> {
  await invoke('start_library_scan', { paths });
}

export async function getLibraryScanStatus(): Promise<ScanStatus> {
  return invoke<ScanStatus>('get_library_scan_status');
}

export async function cancelLibraryScan(): Promise<void> {
  await invoke('cancel_library_scan');
}
```

并在 `types.ts` 增加类型：
```ts
export type ScanPhase = 'idle'|'running'|'cancelling'|'completed'|'cancelled'|'failed';
export type ScanErrorKind = 'invalid_path'|'walk'|'read_metadata'|'persist';
export interface ScanErrorSample { path: string; message: string; kind: ScanErrorKind; }
export interface ScanStatus { phase: ScanPhase; started_at_ms?: number|null; ended_at_ms?: number|null; current_path?: string|null; processed_files: number; inserted_tracks: number; error_count: number; sample_errors: ScanErrorSample[]; }
```

- [ ] **Step 3: mock 侧实现最小稳定行为**

In `src/lib/api/mock/library.ts`：
- `startLibraryScan`：立即将内部状态置为 completed
- `getLibraryScanStatus`：返回 completed 状态（计数为 0）
- `cancelLibraryScan`：no-op

- [ ] **Step 4: adapter 入口导出新函数**

In `src/lib/api/library.ts`：
```ts
export const startLibraryScan = impl.startLibraryScan;
export const getLibraryScanStatus = impl.getLibraryScanStatus;
export const cancelLibraryScan = impl.cancelLibraryScan;
```

- [ ] **Step 5: 修复 adapter selection 测试 stubs**

在 `src/tests/api-adapter-selection.test.ts` 的 `libraryStub` 补齐：
```ts
startLibraryScan: vi.fn(),
getLibraryScanStatus: vi.fn(),
cancelLibraryScan: vi.fn(),
```

- [ ] **Step 6: 跑前端 tests**

Run:
```bash
npm --prefix ./src run test -- --run tests/tauri-library-bridge.test.ts tests/api-adapter-selection.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/api/tauri/library.ts src/lib/api/mock/library.ts src/lib/api/library.ts src/tests/tauri-library-bridge.test.ts src/tests/api-adapter-selection.test.ts
git commit -m "feat(library-scan): add frontend api surface for scan commands"
```

---

## Task 5: 前端：实现 library scan store（轮询 + 终态停止 + cancel）

**Files:**
- Create: `src/lib/features/library-scan/store.ts`
- Create: `src/tests/library-scan-store.test.ts`

- [ ] **Step 1: 写 failing store tests（fake timers）**

Create `src/tests/library-scan-store.test.ts`：
```ts
import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createLibraryScanStore } from '../lib/features/library-scan/store';

describe('library scan store', () => {
  it('polls until terminal status then stops', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const store = createLibraryScanStore({
      startLibraryScan: async () => { calls.push('start'); },
      getLibraryScanStatus: vi
        .fn()
        .mockResolvedValueOnce({ phase: 'running', processed_files: 1, inserted_tracks: 0, error_count: 0, sample_errors: [] })
        .mockResolvedValueOnce({ phase: 'completed', processed_files: 2, inserted_tracks: 0, error_count: 0, sample_errors: [] }),
    });

    await store.start(['/music']);
    await vi.advanceTimersByTimeAsync(500);

    expect(get(store.status).phase).toBe('completed');
    store.destroy();
    vi.useRealTimers();
  });
});
```

Expected: FAIL（store 不存在）。

- [ ] **Step 2: 实现 `createLibraryScanStore`**

In `src/lib/features/library-scan/store.ts`（示意结构）：
```ts
import { writable, derived } from 'svelte/store';
import * as libraryApi from '../../api/library';
import type { ScanStatus } from '../../types';

type Deps = {
  startLibraryScan: (paths: string[]) => Promise<void>;
  getLibraryScanStatus: () => Promise<ScanStatus>;
  cancelLibraryScan: () => Promise<void>;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
};

function defaultDeps(): Deps {
  return {
    startLibraryScan: libraryApi.startLibraryScan,
    getLibraryScanStatus: libraryApi.getLibraryScanStatus,
    cancelLibraryScan: libraryApi.cancelLibraryScan,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
}

const terminal = new Set(['completed','cancelled','failed'] as const);

export function createLibraryScanStore(overrides: Partial<Deps> = {}) {
  const deps = { ...defaultDeps(), ...overrides } as Deps;
  const status = writable<ScanStatus>({ phase: 'idle', processed_files: 0, inserted_tracks: 0, error_count: 0, sample_errors: [] });
  const isScanning = derived(status, ($s) => $s.phase === 'running' || $s.phase === 'cancelling');

  let timer: ReturnType<typeof deps.setInterval> | null = null;

  async function pollOnce() {
    const next = await deps.getLibraryScanStatus();
    status.set(next);
    if (terminal.has(next.phase as never) && timer) {
      deps.clearInterval(timer);
      timer = null;
    }
  }

  async function start(paths: string[]) {
    await deps.startLibraryScan(paths);
    await pollOnce();
    if (!timer) {
      timer = deps.setInterval(() => { void pollOnce(); }, 250);
    }
  }

  async function cancel() {
    await deps.cancelLibraryScan();
    await pollOnce();
  }

  function destroy() {
    if (timer) deps.clearInterval(timer);
    timer = null;
  }

  return { status, isScanning, start, cancel, destroy };
}
```

- [ ] **Step 3: 跑 store tests**

Run:
```bash
npm --prefix ./src run test -- --run tests/library-scan-store.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/library-scan/store.ts src/tests/library-scan-store.test.ts
git commit -m "feat(library-scan): add polling scan store"
```

---

## Task 6: 前端：共享 scan store（全局锁定）+ Settings 扫描 UI + autoScan 调整

> 目标：确保**手动扫描**与 **autoScan** 共享同一套 scan 状态与锁定提示。

**Files:**
- Modify: `src/lib/features/app-shell/store.ts`
- Modify: `src/App.svelte`
- Modify: `src/lib/views/SettingsView.svelte`
- Modify: `src/tests/app-shell.test.ts`
- Modify: `src/tests/app-shell-wiring.test.ts`

- [ ] **Step 1: 扩展 AppShell store 依赖类型与 bootstrap 测试（先红）**

在 `src/lib/features/app-shell/store.ts` 的 `AppShellStoreDependencies` 增加：
```ts
startLibraryScan: (paths: string[]) => Promise<void>;
getLibraryScanStatus: () => Promise<ScanStatus>;
cancelLibraryScan: () => Promise<void>;
```

并更新 `tests/app-shell.test.ts`：
- 把原来的 `scanDirectory` stub 替换成 `startLibraryScan/getLibraryScanStatus/cancelLibraryScan`
- 让 `getLibraryScanStatus` 直接返回 `completed`（避免测试里处理真实轮询）

Expected: FAIL（实现未改）。

- [ ] **Step 2: 在 AppShell store 内创建单例 scan store，并提供 `runLibraryScan(paths)`**

在 `createAppShellStore()` 内：
- 创建 scan store（用 overrides 注入 deps，便于测试）：
  - `const scan = createLibraryScanStore({ startLibraryScan: deps.startLibraryScan, getLibraryScanStatus: deps.getLibraryScanStatus, cancelLibraryScan: deps.cancelLibraryScan })`
- 暴露给 UI：
  - `scanStatus`（store）
  - `isScanning`（store）
- 新增方法：
  - `runLibraryScan(paths): Promise<ScanStatus>`：
    1) `isLibraryLoading.set(true)`（全局锁定提示）
    2) `await scan.start(paths)`
    3) `await waitForTerminalStatus(scan.status)`（通过 subscribe 等待 phase 进入 completed/cancelled/failed）
    4) `isLibraryLoading.set(false)`
    5) return final status
  - `cancelLibraryScan(): Promise<void>`：直接代理到 `scan.cancel()`

> 注意：这样无论扫描由 Settings 触发还是 autoScan 触发，`isLibraryLoading` 都会在扫描期间为 true，从而达到“锁定并提示”。

- [ ] **Step 3: 修改 bootstrap：autoScan 改为调用 `runLibraryScan(restored.libraryPaths)`**

并在终态后继续走原有：`await loadLibrary(); await loadPlaylists();`

- [ ] **Step 4: 修改 `src/App.svelte`：把 scan props 传入 SettingsView**

示意：
```svelte
<SettingsView
  scanStatus={scanStatus}
  isScanning={isScanning}
  runLibraryScan={runLibraryScan}
  cancelLibraryScan={cancelLibraryScan}
  on:refreshLibrary={loadLibrary}
  on:refreshPlaylists={loadPlaylists}
/>
```

并同步更新 `src/tests/app-shell-wiring.test.ts` 的 mock store 字段，避免解构缺失。

- [ ] **Step 5: 修改 SettingsView：使用注入的 scan props（不再自己 new store）**

- Rescan Now：`await runLibraryScan(libraryPaths)`，然后 `dispatch('refreshLibrary')`
- Cancel：调用 `cancelLibraryScan()`
- 面板展示：从 `$scanStatus` 渲染 phase/currentPath/processed/inserted/errors/sampleErrors

- [ ] **Step 6: 跑前端 tests（关键集 + svelte-check）**

Run:
```bash
npm --prefix ./src run test -- --run tests/app-shell.test.ts tests/app-shell-wiring.test.ts tests/library-scan-store.test.ts
npm --prefix ./src run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/features/app-shell/store.ts src/App.svelte src/lib/views/SettingsView.svelte src/tests/app-shell.test.ts src/tests/app-shell-wiring.test.ts
git commit -m "feat(library-scan): share scan state across autoscan and settings"
```

---

## Task 7: 全量回归 + 关闭 #15

**Files:**
- (docs optional): 更新 issue #15 comment（引用验证命令）

- [ ] **Step 1: 全量验证**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture
npm --prefix ./src run test
npm --prefix ./src run check
```

Expected: all pass.

- [ ] **Step 2: 用 gh 更新 issue #15（合并后关闭）**

在 PR body 写 `Fixes #15`，合并后自动关闭。合并前在 issue 里补充验证命令（可选）。

---

## Notes / Guardrails
- 终态 `Failed` vs `Completed + error_count>0`：建议约定 `Failed` 只用于任务级致命错误（无法打开 DB / transaction commit 失败等），普通文件级错误用 `Completed` 并靠 `error_count` 表示。
- 多次扫描“去重”包含：root 重叠去重 + 单次扫描文件 path HashSet 去重 + DB file_path UNIQUE 幂等。
- 扫描线程会长时间持有 `library` Mutex：前端必须在扫描中锁定并提示，避免用户触发 get_tracks/search 导致卡顿无提示。
