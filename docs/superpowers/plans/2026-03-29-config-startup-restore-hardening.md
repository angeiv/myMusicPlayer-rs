# 配置与启动恢复加固（Issue #17）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让应用在“配置缺失/损坏/旧字段/并发写入”情况下依然可稳定启动，并形成可验证的启动闭环：主题/扫描/音量/输出设备/播放模式 + last session（不自动播放，仅在用户点击播放且 stopped 时尝试恢复，失败自动清理）。

**Architecture:**
- **Backend（Rust）**：在 `AppState` 增加 `config_lock` 串行化 config 读写；`load_config` 在 JSON 解析失败时执行“备份（保留最近 5 份）→ 回退默认 → 写回新 config.json”；`save_config` 采用 best-effort 原子写（写 tmp 后 rename）。新增 `Config.play_mode` 字段并保持向后兼容。
- **Frontend（Svelte/TS）**：AppShell 只负责 theme/autoScan/libraryPaths；PlaybackStore 在 `start()` 时读取 config 并应用音频偏好（volume/output_device/play_mode），并在用户变更 play_mode/output_device 时写回 config（读-改-写）；Settings 保存配置时每次以 `getConfig()` 为 base，避免覆盖底栏刚写入的字段。

**Tech Stack:** Rust + Tauri 2 + serde_json；Svelte 5 + TypeScript + Vitest + svelte-check。

---

## Inputs / References

- Spec（已合并）：`docs/superpowers/specs/2026-03-29-config-startup-restore-hardening-design.md`
- Issue：#17 https://github.com/angeiv/myMusicPlayer-rs/issues/17
- 相关代码：
  - Backend: `src-tauri/src/api/config/mod.rs`, `src-tauri/src/models/mod.rs`, `src-tauri/src/lib.rs`
  - Frontend: `src/lib/features/app-shell/store.ts`, `src/lib/stores/playback.ts`, `src/lib/views/SettingsView.svelte`, `src/lib/api/mock/config.ts`
  - Tests: `src/tests/app-shell.test.ts`, `src/tests/playback-store.test.ts`, `src/tests/transport-config.test.ts`

---

## File/Module Map（先锁定边界）

### Backend (Rust)
- **Modify:** `src-tauri/src/models/mod.rs`
  - `Config` 增加 `play_mode: String`（默认 `"sequential"`，保持 `#[serde(default)]`）
- **Modify:** `src-tauri/src/lib.rs`
  - `AppState` 增加 `config_lock: Arc<Mutex<()>>`
  - `tests::app_state_initializes` 增加对 `config_lock` 的断言
- **Modify:** `src-tauri/src/api/config/mod.rs`
  - 所有涉及 config 的命令（get/save/set_last_session/paths add/remove/get_library_paths）在 load→write 路径上持有 `config_lock`
  - `load_config`：损坏 → 备份 `config.json.broken-<unix_ms>` → 写回默认 config.json → 清理旧备份（保留最近 5 份）
  - `save_config`：采用 best-effort 原子写（写 `config.json.tmp` 后 rename 覆盖）
  - 提供可测试的内部函数：`load_config_from_path(...)` / `save_config_to_path_atomic(...)` / `cleanup_broken_backups(...)`

### Frontend (Svelte/TS)
- **Modify:** `src/lib/types.ts`
  - `AppConfig` 增加 `play_mode?: string | null`
- **Modify:** `src/lib/api/mock/config.ts`
  - `defaultConfig` 增加 `play_mode: 'sequential'`
- **Modify:** `src/lib/features/app-shell/store.ts`
  - `bootstrap()` 不再应用 `default_volume/output_device_id`（避免与 PlaybackStore 并发竞态）
  - 保留 theme/autoScan/libraryPaths + scan + loadLibrary/loadPlaylists
- **Modify:** `src/lib/stores/playback.ts`
  - `start()`：先读取 config 并应用 `default_volume/output_device_id/play_mode`（成功与否都不阻塞启动）
  - 用户切换 shuffle/repeat 后写回 `play_mode`
  - 用户切换输出设备后写回 `output_device_id`
  - last session 恢复失败会自动清理 `setLastSession(null, 0)`
- **Modify:** `src/lib/views/SettingsView.svelte`
  - `saveConfig()` 每次以 `await getConfig()` 作为 base 组装 next config，避免覆盖底栏写入字段（尤其 play_mode）

### Tests
- **Modify:** `src/tests/app-shell.test.ts`
  - bootstrap ordering 断言：移除 `setOutputDevice/setVolume`，并确保 autoScan 失败不阻塞 load
- **Modify:** `src/tests/playback-store.test.ts`
  - `start()` 会应用 config 的音频偏好（setVolume/setOutputDevice/setPlayMode）
  - play_mode/output_device 持久化（saveConfig 的读-改-写模式）
  - last session 恢复失败会调用 setLastSession(null, 0)
- **Modify/Add:** `src/tests/transport-config.test.ts`
  - 新增：Settings 保存时的“base 字段保留”纯函数测试（保证 play_mode 不被覆盖）

---

## Task 0: 创建实现 worktree（隔离开发环境）

**Files:** none

- [ ] **Step 1: 创建 worktree 与分支**

Run:
```bash
git fetch origin
git worktree add .worktrees/issue-17-config-startup-restore origin/main -b issue-17-config-startup-restore
```

- [ ] **Step 2: 基线验证（确保 worktree 环境可跑）**

Run:
```bash
cd .worktrees/issue-17-config-startup-restore
just qa
```
Expected: PASS

---

## Task 1: Backend — Config.play_mode + AppState.config_lock 基础接线

**Files:**
- Modify: `src-tauri/src/models/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/lib.rs`（现有 test 模块扩展）

- [ ] **Step 1: 写一个失败的 Rust 单测：Config::default 包含 play_mode**

Add near `Config` in `src-tauri/src/models/mod.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::Config;

    #[test]
    fn default_config_includes_play_mode() {
        let config = Config::default();
        assert_eq!(config.play_mode, "sequential");
    }
}
```

- [ ] **Step 2: 运行单测确认失败**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml models::tests::default_config_includes_play_mode -- --nocapture
```
Expected: FAIL（字段不存在）

- [ ] **Step 3: 最小实现：给 Config 增加 play_mode 字段 + Default 值**

In `src-tauri/src/models/mod.rs`:
```rust
pub struct Config {
    // ... existing fields
    pub play_mode: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            // ... existing defaults
            play_mode: "sequential".to_string(),
        }
    }
}
```

- [ ] **Step 4: 运行单测确认通过**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml models::tests::default_config_includes_play_mode -- --nocapture
```
Expected: PASS

- [ ] **Step 5: 在 AppState 增加 config_lock，并扩展初始化测试**

In `src-tauri/src/lib.rs`:
```rust
pub struct AppState {
    // ... existing
    pub config_lock: Arc<Mutex<()>>,
}

impl AppState {
    fn initialize() -> anyhow::Result<Self> {
        Ok(Self {
            // ... existing
            config_lock: Arc::new(Mutex::new(())),
        })
    }
}

#[test]
fn app_state_initializes() {
    let state = AppState::initialize().expect("app state should initialize");
    assert!(state.config_lock.try_lock().is_ok());
}
```

- [ ] **Step 6: 运行 backend 全测**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/models/mod.rs src-tauri/src/lib.rs
git commit -m "feat(config): add play_mode and config lock"
```

---

## Task 2: Backend — config.json 损坏修复（备份+回退默认）+ 原子写 + 备份清理

**Files:**
- Modify: `src-tauri/src/api/config/mod.rs`
- Test: `src-tauri/src/api/config/mod.rs`（新增 #[cfg(test)] 单测，使用 tempfile）

> 目标：让 `get_config` 在解析失败时不返回 Err，而是“备份→回退默认→写回新 config.json”，并保留最近 5 份备份。

- [ ] **Step 1: 写失败测试：损坏 JSON 会被备份并修复**

Add in `src-tauri/src/api/config/mod.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn corrupt_config_is_backed_up_and_repaired() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, b"{not json").unwrap();

        let config = load_config_from_path(&path).expect("should repair and return default");
        assert_eq!(config.theme, "system");
        assert_eq!(config.play_mode, "sequential");

        // new config.json should be valid JSON
        let repaired = std::fs::read(&path).unwrap();
        let decoded: Config = serde_json::from_slice(&repaired).unwrap();
        assert_eq!(decoded.play_mode, "sequential");

        // backup exists
        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("config.json.broken-"))
            .collect();
        assert_eq!(backups.len(), 1);
    }
}
```

- [ ] **Step 1b: 写失败测试：config.json 不存在时返回 default（不报错）**

在同一个 tests module 里补一条用例（示意）：

```rust
#[test]
fn missing_config_returns_default() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("config.json");
    assert!(!path.exists());

    let config = load_config_from_path(&path).expect("missing file should return default");
    assert_eq!(config.play_mode, "sequential");
}
```

- [ ] **Step 2: 运行测试确认失败（函数尚不存在）**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml corrupt_config_is_backed_up_and_repaired -- --nocapture
```
Expected: FAIL

- [ ] **Step 3: 重构 config IO 为可测试函数（load/save/atomic）**

在 `src-tauri/src/api/config/mod.rs` 内部新增（示意）：
```rust
fn load_config_from_path(path: &Path) -> Result<Config, String> { /* ... */ }

fn save_config_to_path_atomic(path: &Path, config: &Config) -> Result<(), String> {
    /* write tmp then rename.
     * NOTE: On Windows, rename-over-existing may fail; best-effort fallback: remove existing file then rename.
     */
}

fn now_unix_ms() -> u128 { /* SystemTime::now() */ }

fn cleanup_broken_backups(dir: &Path, keep: usize) { /* best-effort */ }
```

并让现有 `load_config()` / `save_config_to_disk()` 调用这些内部函数。

注意：`load_config_from_path` 在 `path` 不存在时应直接返回 `Ok(Config::default())`（满足 Spec §9.1 的“缺失文件回退默认”）。

- [ ] **Step 4: 实现“解析失败→备份→回退默认→写回新文件→清理旧备份”路径**

实现要点（按 spec）：
- 备份命名：`config.json.broken-<unix_ms>`
- 清理策略：保留最近 5 份；排序优先解析文件名中的 `<unix_ms>`，失败回退 mtime
- 所有失败 best-effort：只 log，不阻塞返回

- [ ] **Step 5: 新增失败测试：备份超过 5 份会清理旧文件**

（示意）创建 7 个 `config.json.broken-<unix_ms>` 文件后调用 `cleanup_broken_backups(dir, 5)`，断言只剩 5 个。

- [ ] **Step 6: 运行 Rust 测试（含全量）**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture
```
Expected: PASS

- [ ] **Step 7: 将 config_lock 应用到所有 config 命令（串行化 load→write）**

将这些命令签名统一改为带 `state: State<'_, AppState>`，并在 load/write 路径上加锁：
- `get_config`
- `save_config`
- `set_last_session`
- `get_library_paths`
- `add_library_path`
- `remove_library_path`

注意：同文件内 `pick_and_add_library_folder()` 若直接调用 `add_library_path(...)`，在签名改为带 `State<'_, AppState>` 后会编译失败。
- 推荐做法：抽取一个内部 helper（例如 `add_library_path_inner(resolved: PathBuf)`）封装“锁+load→mutate→save”，供 command 与 pick flow 复用。

示例（poison best-effort）：
```rust
let _guard = state.config_lock.lock().map_err(|_| "config lock poisoned".to_string())?;
```
或采用 `poisoned.into_inner()`。

- [ ] **Step 8: 运行 clippy（-D warnings）**

Run:
```bash
cargo clippy --manifest-path ./src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/api/config/mod.rs
git commit -m "feat(config): repair corrupt config and atomically persist"
```

---

## Task 3: Frontend — AppConfig.play_mode + mock config 默认值

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api/mock/config.ts`
- Modify: `src/tests/playback-store.test.ts`（createConfig helper）

- [ ] **Step 1: 更新 AppConfig 类型**

In `src/lib/types.ts`:
```ts
export interface AppConfig {
  // ... existing
  play_mode?: string | null;
}
```

- [ ] **Step 2: 更新 mock config 的 defaultConfig**

In `src/lib/api/mock/config.ts`:
```ts
const defaultConfig: AppConfig = {
  // ... existing
  play_mode: 'sequential',
};
```

- [ ] **Step 3: 修复前端编译/测试中的 createConfig helper**

In `src/tests/playback-store.test.ts` 的 `createConfig()` 补齐 play_mode（默认 sequential）。

- [ ] **Step 4: 运行前端类型检查**

Run:
```bash
npm --prefix ./src run check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/api/mock/config.ts src/tests/playback-store.test.ts
git commit -m "feat(config): extend AppConfig with play_mode"
```

---

## Task 4: Frontend — AppShell 启动职责收敛（不应用 volume/output/play_mode）

**Files:**
- Modify: `src/lib/features/app-shell/store.ts`
- Modify: `src/tests/app-shell.test.ts`

- [ ] **Step 1: 写失败测试：bootstrap ordering 不再包含 setOutputDevice/setVolume**

在 `src/tests/app-shell.test.ts` 的 ordering 断言中，先删除 `setOutputDevice/setVolume` 相关 stub 与期望 calls。

- [ ] **Step 2: 运行该测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/app-shell.test.ts
```
Expected: FAIL（当前实现仍会调用 setOutputDevice/setVolume）

- [ ] **Step 3: 修改 AppShell store：移除 setOutputDevice/setVolume 调用（以及可选：deps 字段）**

在 `src/lib/features/app-shell/store.ts` 的 `bootstrap()`：
- 保留 `applyTheme(restored.theme)`
- 删除：`setOutputDevice`/`setVolume`

（可选：同步从 `AppShellStoreDependencies` 中移除这两个依赖，避免未来回归。）

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/app-shell.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/app-shell/store.ts src/tests/app-shell.test.ts
git commit -m "refactor(app-shell): apply theme only during bootstrap"
```

---

## Task 5: Frontend — PlaybackStore 启动应用偏好 + 偏好持久化 + last session 失败清理

**Files:**
- Modify: `src/lib/stores/playback.ts`
- Modify: `src/tests/playback-store.test.ts`

### 5.1 start() 启动应用偏好

- [ ] **Step 1: 写失败测试：start() 会按顺序应用 config 的 volume/output/play_mode**

在 `src/tests/playback-store.test.ts` 新增一个 test（示意）：
```ts
it('applies config preferences before refreshing playback state on start', async () => {
  const calls: string[] = [];
  const deps = createDependencies({
    getConfig: vi.fn(async () => (createConfig({
      default_volume: 0.25,
      output_device_id: 'usb-dac',
      play_mode: 'random',
    }))),
    setVolume: vi.fn(async () => calls.push('setVolume')),
    setOutputDevice: vi.fn(async () => calls.push('setOutputDevice')),
    setPlayMode: vi.fn(async () => calls.push('setPlayMode')),
    getPlaybackState: vi.fn(async () => { calls.push('getPlaybackState'); return { state: 'stopped' }; }),
    getCurrentTrack: vi.fn(async () => { calls.push('getCurrentTrack'); return null; }),
    getVolume: vi.fn(async () => { calls.push('getVolume'); return 0.25; }),
    getPlayMode: vi.fn(async () => { calls.push('getPlayMode'); return 'random'; }),
    getOutputDevice: vi.fn(async () => { calls.push('getOutputDevice'); return 'usb-dac'; }),
  } as any);

  const store = createPlaybackStore(deps);
  await store.start();

  expect(calls.slice(0, 3)).toEqual(['setVolume', 'setOutputDevice', 'setPlayMode']);
});
```

- [ ] **Step 1b: 写失败测试：非法 play_mode 会回退 sequential**

新增一个用例（示意）：
```ts
it('falls back to sequential when config play_mode is invalid', async () => {
  const deps = createDependencies({
    getConfig: vi.fn(async () => (createConfig({ play_mode: 'weird-mode' }))),
    setPlayMode: vi.fn().mockResolvedValue(undefined),
  } as any);

  const store = createPlaybackStore(deps);
  await store.start();

  expect(deps.setPlayMode).toHaveBeenCalledWith('sequential');
});
```

- [ ] **Step 2: 运行该测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/playback-store.test.ts
```
Expected: FAIL

- [ ] **Step 3: 扩展 PlaybackStoreDependencies（新增 saveConfig + setPlayMode）**

在 `src/lib/stores/playback.ts`：
- deps 增加 `saveConfig: (config: AppConfig) => Promise<void>`
- deps 增加 `setPlayMode: (mode: BackendPlayMode) => Promise<void>`（直接设置后端模式，用于启动应用）
- defaultDependencies 对应接线到 `configApi.saveConfig` 与 `playbackApi.setPlayMode`

- [ ] **Step 4: 实现 start() 的 applyStartupConfig**

建议逻辑：
```ts
async function applyStartupConfig(): Promise<void> {
  const config = await deps.getConfig();

  if (typeof config.default_volume === 'number') {
    await deps.setVolume(config.default_volume);
  }

  const output = typeof config.output_device_id === 'string' && config.output_device_id
    ? config.output_device_id
    : 'default';
  await deps.setOutputDevice(output);

  const rawMode = typeof config.play_mode === 'string' ? config.play_mode : '';
  const mode =
    rawMode === 'sequential' ||
    rawMode === 'random' ||
    rawMode === 'single_repeat' ||
    rawMode === 'list_repeat'
      ? rawMode
      : 'sequential';
  await deps.setPlayMode(mode);
}
```
然后在 `start()` 中：
- `await applyStartupConfig()`（catch 并 log，不阻塞）
- 再 `await Promise.all([refreshState(), refreshPlayMode(), refreshOutputDeviceState()])`

### 5.2 偏好持久化：play_mode/output_device_id

- [ ] **Step 5: 写失败测试：toggleShuffle/cycleRepeatMode 会 saveConfig（读-改-写）**

新增测试断言：
- `getConfig()` 被调用以获取 base
- `saveConfig(next)` 被调用且保留 base 字段，仅更新 `play_mode`

- [ ] **Step 6: 实现 play_mode 持久化**

在 `toggleShuffle/cycleRepeatMode` 成功调用 `setPlayModeFromUi` 后：
- `const base = await deps.getConfig()`
- `await deps.saveConfig({ ...base, play_mode: resolveBackendPlayMode(...) })`

- [ ] **Step 7: 写失败测试：selectOutputDevice 成功后会 saveConfig**

- [ ] **Step 8: 实现 output_device_id 持久化**

在 `selectOutputDevice` 的成功路径：
- `const base = await deps.getConfig()`
- `await deps.saveConfig({ ...base, output_device_id: deviceId === 'default' ? null : deviceId })`

### 5.3 last session 失败清理

- [ ] **Step 9: 写失败测试：restoreLastSession 找不到 track 会 setLastSession(null, 0)**

在现有“restores previous session”用例旁新增一个失败用例。

- [ ] **Step 10: 实现失败清理**

在 `restoreLastSession()`：
- 如果 `getTrack(lastTrackId)` 返回 null，调用 `deps.setLastSession(null, 0)`（try/catch）后返回 false。

- [ ] **Step 11: 运行 playback-store 测试**

Run:
```bash
npm --prefix ./src run test -- --run tests/playback-store.test.ts
```
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src/lib/stores/playback.ts src/tests/playback-store.test.ts
git commit -m "feat(playback): apply and persist startup preferences"
```

---

## Task 6: Frontend — Settings 保存以 getConfig 为 base（避免覆盖 play_mode）

**Files:**
- Modify: `src/lib/views/SettingsView.svelte`
- Modify/Add: `src/lib/transport/config.ts`（新增纯函数 buildNextConfigForSettingsSave）
- Modify: `src/tests/transport-config.test.ts`

- [ ] **Step 1: 写失败测试：Settings 保存会保留 base.play_mode**

在 `src/tests/transport-config.test.ts` 增加纯函数测试（先写失败再实现）：
```ts
it('buildNextConfigForSettingsSave preserves base play_mode', () => {
  const base = {
    library_paths: ['/music'],
    default_volume: 0.7,
    auto_scan: true,
    theme: 'system',
    play_mode: 'random',
  };

  const next = buildNextConfigForSettingsSave(base as any, {
    library_paths: ['/music'],
    theme: 'dark',
    auto_scan: true,
    default_volume: 0.5,
    output_device_id: null,
  });

  expect(next.play_mode).toBe('random');
});
```

- [ ] **Step 2: 实现 buildNextConfigForSettingsSave（读-改-写 helper）**

在 `src/lib/transport/config.ts` 增加：
```ts
export function buildNextConfigForSettingsSave(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return { ...base, ...patch };
}
```
（后续如需更复杂规则再扩展，但 MVP 先保证 base 字段保留。）

- [ ] **Step 3: SettingsView.saveConfig 改为每次以 await getConfig() 为 base**

在 `SettingsView.svelte` 的 `saveConfig()` 中：
- 永远 `const base = await getConfig()`
- 组装 patch（library_paths/theme/default_volume/auto_scan/output_device_id 等）
- `const next = buildNextConfigForSettingsSave(base, patch)`
- `await saveConfigCommand(next)`

- [ ] **Step 4: 运行前端 check + 相关测试**

Run:
```bash
npm --prefix ./src run test -- --run tests/transport-config.test.ts
npm --prefix ./src run check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/views/SettingsView.svelte src/lib/transport/config.ts src/tests/transport-config.test.ts
git commit -m "fix(settings): base config saves on latest getConfig"
```

---

## Task 7: 回归验证 + PR + 关闭 #17

**Files:** none

- [ ] **Step 1: 全量验证（作为关闭 issue 的证据）**

Run:
```bash
just qa
```
Expected: PASS

- [ ] **Step 2: 创建 PR（Fixes #17）并附验证证据**

PR 文本建议包含：
- 改动点摘要（config repair + play_mode + startup apply + persistence）
- 验证命令输出摘要

- [ ] **Step 3: 合并策略**

建议继续使用 **Squash merge**（保持 main 历史干净）。

---

## Verification Checklist（可复制到 PR / Issue Comment）

- Backend:
  - `cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture`
  - `cargo clippy --manifest-path ./src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- Frontend:
  - `npm --prefix ./src run test -- --run tests/app-shell.test.ts tests/playback-store.test.ts tests/transport-config.test.ts`
  - `npm --prefix ./src run check`
- Full gate:
  - `just qa`
