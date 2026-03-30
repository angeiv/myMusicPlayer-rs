# 队列与 Now Playing 体验完善（Issue #21）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让播放队列从“能用”提升到“日常可用”的最小闭环：当前项高亮、队列内跳转播放、移除非当前项、清空队列（不打断当前播放）；并产出可复用的 `QueueList` 组件供 #20 的 Now Playing「队列」Tab 复用。

**Architecture:**
- **Backend（Rust / Audio thread）**：新增 `remove_from_queue` 命令走消息队列进 `audio_player_thread` 操作 `PlayQueue`，避免前端用 `set_queue` 模拟导致 `current_index/history` 重置。
- **Frontend（Svelte/TS）**：补齐 playback api（tauri/mock）`removeFromQueue/clearQueue`；PlaybackStore 增加 `removeQueueTrack/clearQueue`；BottomPlayerBar 队列 popover 接入移除/清空，并抽 `QueueList` 组件复用。

**Tech Stack:** Rust + Tauri 2；Svelte 5 + TypeScript；Vitest；svelte-check。

---

## Inputs / References

- Spec（已合并）：`docs/superpowers/specs/2026-03-30-queue-now-playing-design.md`
- Issue：#21 https://github.com/angeiv/myMusicPlayer-rs/issues/21
- 相关代码：
  - Backend:
    - `src-tauri/src/services/audio/audio_player_thread.rs`
    - `src-tauri/src/services/audio/play_queue.rs`
    - `src-tauri/src/services/audio/mod.rs`
    - `src-tauri/src/api/audio/mod.rs`
    - `src-tauri/src/lib.rs`
  - Frontend:
    - `src/lib/api/playback.ts`
    - `src/lib/api/tauri/playback.ts`
    - `src/lib/api/mock/playback.ts`
    - `src/lib/stores/playback.ts`
    - `src/lib/player/BottomPlayerBar.svelte`

---

## File/Module Map（先锁定边界）

### Backend (Rust)
- **Modify:** `src-tauri/src/services/audio/audio_player_thread.rs`
  - 新增 `PlayerCommand::RemoveFromQueue { track_id, response_tx }`
  - `AudioPlayerHandle::remove_from_queue(track_id: Uuid) -> Result<()>`
  - thread loop 内实现 remove 逻辑（拒绝 current track；not found 返回 Err；成功更新 `state.queue_length`）
  - 新增单测覆盖：移除非当前项/拒绝移除当前项/移除不存在

- **Modify:** `src-tauri/src/services/audio/mod.rs`
  - `AudioService` 增加 `remove_from_queue(track_id: Uuid) -> Result<(), String>`（调用 handle）

- **Modify:** `src-tauri/src/api/audio/mod.rs`
  - 新增 `#[tauri::command] remove_from_queue(payload, state)`（payload 支持 `trackId`）

- **Modify:** `src-tauri/src/lib.rs`
  - `generate_handler![]` 注册 `crate::api::audio::remove_from_queue`

### Frontend (Svelte/TS)
- **Modify:** `src/lib/api/playback.ts`
  - export `removeFromQueue` / `clearQueue`

- **Modify:** `src/lib/api/tauri/playback.ts`
  - invoke `remove_from_queue` / `clear_queue`

- **Modify:** `src/lib/api/mock/playback.ts`
  - 实现 `removeFromQueue/clearQueue`，并确保 clear 后 `getQueue()` 不会被自动 seed 回填

- **Modify:** `src/lib/stores/playback.ts`
  - `PlaybackStoreDependencies` 增加 `removeFromQueue/clearQueue`
  - 新增 store 方法：`removeQueueTrack(trackId)`、`clearQueue()`

- **Create:** `src/lib/player/QueueList.svelte`
  - 可复用队列列表组件：高亮当前项、点击跳转（当前项 no-op）、移除非当前项、清空队列

- **Modify:** `src/lib/player/BottomPlayerBar.svelte`
  - 队列 popover 改用 `QueueList`，并接线到 PlaybackStore 的 remove/clear

### Tests
- **Modify:** `src-tauri/src/services/audio/audio_player_thread.rs`（同文件 tests module）
  - 新增 remove_from_queue 单测

- **Modify:** `src/tests/playback-store.test.ts`
  - 新增：removeQueueTrack/clearQueue 的行为测试（调用 deps + 刷新队列 + 不 stop）

---

## Task 0: 创建实现 worktree（隔离开发环境）

**Files:** none

- [ ] **Step 1: 创建 worktree 与分支**

Run:
```bash
git fetch origin
git worktree add .worktrees/issue-21-queue-now-playing origin/main -b issue-21-queue-now-playing
```

- [ ] **Step 2: 安装前端依赖（避免 svelte-check 缺失）**

Run:
```bash
cd .worktrees/issue-21-queue-now-playing
npm --prefix ./src ci
```

- [ ] **Step 3: 基线验证（确保 worktree 环境可跑）**

Run:
```bash
just qa
```
Expected: PASS

---

## Task 1: Backend — Audio thread 增加 remove_from_queue（含单测）

**Files:**
- Modify/Test: `src-tauri/src/services/audio/audio_player_thread.rs`

- [ ] **Step 1: 写失败测试：移除非当前项成功**

在 `src-tauri/src/services/audio/audio_player_thread.rs` 的 `#[cfg(test)] mod tests` 末尾新增：

```rust
#[test]
fn remove_from_queue_removes_non_current_track() {
    use uuid::Uuid;

    let handle = AudioPlayerHandle::new().unwrap();

    let track1 = Track { title: "Track 1".to_string(), ..Track::default() };
    let track2 = Track { title: "Track 2".to_string(), ..Track::default() };

    handle.set_queue(vec![track1.clone(), track2.clone()]).unwrap();
    let _ = handle.get_queue().unwrap();

    // Simulate current track without decoding audio.
    handle.state.lock().current_track = Some(track1.clone());

    // API not implemented yet → should fail to compile.
    handle.remove_from_queue(track2.id).unwrap();

    let queue = handle.get_queue().unwrap();
    assert_eq!(queue.len(), 1);
    assert_eq!(queue[0].id, track1.id);
    assert_eq!(handle.state.lock().queue_length, 1);
    assert_eq!(handle.state.lock().current_track.as_ref().map(|t| t.id), Some(track1.id));
}
```

- [ ] **Step 2: 运行测试确认失败（编译失败即可）**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml services::audio::audio_player_thread::tests::remove_from_queue_removes_non_current_track -- --nocapture
```
Expected: FAIL（`remove_from_queue` / `PlayerCommand` 不存在）

- [ ] **Step 3: 最小实现：新增 PlayerCommand + handle 方法 + thread loop 分支**

实现要点（按 spec）：
- 新增：
  - `PlayerCommand::RemoveFromQueue { track_id: Uuid, response_tx: Sender<Result<()>> }`
  - `AudioPlayerHandle::remove_from_queue(track_id: Uuid) -> Result<()>`（通过 response channel 返回 Err/Ok）
- thread loop：
  - 若 `state.current_track.id == track_id` → 返回 Err（禁止移除当前项）
  - 若 `queue.remove_track_by_id(track_id)` 为 None → 返回 Err（not found）
  - 成功：更新 `state.queue_length = queue.len()` 并返回 Ok

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml services::audio::audio_player_thread::tests::remove_from_queue_removes_non_current_track -- --nocapture
```
Expected: PASS

- [ ] **Step 5: 增加两个失败测试：拒绝移除当前项 / 移除不存在**

新增：
- `remove_from_queue_rejects_current_track()`：remove track1.id 返回 Err，queue 不变
- `remove_from_queue_rejects_missing_track()`：remove random uuid 返回 Err

- [ ] **Step 6: 运行 backend 全测**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/audio/audio_player_thread.rs
git commit -m "feat(queue): remove tracks from play queue"
```

---

## Task 2: Backend — 暴露 remove_from_queue 为 Tauri 命令并注册

**Files:**
- Modify: `src-tauri/src/services/audio/mod.rs`
- Modify: `src-tauri/src/api/audio/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: AudioService 增加 wrapper 方法**

在 `src-tauri/src/services/audio/mod.rs` 增加：
```rust
pub fn remove_from_queue(&self, track_id: uuid::Uuid) -> Result<(), String> {
    self.player.remove_from_queue(track_id).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Tauri command：remove_from_queue(payload, state)**

在 `src-tauri/src/api/audio/mod.rs` 增加 payload（支持 `trackId`）：
```rust
#[derive(Debug, Deserialize)]
pub struct RemoveFromQueuePayload {
    #[serde(alias = "trackId")]
    pub track_id: String,
}

#[tauri::command]
pub async fn remove_from_queue(
    payload: RemoveFromQueuePayload,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let track_id = uuid::Uuid::parse_str(&payload.track_id)
        .map_err(|_| "Invalid track id".to_string())?;

    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.remove_from_queue(track_id).map_err(|e| {
        error!("Failed to remove from queue: {}", e);
        e
    })
}
```

- [ ] **Step 3: 注册 command handler**

在 `src-tauri/src/lib.rs` 的 `generate_handler![]` audio commands 列表中加入：
- `crate::api::audio::remove_from_queue,`

- [ ] **Step 4: 运行 clippy（确保 handler 注册后无编译遗漏）**

Run:
```bash
cargo clippy --manifest-path ./src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/audio/mod.rs src-tauri/src/api/audio/mod.rs src-tauri/src/lib.rs
git commit -m "feat(api): expose remove_from_queue command"
```

---

## Task 3: Frontend — playback API 增加 clearQueue/removeFromQueue（tauri + mock）

**Files:**
- Modify: `src/lib/api/playback.ts`
- Modify: `src/lib/api/tauri/playback.ts`
- Modify: `src/lib/api/mock/playback.ts`

- [ ] **Step 1: 写一个失败的 TS 编译点（先接线 exports）**

在 `src/lib/api/playback.ts` 末尾补：
```ts
export const clearQueue = impl.clearQueue;
export const removeFromQueue = impl.removeFromQueue;
```
Expected: TS 报错（adapter 尚未实现）

- [ ] **Step 2: tauri adapter 实现**

在 `src/lib/api/tauri/playback.ts` 增加：
```ts
export async function clearQueue(): Promise<void> {
  await invoke('clear_queue');
}

export async function removeFromQueue(trackId: string): Promise<void> {
  await invoke('remove_from_queue', { trackId });
}
```

- [ ] **Step 3: mock adapter 实现（并确保 clear 后 getQueue 不会自动 seed 回填）**

在 `src/lib/api/mock/playback.ts`：
- 增加 `clearQueue/removeFromQueue`：
  - `clearQueue`：`queue = []`，不修改 `currentTrack/playbackState`
  - `removeFromQueue`：
    - 若 `currentTrack?.id === trackId` → `throw new Error('Cannot remove current track')`
    - 找不到 → `throw new Error('Track not found in queue')`
    - 成功 → 从数组移除
- 调整 `ensureQueueSeeded()`：避免 `getQueue()` 在 queue 为空时自动回填（否则 clear 立即失效）。
  - 推荐：为 mock 增加 `let queueCleared = false;`，clear 时置 true；`getQueue()` 遇到 `queueCleared` 不 seed；`pickAndPlayFile()` 需要 seed 时再把 flag 复位。

- [ ] **Step 4: 运行前端 check**

Run:
```bash
npm --prefix ./src run check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/playback.ts src/lib/api/tauri/playback.ts src/lib/api/mock/playback.ts
git commit -m "feat(playback): add clearQueue and removeFromQueue"
```

---

## Task 4: Frontend — PlaybackStore 增加 clear/remove，并补齐 store 单测

**Files:**
- Modify: `src/lib/stores/playback.ts`
- Modify: `src/tests/playback-store.test.ts`

- [ ] **Step 1: 写失败测试：clearQueue/removeQueueTrack 调用 deps 并刷新队列**

在 `src/tests/playback-store.test.ts` 新增（示意）：
```ts
it('clears queue without stopping playback', async () => {
  const calls: string[] = [];
  const deps = createDependencies({
    clearQueue: vi.fn(async () => calls.push('clearQueue')),
    getQueue: vi.fn(async () => { calls.push('getQueue'); return []; }),
    getPlaybackState: vi.fn(async () => ({ state: 'playing', position: 1, duration: 10 })),
    getCurrentTrack: vi.fn(async () => ({ id: 't1' } as any)),
    getVolume: vi.fn(async () => 0.5),
    pausePlayback: vi.fn(),
    stopPlayback: vi.fn(),
  } as any);

  const store = createPlaybackStore(deps);
  await store.clearQueue();

  expect(deps.clearQueue).toHaveBeenCalledTimes(1);
  expect(deps.getQueue).toHaveBeenCalledTimes(1);
  expect(deps.stopPlayback).not.toHaveBeenCalled();
});
```

以及 remove：
```ts
it('removes a non-current track from queue and refreshes', async () => {
  const deps = createDependencies({
    removeFromQueue: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn(async () => []),
  } as any);

  const store = createPlaybackStore(deps);
  await store.removeQueueTrack('t2');

  expect(deps.removeFromQueue).toHaveBeenCalledWith('t2');
  expect(deps.getQueue).toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/playback-store.test.ts
```
Expected: FAIL（store 方法/依赖未实现）

- [ ] **Step 3: 实现 store 方法与依赖接线**

在 `src/lib/stores/playback.ts`：
- `PlaybackStoreDependencies` 增加：
  - `clearQueue: () => Promise<void>`
  - `removeFromQueue: (trackId: string) => Promise<void>`
- `defaultDependencies()` 接线到 `playbackApi.clearQueue/removeFromQueue`
- 新增 store 方法：
  - `async function clearQueue()`：调用 deps.clearQueue；成功后 `await refreshQueue()`；必要时 `await refreshState()`
  - `async function removeQueueTrack(trackId)`：调用 deps.removeFromQueue；成功后 `await refreshQueue()`

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/playback-store.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/playback.ts src/tests/playback-store.test.ts
git commit -m "feat(queue): add clear/remove queue operations"
```

---

## Task 5: Frontend — 抽 QueueList 组件并接入 BottomPlayerBar

**Files:**
- Create: `src/lib/player/QueueList.svelte`
- Modify: `src/lib/player/BottomPlayerBar.svelte`

- [ ] **Step 1: 创建 QueueList.svelte（最小可复用）**

要求（按 spec）：
- 当前项高亮（active）
- 点击当前项：no-op
- 移除按钮仅对非当前项可用
- 清空按钮调用 onClear
- 空列表时显示空态文案（例如“队列为空（后续已清空）”）

- [ ] **Step 2: BottomPlayerBar 队列 popover 改用 QueueList**

在 `src/lib/player/BottomPlayerBar.svelte`：
- import `QueueList`
- 将 `{#if showQueue}` 内部的 `<ul>...</ul>` 替换为 `<QueueList .../>`
- 事件接线：
  - `onSelect(track)` → 调用 `playback.playQueueTrack(track)`（并在 QueueList 内对 currentTrackId 做 no-op）
  - `onRemove(track)` → 调用 `playback.removeQueueTrack(track.id)`
  - `onClear()` → 调用 `playback.clearQueue()`

- [ ] **Step 3: 运行前端 check + 关键测试**

Run:
```bash
npm --prefix ./src run check
npm --prefix ./src run test -- --run tests/player-utility-controls.test.ts tests/playback-store.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/player/QueueList.svelte src/lib/player/BottomPlayerBar.svelte
git commit -m "refactor(player): extract reusable queue list"
```

---

## Task 6: 回归验证 + PR

**Files:** none

- [ ] **Step 1: 全量验证（作为关闭 #21 的证据）**

Run:
```bash
just qa
```
Expected: PASS

- [ ] **Step 2: 创建 PR（Fixes #21）并附验证证据**

PR 内容建议包含：
- 后端新增 remove_from_queue（拒绝移除当前项）
- 前端 clear/remove + QueueList 组件
- 验证命令摘要（just qa + vitest 子集）

---

## Verification Checklist（可复制到 PR / Issue Comment）

- Backend:
  - `cargo test --manifest-path ./src-tauri/Cargo.toml -- --nocapture`
  - `cargo clippy --manifest-path ./src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- Frontend:
  - `npm --prefix ./src run test -- --run tests/playback-store.test.ts tests/player-utility-controls.test.ts`
  - `npm --prefix ./src run check`
- Full gate:
  - `just qa`
