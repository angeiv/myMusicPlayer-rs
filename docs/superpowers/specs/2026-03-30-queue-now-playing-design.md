# [MVP2][P0] 队列与 Now Playing 体验完善（Issue #21）设计稿

- Date: 2026-03-30
- Issue: #21 <https://github.com/angeiv/myMusicPlayer-rs/issues/21>
- Related:
  - #20（Now Playing/歌词全屏交互闭环）<https://github.com/angeiv/myMusicPlayer-rs/issues/20>
  - #17（配置与启动恢复加固，已合并）<https://github.com/angeiv/myMusicPlayer-rs/issues/17>

> 本文为 **设计稿（spec）**，不包含实现。

---

## 1. 背景与问题

当前项目已具备：
- 后端播放队列基础（`PlayQueue`）、next/previous、get/set queue。
- 前端底栏队列 popover 的雏形（可展示队列并点击播放）。

但从“能工作”到“日常可用”仍缺：
- 队列管理能力缺口（移除/清空）。
- 队列跳转与当前播放状态的一致性约束不够明确。
- 与 Now Playing 场景的边界不清晰（#20 负责 Now Playing 页面骨架；#21 负责把队列做强并可复用）。

---

## 2. 目标 / 非目标

### 2.1 目标（MVP2 P0，最小闭环）

**队列视图能力（最小队列管理）：**
1) 当前项标识：队列列表能明确高亮当前播放项（若该项存在于队列列表中）。
2) 队列内跳转播放：点击队列中的某一项，会在队列语义下“跳转到该曲并开始播放”。
3) 移除单项：支持从队列移除任意 **非当前播放** 的项。
4) 清空队列：清空“后续队列”，但 **不打断当前播放**。

**入口与复用：**
- 队列管理操作至少在“底栏队列 Popover”可用。
- 产出可复用的队列列表组件（或等价抽象），供 #20 在 Now Playing 的「队列」Tab 直接复用（以实现“两处可用”的最终体验）。

### 2.2 非目标（明确不做）

- 拖拽重排 / 队列排序编辑。
- play-next / 插入队列、批量操作、DJ 模式。
- 队列持久化到磁盘（本期只保证运行时正确）。

---

## 3. 与 #20 的分工边界

- #20 负责：Now Playing 页面骨架（入口、布局、Tab 容器、歌词页默认等交互合同）。
- #21 负责：队列能力本身（后端命令 + 前端 store/组件），并在底栏队列 Popover 落地；同时提供可复用组件给 #20 的 Queue Tab。

> 也就是说：#21 不需要实现 Now Playing 页面/路由，但需要保证队列组件“拿来即用”。

---

## 4. 交互合同（Queue 视角）

### 4.1 队列展示

- 队列列表展示 track 的：title / artist（可选显示 duration）。
- 当前播放项高亮：
  - `track.id === currentTrack.id` 时标记 active。
  - 若当前播放项不在队列列表中（例如清空队列后仍在播放当前曲），则队列列表不强制显示该项；底栏 Now Playing 区域仍是当前曲的单一可信来源。

### 4.2 点击队列项 → 跳转播放

- 行为：点击队列项会开始播放该项。
- 语义约束：
  - 不通过 `set_queue` 来“重置队列 + 播放”，避免重置 `current_index/history` 造成行为偏差。
  - 推荐直接调用既有 `play(track)`（后端会在 `PlayQueue` 中选中该 track_id）；或新增更窄的 `select_queue_track(track_id)` 命令（见 §5）。

### 4.3 移除单项

- 允许移除：队列中的任意 **非当前播放项**。
- 禁止移除：当前播放项（UI 层禁用/隐藏 remove；后端也应保护性拒绝）。
  - 原因：如果在播放过程中移除当前项，会破坏队列 `current_index` 与“真实正在播放的 track”的对应关系，导致 next/auto-next 语义不稳定（MVP 先规避）。

### 4.4 清空队列

- 语义（用户确认）：**仅清空后续，不打断当前播放**。
- MVP 实现允许的等价效果：
  - 清空整个队列（包括当前项在队列中的记录），但不调用 stop；当前曲播放完毕后自然停止。
  - 队列 UI 变为空列表或仅剩当前项，均可；但必须满足“不打断当前播放”。

---

## 5. 技术方案（方案 A：补后端队列命令）

> 结论：选择方案 A（新增后端命令），避免前端用 `get_queue → filter → set_queue` 方式模拟导致 `current_index/history` 重置。

### 5.1 后端：新增 Tauri commands

文件参考：
- `src-tauri/src/api/audio/mod.rs`
- `src-tauri/src/services/audio/mod.rs`
- `src-tauri/src/services/audio/audio_player_thread.rs`
- `src-tauri/src/services/audio/play_queue.rs`

新增命令（最小集）：
1) `remove_from_queue(track_id: String)`
   - 输入：track_id（UUID string）
   - 行为：从队列移除该项
   - 约束：若 track_id == 当前播放 track_id，应返回 Err（保护性拒绝）
   - 输出：`Result<(), String>`

2) `clear_queue()`
   - 已存在：`clear_queue`
   - 验证其语义：不 stop 当前播放；仅清空队列数据结构

可选命令（如实现阶段发现强需求再加）：
- `select_queue_track(track_id: String)`：队列内跳转播放（不要求前端传完整 Track）。
  - MVP 可先不加：前端直接调用既有 `play(track)` 实现跳转播放即可。

### 5.2 后端：线程内队列一致性

- 队列的唯一可信状态在 `audio_player_thread` 内部（`PlayQueue`）。
- 新增 `PlayerCommand::RemoveFromQueue { track_id, response_tx }`（或等价）并在 thread loop 内实现：
  - 拒绝移除当前 track（通过 `state.current_track` 对比）。
  - 成功移除后更新：`state.queue_length = queue.len()`。

### 5.3 前端：API/Store/组件

文件参考：
- `src/lib/api/playback.ts`
- `src/lib/api/tauri/playback.ts`
- `src/lib/api/mock/playback.ts`
- `src/lib/stores/playback.ts`
- `src/lib/player/BottomPlayerBar.svelte`

新增前端 API：
- `clearQueue()`：接线到 tauri `clear_queue`（mock 也要实现）。
- `removeFromQueue(trackId: string)`：接线到 tauri `remove_from_queue`。

PlaybackStore 扩展：
- 提供 `removeQueueTrack(trackId)` / `clearQueue()` 方法：
  - 成功后刷新 queue（必要时也刷新 state）。
  - 若后端返回“不能移除当前项”，UI 提示（或静默 no-op）。

组件抽取：
- 抽一个可复用 `QueueList` 组件（建议放在 `src/lib/player/`）：
  - Props: `tracks`, `currentTrackId`, `onSelect(track)`, `onRemove(track)`, `onClear()`
  - BottomPlayerBar 队列 popover 使用该组件。
  - #20 在 Now Playing 的 Queue Tab 直接复用该组件（满足“两处可用”）。

---

## 6. 测试与验证

### 6.1 后端（Rust）

- 为新增 `remove_from_queue` 路径补测试：
  - 移除不存在：返回 Err
  - 移除非当前项：成功，queue_len 变更
  - 移除当前项：返回 Err

> 测试可优先落在 play_queue 的 unit test + audio thread command 的最小集成测试（实现阶段再确定落点）。

### 6.2 前端（Vitest）

- PlaybackStore：
  - remove/clear 调用 deps，并在成功后 refreshQueue
  - 清空不应触发 stop 或 pick file（仅影响队列）
- BottomPlayerBar：
  - 至少保证使用新 QueueList 后交互不回归（可选做轻量集成测试；若成本高可先 store 测试兜底）

### 6.3 验证命令（实现完成后的门禁）

- `just qa`
- `npm --prefix ./src run test -- --run tests/playback-store.test.ts`

---

## 7. 验收标准（落到 #21）

- 底栏队列 popover：
  - 当前项高亮
  - 点击队列项可跳转播放
  - 可移除非当前项
  - 可清空队列且不打断当前播放
- 后端新增命令与对应测试补齐（至少覆盖 remove 的边界）
- 前端新增 API/Store 与对应测试补齐

---

## 8. 风险与降级策略

- 风险：移除当前播放项会导致 next/auto-next 语义不稳定。
  - 策略：MVP 禁止移除当前项（UI 禁用 + 后端拒绝）。

- 风险：前端用 `set_queue` 模拟 remove 会重置 `current_index/history`。
  - 策略：选择方案 A，在后端提供 remove 命令。
