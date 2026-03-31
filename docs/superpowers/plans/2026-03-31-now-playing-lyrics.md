# Now Playing 与歌词交互闭环（Issue #20）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一个保留底栏控制的 Now Playing 覆盖层，并交付歌词自动跟随 / 手动浏览 / 选中歌词行 seek / 5 秒自动恢复的完整交互闭环，同时复用 #21 的队列能力。

**Architecture:**
- **共享状态（Svelte/TS）**：新增轻量 `now-playing` UI store 管理 overlay 开关与 Tab 状态，并把 PlaybackStore 提升为共享实例，供 BottomPlayerBar 与 Now Playing 覆盖层共用，避免双轮询。
- **Now Playing 视图**：Overlay 外壳负责打开/关闭、Esc、focus/inert、Tab 切换；LyricsTab 负责歌词自动跟随与 Browse Mode 交互；QueueTab 直接复用 #21 已交付的 `QueueList`。

**Tech Stack:** Svelte 5 + TypeScript + @testing-library/svelte + Vitest；现有 PlaybackStore / `lyrics.ts` helper；hash-router 保持不变（本期不用新 route）。

---

## Inputs / References

- Spec（已合并）：`docs/superpowers/specs/2026-03-31-now-playing-lyrics-design.md`
- Issue：#20 https://github.com/angeiv/myMusicPlayer-rs/issues/20
- 相关代码：
  - Shell / routing：`src/App.svelte`, `src/lib/stores/router.ts`, `src/lib/routing/routes.ts`
  - Player：`src/lib/player/BottomPlayerBar.svelte`, `src/lib/player/lyrics.ts`, `src/lib/player/QueueList.svelte`
  - Playback：`src/lib/stores/playback.ts`
  - Existing tests：`src/tests/player-lyrics.test.ts`, `src/tests/player-utility-controls.test.ts`, `src/tests/app-shell-wiring.test.ts`, `src/tests/playback-store.test.ts`

---

## File/Module Map（先锁定边界）

### Player/UI state
- **Create:** `src/lib/player/now-playing.ts`
  - 负责 overlay 开关与 activeTab（lyrics/queue）
  - reopen 时重置到 lyrics tab
- **Create:** `src/lib/player/sharedPlayback.ts`
  - 导出共享 playback store 实例

### Player UI
- **Create:** `src/lib/player/NowPlayingOverlay.svelte`
  - 覆盖层外壳、Header、Tab、Esc、focus/inert 协调
- **Create:** `src/lib/player/NowPlayingLyricsTab.svelte`
  - timed/plain/no lyrics 渲染、Follow Mode、Browse Mode、辅助线、seek 胶囊、5 秒自动恢复
- **Modify:** `src/lib/player/BottomPlayerBar.svelte`
  - current-song 区域改为 Now Playing trigger
  - favorite 按钮保持独立
  - 移除旧歌词按钮与旧 lyrics panel
  - 使用共享 playback store 与 now-playing store
- **Modify:** `src/App.svelte`
  - 渲染 `NowPlayingOverlay`
  - 让 Sidebar / TopBar / Main shell 在 overlay 打开时 inert + 不可滚动（BottomPlayerBar 继续可交互）

### Playback store
- **Modify:** `src/lib/stores/playback.ts`
  - 新增 `playFromLyricsTimestamp(seconds: number)`
  - 整秒向下取整；无论 paused/playing，点击 seek 胶囊都进入 playing

### Tests
- **Create:** `src/tests/now-playing-store.test.ts`
  - 测试 open/close/toggle/tab reset
- **Create:** `src/tests/now-playing-overlay.test.ts`
  - 测试 overlay 打开/关闭、Esc、focus、default tab、QueueList 复用、inert contract
- **Create:** `src/tests/now-playing-lyrics-tab.test.ts`
  - 测试 timed/plain/no lyrics、Browse Mode、seek pill、5 秒自动恢复
- **Modify:** `src/tests/playback-store.test.ts`
  - 测试 `playFromLyricsTimestamp()` 的整秒规则与播放语义
- **Modify:** `src/tests/player-utility-controls.test.ts`
  - 删除对旧 lyrics utility button 的期待，改为校验 current-song 区域 trigger 或至少不再要求“歌词” utility button
- **Modify (如需要):** `src/tests/app-shell-wiring.test.ts`
  - 若 `App.svelte` 引入 overlay 导致测试噪音，则 mock `NowPlayingOverlay.svelte`

---

## Task 0: 创建实现 worktree（隔离开发环境）

**Files:** none

- [ ] **Step 1: 创建 worktree 与分支**

Run:
```bash
git fetch origin
git worktree add -b issue-20-now-playing-lyrics .worktrees/issue-20-now-playing-lyrics origin/main
```

- [ ] **Step 2: 安装前端依赖（避免 svelte-check 缺失）**

Run:
```bash
cd .worktrees/issue-20-now-playing-lyrics
npm --prefix ./src ci
```

- [ ] **Step 3: 基线验证**

Run:
```bash
just qa
```
Expected: PASS

---

## Task 1: 共享播放实例与 Now Playing UI store

**Files:**
- Create: `src/lib/player/now-playing.ts`
- Create: `src/lib/player/sharedPlayback.ts`
- Test: `src/tests/now-playing-store.test.ts`

- [ ] **Step 1: 写失败测试：open 会把 activeTab 重置到 lyrics**

在 `src/tests/now-playing-store.test.ts` 新增：
```ts
import { get } from 'svelte/store';
import { createNowPlayingStore } from '../lib/player/now-playing';

it('resets active tab to lyrics whenever overlay is opened', () => {
  const store = createNowPlayingStore();

  store.open();
  store.setActiveTab('queue');
  store.close();
  store.open();

  expect(get(store.state)).toEqual({ isOpen: true, activeTab: 'lyrics' });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/now-playing-store.test.ts
```
Expected: FAIL（module/function 不存在）

- [ ] **Step 3: 最小实现 now-playing store**

在 `src/lib/player/now-playing.ts` 实现：
- `type NowPlayingTab = 'lyrics' | 'queue'`
- `createNowPlayingStore()` 返回：
  - `state`（readable/writable）
  - `open()`：`isOpen=true` 且 `activeTab='lyrics'`
  - `close()`：`isOpen=false`
  - `toggle()`：关闭则 reopen 为 lyrics；打开则关闭
  - `setActiveTab(tab)`
- 同文件导出共享实例（例如 `nowPlayingUi`）供产品代码使用

- [ ] **Step 4: 新增 shared playback 实例模块**

在 `src/lib/player/sharedPlayback.ts`：
```ts
import { createPlaybackStore } from '../stores/playback';
export const sharedPlayback = createPlaybackStore();
```

> 不需要额外测试逻辑；重点是后续组件都改用共享实例。

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/now-playing-store.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/player/now-playing.ts src/lib/player/sharedPlayback.ts src/tests/now-playing-store.test.ts
git commit -m "feat(player): add now playing ui store"
```

---

## Task 2: PlaybackStore 增加歌词 seek 语义（整秒 + 强制进入 playing）

**Files:**
- Modify: `src/lib/stores/playback.ts`
- Modify: `src/tests/playback-store.test.ts`

- [ ] **Step 1: 写失败测试：歌词 seek 会向下取整并恢复播放**

在 `src/tests/playback-store.test.ts` 新增用例（示意）：
```ts
it('plays from lyrics timestamp by flooring seconds and forcing playing', async () => {
  const deps = createDependencies({
    seekTo: vi.fn().mockResolvedValue(undefined),
    resumePlayback: vi.fn().mockResolvedValue(undefined),
    getPlaybackState: vi.fn(async () => ({ state: 'paused', position: 10, duration: 100 })),
    getCurrentTrack: vi.fn(async () => ({ id: 't1' } as any)),
    getVolume: vi.fn(async () => 0.5),
  } as any);

  const store = createPlaybackStore(deps);
  await store.playFromLyricsTimestamp(83.87);

  expect(deps.seekTo).toHaveBeenCalledWith(83);
  expect(deps.resumePlayback).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/playback-store.test.ts
```
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现 `playFromLyricsTimestamp(seconds)`**

在 `src/lib/stores/playback.ts`：
- 扩展 `type PlaybackStore = ...` 与返回对象
- 新增方法：
  - `const target = Math.max(0, Math.floor(seconds))`
  - `await deps.seekTo(target)`
  - 若当前 playbackState 不是 `playing`，则 `await deps.resumePlayback()`
  - `await refreshState()`
- 若 `currentTrack == null`，允许直接 no-op + `console.warn`

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/playback-store.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/playback.ts src/tests/playback-store.test.ts
git commit -m "feat(playback): add lyric seek action"
```

---

## Task 3: Overlay 外壳 + App shell inert/focus 契约

**Files:**
- Create: `src/lib/player/NowPlayingOverlay.svelte`
- Modify: `src/App.svelte`
- Test: `src/tests/now-playing-overlay.test.ts`
- Modify (如需要): `src/tests/app-shell-wiring.test.ts`

- [ ] **Step 1: 写失败测试：overlay 默认关闭、open 后默认 lyrics tab、Esc 关闭**

在 `src/tests/now-playing-overlay.test.ts` 新增（示意）：
```ts
it('opens on lyrics tab and closes on Escape', async () => {
  // render overlay with mocked nowPlaying store open state + sharedPlayback state
  // assert lyrics tab selected by default
  // dispatch Escape and assert close called
});
```

> 测试重点：
- `isOpen=false` 时 overlay 不渲染
- `isOpen=true` 时默认激活 `lyrics`
- `Esc` 触发 `close()`

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/now-playing-overlay.test.ts
```
Expected: FAIL（component 不存在）

- [ ] **Step 3: 实现 NowPlayingOverlay.svelte（先做外壳）**

要求：
- Header：返回按钮 + 标题信息 + Tab（lyrics/queue）
- 通过 `nowPlayingUi` 读取 open/activeTab
- 通过 `sharedPlayback` 读取 `currentTrack`
- `onMount` / action 或事件监听支持 `Esc` 关闭
- `isOpen=false` 不渲染
- `isOpen=true` 时：
  - 歌词 tab 先用占位容器 / 简单组件位点（Task 5 再补全复杂逻辑）
  - Queue tab 先用 `<QueueList ...>` 占位接线

- [ ] **Step 4: App.svelte 集成 overlay 与 inert 契约**

在 `src/App.svelte`：
- import `NowPlayingOverlay`
- 渲染 `<NowPlayingOverlay />`
- 给 TopBar / Sidebar / main content 增加可被 inert/class 控制的 wrapper（必要时）
- 当 overlay 打开时：
  - shell 背景不可点击 / 不可滚动
  - BottomPlayerBar 继续可见且可交互

> 不要求此任务就完全完成 focus return，可在 Task 4 配合 trigger 一起打通。

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/now-playing-overlay.test.ts tests/app-shell-wiring.test.ts
npm --prefix ./src run check
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/player/NowPlayingOverlay.svelte src/App.svelte src/tests/now-playing-overlay.test.ts src/tests/app-shell-wiring.test.ts
git commit -m "feat(player): add now playing overlay shell"
```

---

## Task 4: BottomPlayerBar 入口迁移与旧歌词表面移除

**Files:**
- Modify: `src/lib/player/BottomPlayerBar.svelte`
- Modify: `src/tests/player-utility-controls.test.ts`
- Test (可新增): `src/tests/now-playing-overlay.test.ts`

- [ ] **Step 1: 写失败测试 / 更新断言：不再期待旧 lyrics utility button**

在 `src/tests/player-utility-controls.test.ts`：
- 删除对 `aria-label="歌词"` utility button 的断言
- 保留队列 / 音量 / 输出设备按钮断言

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/player-utility-controls.test.ts
```
Expected: FAIL（源码仍有旧歌词按钮）

- [ ] **Step 3: 修改 BottomPlayerBar**

要求：
- 改用 `sharedPlayback`，不再 `createPlaybackStore()` 本地实例化
- 当前歌曲区改为可聚焦 trigger：
  - 有 `currentTrack` 时 → `toggleNowPlaying()`
  - 无 `currentTrack` 时 → disabled/no-op
- `favorite` 按钮保持独立，点击不触发 overlay
- 移除旧歌词 utility button 与旧 lyrics panel
- 当 overlay 打开时，底栏队列 popover 不再打开（可 disabled / 可强制关闭）

- [ ] **Step 4: 补一条交互测试（可放 now-playing-overlay.test.ts）**

至少覆盖：
- 无 currentTrack 时 trigger 不打开 overlay
- 有 currentTrack 时点击 trigger 打开 overlay
- 关闭后焦点返回 trigger

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts
npm --prefix ./src run check
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/player/BottomPlayerBar.svelte src/tests/player-utility-controls.test.ts src/tests/now-playing-overlay.test.ts
git commit -m "refactor(player): move lyrics entry into now playing trigger"
```

---

## Task 5: NowPlayingLyricsTab —— Follow/Browse/Seek/5 秒自动恢复

**Files:**
- Create: `src/lib/player/NowPlayingLyricsTab.svelte`
- Create: `src/tests/now-playing-lyrics-tab.test.ts`
- Modify: `src/lib/player/NowPlayingOverlay.svelte`

- [ ] **Step 1: 写失败测试：timed / plain / empty 三种状态**

在 `src/tests/now-playing-lyrics-tab.test.ts` 新增：
- timed lyrics：显示 active line
- plain lyrics：展示全文，不显示 guide line / seek pill
- no lyrics：显示空态提示

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/now-playing-lyrics-tab.test.ts
```
Expected: FAIL（component 不存在）

- [ ] **Step 3: 最小实现 LyricsTab 基础渲染**

在 `src/lib/player/NowPlayingLyricsTab.svelte`：
- 输入：`track`, `progress`, `playbackState`, `onSeekToTimestamp`
- 复用 `buildLyricsPanelState()`
- 先实现：timed/plain/empty 三种展示
- 当前播放行高亮

- [ ] **Step 4: 新增失败测试：Browse Mode + seek pill + 5 秒自动恢复**

新增测试（使用 fake timers）：
- 滚动歌词区 → 显示 guide line + seek pill
- 点击 seek pill → 调用 `playFromLyricsTimestamp(floor(timestamp))`
- 5 秒无继续滚动 → 自动恢复 Follow Mode（seek pill 消失 / 回到 active line）

- [ ] **Step 5: 实现 Browse Mode 逻辑**

实现要求：
- 滚轮/滚动进入 Browse Mode
- 显示辅助线
- 根据辅助线位置选择最近 timed line
- 右侧显示 `▶︎ + timestamp` 胶囊
- 点击胶囊：调用 `playFromLyricsTimestamp()`；退出 Browse Mode；恢复 Follow Mode
- 5 秒无新滚动/选择：自动恢复

> MVP 可以使用“固定 guide line + 逐次计算最近 timed line”实现；不需要过度优化。

- [ ] **Step 6: Overlay 接线 LyricsTab**

在 `NowPlayingOverlay.svelte`：
- 用真实 `NowPlayingLyricsTab` 替换占位
- 将 `sharedPlayback` 状态传入
- Queue Tab 继续复用 `QueueList`

- [ ] **Step 7: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/now-playing-lyrics-tab.test.ts tests/now-playing-overlay.test.ts tests/player-lyrics.test.ts
npm --prefix ./src run check
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/player/NowPlayingLyricsTab.svelte src/lib/player/NowPlayingOverlay.svelte src/tests/now-playing-lyrics-tab.test.ts
git commit -m "feat(lyrics): add now playing browse and seek mode"
```

---

## Task 6: 回归验证 + PR

**Files:** none

- [ ] **Step 1: 全量验证**

Run:
```bash
just qa
```
Expected: PASS

- [ ] **Step 2: 跑前端关键交互测试子集**

Run:
```bash
npm --prefix ./src run test -- --run \
  tests/now-playing-store.test.ts \
  tests/now-playing-overlay.test.ts \
  tests/now-playing-lyrics-tab.test.ts \
  tests/playback-store.test.ts \
  tests/player-utility-controls.test.ts
```
Expected: PASS

- [ ] **Step 3: 手工冒烟（桌面行为证据）**

手工验证要点：
- 播放一首带 `.lrc` 的歌曲
- 点击底栏当前歌曲区打开 overlay
- Esc / 返回 / 再点底栏 trigger 都能关闭
- 手动滚动歌词后出现 Browse Mode + seek pill
- 点击 seek pill 后从指定歌词时间继续播放
- 停止滚动 5 秒后自动回到当前播放行
- Queue Tab 可切换，且底栏控制仍可用

- [ ] **Step 4: 创建 PR（Fixes #20）并附验证证据**

PR 内容建议包含：
- overlay + 共享 playback store
- 浏览模式 / seek pill / 5 秒自动恢复
- #21 QueueList 复用
- `just qa` + Vitest 子集 + 手工冒烟结果

---

## Verification Checklist（可复制到 PR / Issue Comment）

- Full gate:
  - `just qa`
- Frontend focused:
  - `npm --prefix ./src run test -- --run tests/now-playing-store.test.ts tests/now-playing-overlay.test.ts tests/now-playing-lyrics-tab.test.ts tests/playback-store.test.ts tests/player-utility-controls.test.ts`
- Manual smoke:
  - 打开/关闭 overlay
  - Browse Mode + seek pill
  - 5 秒自动恢复
  - Queue Tab 复用
