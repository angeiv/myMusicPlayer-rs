# Songs List Batch Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `SongsView` 增加桌面式多选、批量加入歌单、批量加入队列、播放选中项、右键菜单和当前播放行高亮，并保持第一阶段范围可测试、可验证。

**Architecture:** 保留 `src/lib/views/SongsView.svelte` 作为页面壳，把“选择状态”“排序/过滤”“批量动作编排”拆进 `src/lib/features/songs-list/`，再用小型展示组件承载表格、批量操作条、右键菜单和歌单选择器。播放与歌单写入继续复用既有前端 bridge 和 Tauri 命令；当前播放行高亮使用既有 playback API 获取当前曲目，不引入新的全局状态系统。

**Tech Stack:** Svelte 5、TypeScript、Vitest、@testing-library/svelte、现有 Tauri bridge（`src/lib/api/*`）

---

## 实施前必读

- 规格文档：`docs/superpowers/specs/2026-03-25-songs-list-design.md`
- 当前页面：`src/lib/views/SongsView.svelte`
- 播放 bridge：`src/lib/api/playback.ts`、`src/lib/api/tauri/playback.ts`、`src/lib/api/mock/playback.ts`
- 歌单 bridge：`src/lib/api/playlist.ts`、`src/lib/api/tauri/playlist.ts`、`src/lib/api/mock/playlist.ts`
- mock 数据：`src/lib/mocks/library.ts`
- 现有播放 store：`src/lib/stores/playback.ts`
- 现有 bridge 测试：
  - `src/tests/tauri-playback-bridge.test.ts`
  - `src/tests/tauri-playlist-bridge.test.ts`
  - `src/tests/api-adapter-selection.test.ts`
- 边界约束测试：`src/tests/boundary-ownership.test.ts`

## 文件结构地图

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/lib/features/songs-list/selection.ts` | 纯选择状态机：单击、Cmd/Ctrl、Shift、右键、reconcile、清除选择 |
| `src/lib/features/songs-list/sort-filter.ts` | 歌曲过滤、排序、稳定 tie-breaker、生成 `visibleTracks` |
| `src/lib/features/songs-list/actions.ts` | 批量动作编排：播放选中、加入队列、加入歌单 |
| `src/lib/components/songs/SongsTable.svelte` | 纯展示型歌曲表格，派发 click/dblclick/keydown/contextmenu |
| `src/lib/components/songs/SongsBulkActionBar.svelte` | 纯展示型批量操作条 |
| `src/lib/components/songs/SongsContextMenu.svelte` | 纯展示型右键菜单（核心三项） |
| `src/lib/components/songs/SongsPlaylistPicker.svelte` | 纯展示型歌单选择器 popover |
| `src/tests/songs-list-selection.test.ts` | 选择状态机单元测试 |
| `src/tests/songs-list-sort-filter.test.ts` | 排序/过滤单元测试 |
| `src/tests/songs-list-actions.test.ts` | 动作编排单元测试 |
| `src/tests/songs-view.test.ts` | `SongsView` 集成测试（jsdom） |

### 需要修改的文件

| 文件 | 修改原因 |
|------|----------|
| `src/package.json` | 增加 Svelte 组件测试依赖 |
| `src/lib/api/playback.ts` | 暴露 `addToQueue` |
| `src/lib/api/tauri/playback.ts` | 增加 `invoke('add_to_queue', { tracks })` |
| `src/lib/api/mock/playback.ts` | mock 队列追加逻辑 |
| `src/lib/api/playlist.ts` | 暴露 `addToPlaylist` |
| `src/lib/api/tauri/playlist.ts` | 增加 `invoke('add_to_playlist', { playlistId, trackId })` |
| `src/lib/api/mock/playlist.ts` | mock 歌单追加逻辑 |
| `src/lib/mocks/library.ts` | 增加向 mock 歌单追加歌曲的 helper |
| `src/lib/views/SongsView.svelte` | 重构为页面壳 + 接入 feature 层与展示组件 |
| `src/App.svelte` | 把 app-shell 中的 `playlists` 透传给 `SongsView`，供歌单选择器和禁用态判断使用 |
| `src/tests/tauri-playback-bridge.test.ts` | 覆盖新增 playback bridge |
| `src/tests/tauri-playlist-bridge.test.ts` | 覆盖新增 playlist bridge |
| `src/tests/api-adapter-selection.test.ts` | 覆盖 adapter entry 导出 |

## 总体实施顺序

1. 先补齐前端 bridge surface，让 songs-list actions 可以直接调用队列追加和歌单写入。
2. 用 TDD 实现 3 个纯逻辑模块：`selection.ts`、`sort-filter.ts`、`actions.ts`。
3. 增加最小组件测试能力（`@testing-library/svelte` + `jsdom`），先写失败的 `SongsView` 集成测试。
4. 再拆展示组件并重构 `SongsView`。
5. 最后跑完整验证：前端测试、前端检查、后端回归测试。

---

### Task 1: 补齐 bridge surface（加入队列 / 加入歌单）

**Files:**
- Modify: `src/lib/api/playback.ts`
- Modify: `src/lib/api/tauri/playback.ts`
- Modify: `src/lib/api/mock/playback.ts`
- Modify: `src/lib/api/playlist.ts`
- Modify: `src/lib/api/tauri/playlist.ts`
- Modify: `src/lib/api/mock/playlist.ts`
- Modify: `src/lib/mocks/library.ts`
- Test: `src/tests/tauri-playback-bridge.test.ts`
- Test: `src/tests/tauri-playlist-bridge.test.ts`
- Test: `src/tests/api-adapter-selection.test.ts`

- [ ] **Step 1: 先写失败的 bridge 测试**

在 `src/tests/tauri-playback-bridge.test.ts` 增加：

```ts
it('invokes add_to_queue with tracks payload', async () => {
  invokeMock.mockResolvedValueOnce(undefined);
  const tracks = [{ id: 'track-1' }] as any[];

  await addToQueue(tracks as never);
  expect(invokeMock).toHaveBeenCalledWith('add_to_queue', { tracks });
});
```

在 `src/tests/tauri-playlist-bridge.test.ts` 增加：

```ts
it('invokes add_to_playlist with camelCase payload keys', async () => {
  invokeMock.mockResolvedValueOnce(undefined);

  await addToPlaylist('playlist-1', 'track-9');
  expect(invokeMock).toHaveBeenCalledWith('add_to_playlist', {
    playlistId: 'playlist-1',
    trackId: 'track-9',
  });
});
```

在 `src/tests/api-adapter-selection.test.ts` 中，把 `playbackStub` 和 `playlistStub` 增加 `addToQueue` / `addToPlaylist`，并断言 entry adapter 能暴露这些导出。

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/tauri-playback-bridge.test.ts tests/tauri-playlist-bridge.test.ts tests/api-adapter-selection.test.ts
```

Expected:
- 至少出现 `addToQueue is not exported` / `addToPlaylist is not exported` / 对应 invoke 断言失败。

- [ ] **Step 3: 用最小实现补齐 adapters**

实现要点：

`src/lib/api/playback.ts`
```ts
export const addToQueue = impl.addToQueue;
```

`src/lib/api/tauri/playback.ts`
```ts
export async function addToQueue(tracks: Track[]): Promise<void> {
  await invoke('add_to_queue', { tracks });
}
```

`src/lib/api/mock/playback.ts`
```ts
export async function addToQueue(tracks: Track[]): Promise<void> {
  queue = [...queue, ...tracks.map((track) => ({ ...track }))];
}
```

`src/lib/api/playlist.ts`
```ts
export const addToPlaylist = impl.addToPlaylist;
```

`src/lib/api/tauri/playlist.ts`
```ts
export async function addToPlaylist(playlistId: string, trackId: string): Promise<void> {
  await invoke('add_to_playlist', { playlistId, trackId });
}
```

`src/lib/mocks/library.ts`
```ts
export function appendMockTrackToPlaylist(id: string, trackId: string): void {
  const playlist = playlistsState.find((item) => item.id === id);
  if (!playlist) return;
  playlist.track_ids.push(trackId);
  playlist.updated_at = new Date().toISOString();
}
```

`src/lib/api/mock/playlist.ts`
```ts
export async function addToPlaylist(playlistId: string, trackId: string): Promise<void> {
  appendMockTrackToPlaylist(playlistId, trackId);
}
```

- [ ] **Step 4: 重新运行 bridge 测试，确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/tauri-playback-bridge.test.ts tests/tauri-playlist-bridge.test.ts tests/api-adapter-selection.test.ts
```

Expected:
- 3 个测试文件全部 PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/lib/api/playback.ts src/lib/api/tauri/playback.ts src/lib/api/mock/playback.ts src/lib/api/playlist.ts src/lib/api/tauri/playlist.ts src/lib/api/mock/playlist.ts src/lib/mocks/library.ts src/tests/tauri-playback-bridge.test.ts src/tests/tauri-playlist-bridge.test.ts src/tests/api-adapter-selection.test.ts
git commit -m "feat: expose songs list batch action bridges"
```

---

### Task 2: 实现纯选择状态机 `selection.ts`

**Files:**
- Create: `src/lib/features/songs-list/selection.ts`
- Test: `src/tests/songs-list-selection.test.ts`

- [ ] **Step 1: 先写失败的状态机测试**

在 `src/tests/songs-list-selection.test.ts` 建立最小数据集和核心场景：

```ts
import { describe, expect, it } from 'vitest';
import {
  createSelectionState,
  selectSingle,
  toggleSelection,
  selectRange,
  selectFromContextMenu,
  reconcileSelection,
  clearSelection,
} from '../lib/features/songs-list/selection';

const visibleIds = ['a', 'b', 'c', 'd'];

describe('songs-list selection', () => {
  it('single click selects one row and resets active/anchor', () => {
    const next = selectSingle(createSelectionState(), 'b');
    expect(next).toEqual({
      selectedIds: ['b'],
      activeTrackId: 'b',
      anchorTrackId: 'b',
    });
  });

  it('shift click replaces selection with visible range', () => {
    const seeded = selectSingle(createSelectionState(), 'b');
    const next = selectRange(seeded, visibleIds, 'd');
    expect(next.selectedIds).toEqual(['b', 'c', 'd']);
    expect(next.activeTrackId).toBe('d');
    expect(next.anchorTrackId).toBe('d');
  });
});
```

必须再补以下场景：
- Cmd/Ctrl toggle
- anchor 不可见时 Shift 回退为单选
- 右键未选中行变单选
- 右键已选中行保持多选
- `reconcileSelection` 清理不存在的 active/anchor
- `clearSelection` 清空全部隐藏/可见选择

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-list-selection.test.ts
```

Expected:
- FAIL，提示模块或导出不存在

- [ ] **Step 3: 写最小实现**

在 `selection.ts` 使用可序列化状态，不要用 `Set` 作为对外状态结构，避免 Svelte 本地状态更新不透明：

```ts
export type SongsListSelectionState = {
  selectedIds: string[];
  activeTrackId: string | null;
  anchorTrackId: string | null;
};

export function createSelectionState(): SongsListSelectionState {
  return { selectedIds: [], activeTrackId: null, anchorTrackId: null };
}
```

实现这些函数：
- `selectSingle(state, trackId)`
- `toggleSelection(state, trackId)`
- `selectRange(state, visibleIds, trackId)`
- `selectFromContextMenu(state, trackId)`
- `clearSelection()`
- `reconcileSelection(state, existingIds, visibleIds)`
- `getVisibleSelectedIds(state, visibleIds)`

关键语义：
- `selectRange` 必须用当前可见顺序计算区间
- anchor 不存在或不可见时回退为单选
- 右键未选中行：整体替换为单选
- 右键已选中行：保留选择，仅更新 active/anchor
- `reconcileSelection`：不存在的 id 清掉；不可见的 `activeTrackId` / `anchorTrackId` 清掉；隐藏的 `selectedIds` 可保留

- [ ] **Step 4: 运行状态机测试，确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-list-selection.test.ts
```

Expected:
- PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/lib/features/songs-list/selection.ts src/tests/songs-list-selection.test.ts
git commit -m "feat: add songs list selection state machine"
```

---

### Task 3: 实现排序/过滤模块 `sort-filter.ts`

**Files:**
- Create: `src/lib/features/songs-list/sort-filter.ts`
- Test: `src/tests/songs-list-sort-filter.test.ts`

- [ ] **Step 1: 先写失败测试**

在 `src/tests/songs-list-sort-filter.test.ts` 定义最小 `Track[]` fixture，并覆盖：
- title / artist / album 搜索命中
- title / artist / album / duration / date_added 排序
- 升序/降序
- 排序值相等时保持输入顺序

示例：

```ts
it('keeps input order as tie-breaker when sort values are equal', () => {
  const visible = getVisibleTracks(tracks, '', { key: 'artist_name', direction: 'asc' });
  expect(visible.map((track) => track.id)).toEqual(['t1', 't2', 't3']);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-list-sort-filter.test.ts
```

Expected:
- FAIL，模块不存在

- [ ] **Step 3: 实现最小排序/过滤逻辑**

`sort-filter.ts` 建议提供：

```ts
import type { Track } from '../../types';

export type SongsSortKey = 'title' | 'album_title' | 'artist_name' | 'duration' | 'date_added';
export type SongsSortDirection = 'asc' | 'desc';

export function getVisibleTracks(
  tracks: Track[],
  searchTerm: string,
  sort: { key: SongsSortKey; direction: SongsSortDirection }
): Track[] {
  // 先过滤，再用稳定排序返回新数组
}
```

实现细节：
- 先 `filter`
- 再用 `map((track, index) => ({ track, index }))` 实现稳定 tie-breaker
- 排序不要原地改输入数组

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-list-sort-filter.test.ts
```

Expected:
- PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/lib/features/songs-list/sort-filter.ts src/tests/songs-list-sort-filter.test.ts
git commit -m "feat: add songs list sorting and filtering helpers"
```

---

### Task 4: 实现动作编排模块 `actions.ts`

**Files:**
- Create: `src/lib/features/songs-list/actions.ts`
- Test: `src/tests/songs-list-actions.test.ts`

- [ ] **Step 1: 先写失败测试**

在 `src/tests/songs-list-actions.test.ts` 使用 mock deps 驱动，不直接依赖真实 bridge：

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  getSelectedVisibleTracks,
  playSelectedTracks,
  addSelectedTracksToQueue,
  addSelectedTracksToPlaylist,
  playVisibleTrack,
} from '../lib/features/songs-list/actions';
```

需要覆盖：
- `getSelectedVisibleTracks` 保持 `visibleTracks` 顺序
- `playSelectedTracks` 优先从 `activeTrackId` 起播
- `activeTrackId` 不在选中集合时回退第一首
- `addSelectedTracksToQueue` 顺序正确
- `playSelectedTracks` 失败时返回结构化错误结果，不是静默 `console.error`
- `addSelectedTracksToQueue` 失败时返回结构化错误结果
- `addSelectedTracksToPlaylist` 返回 success / partial / error
- `playVisibleTrack`（双击专用）总是用完整 `visibleTracks` 替换队列，并从被双击行起播

playlist 结果断言建议写成：

```ts
expect(result).toEqual({
  status: 'partial',
  added: 2,
  total: 3,
  failedTrackIds: ['track-3'],
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-list-actions.test.ts
```

Expected:
- FAIL，模块不存在

- [ ] **Step 3: 实现最小动作编排**

建议 API 设计：

```ts
import type { Track } from '../../types';
import type { SongsListSelectionState } from './selection';

export type SongsListActionDeps = {
  setQueue: (tracks: Track[]) => Promise<void>;
  addToQueue: (tracks: Track[]) => Promise<void>;
  playTrack: (track: Track) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
};

export function getSelectedVisibleTracks(visibleTracks: Track[], selectedIds: string[]): Track[];
export async function playSelectedTracks(...): Promise<{ status: 'success' | 'error'; message: string }>;
export async function addSelectedTracksToQueue(...): Promise<{ status: 'success' | 'error'; message: string }>;
export async function addSelectedTracksToPlaylist(...): Promise<{
  status: 'success' | 'partial' | 'error';
  added: number;
  total: number;
  failedTrackIds: string[];
}>;
export async function playVisibleTrack(...): Promise<{ status: 'success' | 'error'; message: string }>;
```

实现要求：
- 所有动作都只消费**当前可见且已选中**的歌曲，除了双击专用的 `playVisibleTrack`
- `playSelectedTracks`：先 `setQueue(selectedTracks)` 再 `playTrack(startTrack)`
- `startTrack` = active 对应歌曲，若不存在则 fallback 第一首
- `playSelectedTracks` / `addSelectedTracksToQueue` 失败时必须返回结构化错误结果，供 UI 内联反馈，不允许只写 `console.error`
- `addSelectedTracksToPlaylist` 串行执行，累积失败列表，避免吞错
- `playVisibleTrack` 专门服务双击：无论当前是否存在多选，都必须以完整 `visibleTracks` 替换队列，并从被双击行开始播放

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-list-actions.test.ts
```

Expected:
- PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/lib/features/songs-list/actions.ts src/tests/songs-list-actions.test.ts
git commit -m "feat: add songs list action orchestrators"
```

---

### Task 5: 增加组件测试能力，并先写失败的 `SongsView` 集成测试

**Files:**
- Modify: `src/package.json`
- Create: `src/tests/songs-view.test.ts`

- [ ] **Step 1: 安装最小 UI 测试依赖**

Run:
```bash
npm --prefix ./src install -D @testing-library/svelte jsdom
```

Expected:
- `src/package.json` 和 lockfile 更新

- [ ] **Step 2: 写失败的 `SongsView` 集成测试**

创建 `src/tests/songs-view.test.ts`，文件头使用：

```ts
// @vitest-environment jsdom
```

测试中：
- mock `../lib/api/playback`
- mock `../lib/api/playlist`
- 如需要，mock `window.alert`

至少覆盖以下 6 个场景：
1. 单击 + Cmd/Ctrl + 单击 + Shift + 单击后，批量操作条显示正确数量
2. 右键未选中行时，菜单针对该单行
3. 右键已选中行时，菜单保留整组选择
4. 无歌单时，“加入歌单”按钮/菜单项禁用并显示提示
5. 双击未选中行时，用完整 `visibleTracks` 替换队列并从双击行起播，而不是只播放当前选择子集
6. `Enter` / `Space` 仍能播放当前获得焦点的行

示例断言：

```ts
const { getByText, queryByText } = render(SongsView, {
  props: { tracks, isLibraryLoading: false, searchTerm: '' },
});

expect(queryByText('播放选中')).not.toBeNull();
```

- [ ] **Step 3: 运行测试，确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-view.test.ts
```

Expected:
- FAIL，因为当前 `SongsView` 还没有批量操作条 / 新菜单语义 / 歌单禁用态

- [ ] **Step 4: 提交测试基线**

```bash
git add src/package.json src/tests/songs-view.test.ts src/package-lock.json
git commit -m "test: add songs view interaction harness"
```

---

### Task 6: 创建展示组件

**Files:**
- Create: `src/lib/components/songs/SongsTable.svelte`
- Create: `src/lib/components/songs/SongsBulkActionBar.svelte`
- Create: `src/lib/components/songs/SongsContextMenu.svelte`
- Create: `src/lib/components/songs/SongsPlaylistPicker.svelte`

- [ ] **Step 1: 先搭 `SongsBulkActionBar.svelte`**

最小 props：

```ts
export let selectedCount = 0;
export let canAddToPlaylist = true;
export let addToPlaylistHint = '';
```

事件：
- `playSelected`
- `addToQueue`
- `addToPlaylist`
- `clearSelection`

- [ ] **Step 2: 搭 `SongsContextMenu.svelte`**

最小 props：

```ts
export let x = 0;
export let y = 0;
export let canAddToPlaylist = true;
export let addToPlaylistHint = '';
```

固定只渲染三项：
- 播放选中
- 加入队列
- 加入歌单

- [ ] **Step 3: 搭 `SongsPlaylistPicker.svelte`**

最小 props：

```ts
export let playlists: Playlist[] = [];
export let x = 0;
export let y = 0;
```

事件：
- `selectPlaylist`
- `close`

- [ ] **Step 4: 搭 `SongsTable.svelte`**

组件只负责展示和派发事件，不做 API 调用。

最小 props：

```ts
export let tracks: Track[] = [];
export let selectedIds: string[] = [];
export let activeTrackId: string | null = null;
export let playingTrackId: string | null = null;
export let sortKey: SongsSortKey = 'title';
export let sortDirection: SongsSortDirection = 'asc';
```

需要派发的事件 contract：
- `toggleSort`: `{ key: SongsSortKey }`
- `rowClick`: `{ track: Track; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }`
- `rowDoubleClick`: `{ track: Track }`
- `rowKeydown`: `{ track: Track; key: string }`
- `rowContextMenu`: `{ track: Track; x: number; y: number }`

- [ ] **Step 5: 不单独补组件测试，直接准备让 Task 7 的集成测试驱动这些组件接线**

检查：
- 组件不直接 import tauri/mock 模块
- 组件只接收 props 和派发事件

- [ ] **Step 6: 提交本任务**

```bash
git add src/lib/components/songs/SongsTable.svelte src/lib/components/songs/SongsBulkActionBar.svelte src/lib/components/songs/SongsContextMenu.svelte src/lib/components/songs/SongsPlaylistPicker.svelte
git commit -m "feat: add songs list presentational components"
```

---

### Task 7: 重构 `SongsView.svelte` 接入 feature 层与展示组件

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/lib/views/SongsView.svelte`
- Reuse: `src/lib/features/songs-list/selection.ts`
- Reuse: `src/lib/features/songs-list/sort-filter.ts`
- Reuse: `src/lib/features/songs-list/actions.ts`
- Reuse: `src/lib/components/songs/*`
- Reuse: `src/lib/api/playback.ts`
- Reuse: `src/lib/api/playlist.ts`

- [ ] **Step 1: 先把 `playlists` 数据路径打通，再替换原地排序/过滤逻辑**

先在 `src/App.svelte` 把 app-shell 中已有的歌单列表透传给 `SongsView`：

```svelte
<SongsView
  tracks={$tracks}
  playlists={$playlists}
  isLibraryLoading={$isLibraryLoading}
  searchTerm={searchInput}
/>
```

然后在 `SongsView` 中新增：

```ts
export let playlists: Playlist[] = [];
```

接着删掉当前 `filteredTracks` / `sortedTracks` 原地计算，改为：

```ts
import { getVisibleTracks } from '../features/songs-list/sort-filter';

$: visibleTracks = getVisibleTracks(tracks, searchTerm, {
  key: sortKey,
  direction: sortDirection,
});
```

- [ ] **Step 2: 引入选择状态机，并在数据变化时执行 reconcile**

在 `SongsView` 中持有：

```ts
let selection = createSelectionState();
```

把 click / keydown / contextmenu 事件都改为调用 `selection.ts`，而不是直接写在组件里。

关键点：
- 单击未修饰键：整体替换选择
- Cmd/Ctrl：toggle
- Shift：范围选择
- 双击未选中行：先单选该行，再调用 `playVisibleTrack(visibleTracks, clickedTrack, deps)`
- 双击已选中行：保留集合，仅更新 active/anchor，再调用 `playVisibleTrack(...)`
- Enter / Space：继续播放当前获得键盘焦点的可见行

补一条显式 reactive reconcile：

```ts
$: selection = reconcileSelection(
  selection,
  tracks.map((track) => track.id),
  visibleTracks.map((track) => track.id),
);
```

要求：
- 曲库刷新时清掉不存在的 `selectedIds`
- 过滤/排序导致 active/anchor 不再可见时清空它们
- 保留允许隐藏选择存在的语义

- [ ] **Step 3: 接入当前播放行高亮**

不要引入新的全局状态系统；在 `SongsView` 内复用既有 playback API：

```ts
import { getCurrentTrack } from '../api/playback';

let playingTrackId: string | null = null;
```

最小实现策略：
- `onMount` 时拉一次 `getCurrentTrack()`
- 建一个 1000ms interval 轮询当前曲目
- `onDestroy` 时清理 interval
- 本页内触发播放动作成功后，也主动刷新一次 `playingTrackId`

- [ ] **Step 4: 接入批量动作条、右键菜单和歌单选择器**

页面本地状态至少需要：

```ts
let contextMenuOpen = false;
let contextMenuPosition = { x: 0, y: 0 };
let playlistPickerOpen = false;
let playlistPickerPosition = { x: 0, y: 0 };
let feedback = '';
```

要求：
- 当存在当前可见选择时显示 `SongsBulkActionBar`
- 右键菜单固定三项：播放选中 / 加入队列 / 加入歌单
- 以 `playlists.length > 0` 作为第一阶段“可加入歌单”的最小可操作条件
- 没有歌单或歌单加载失败时，“加入歌单”入口禁用并显示“请先创建歌单”
- 从右键菜单触发“加入歌单”时，立即关闭右键菜单，再打开 `SongsPlaylistPicker`
- 点击菜单外部区域关闭右键菜单 / 歌单选择器
- `Escape` 关闭当前打开的右键菜单或歌单选择器
- 反馈先用 `SongsView` 内联状态文字，不引入全局 toast 系统

- [ ] **Step 5: 接入动作编排模块**

用 `actions.ts` 驱动：
- `播放选中`
- `加入队列`
- `加入歌单`
- 双击播放专用 `playVisibleTrack`

推荐 wiring：

```ts
const playResult = await playSelectedTracks({
  visibleTracks,
  selection,
  deps: { setQueue, playTrack },
});
feedback = playResult.message;
```

```ts
const queueResult = await addSelectedTracksToQueue({
  visibleTracks,
  selection,
  deps: { addToQueue },
});
feedback = queueResult.message;
```

playlist 结果映射为反馈文案：
- success → `已加入歌单：X 首`
- partial → `部分成功：已加入 X/Y 首`
- error → `加入歌单失败`

要求：
- `播放选中` 和 `加入队列` 失败时也必须写入内联反馈，不能只打日志
- 双击处理不得复用 `playSelectedTracks`，必须显式走 `playVisibleTrack`
- “清除选择”按钮需要显式接线到 `clearSelection()`，并在集成测试中验证

- [ ] **Step 6: 运行 `SongsView` 集成测试并修到通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-view.test.ts
```

Expected:
- PASS
- 至少覆盖：批量操作条显示、右键菜单语义、无歌单禁用态、`Enter` / `Space` 播放、当前播放行高亮

- [ ] **Step 7: 补一次边界测试与类型检查**

Run:
```bash
npm --prefix ./src run test -- --run tests/boundary-ownership.test.ts
npm --prefix ./src run check
```

Expected:
- boundary ownership PASS
- `svelte-check` 通过

- [ ] **Step 8: 提交本任务**

```bash
git add src/App.svelte src/lib/views/SongsView.svelte src/lib/features/songs-list/selection.ts src/lib/features/songs-list/sort-filter.ts src/lib/features/songs-list/actions.ts src/lib/components/songs/SongsTable.svelte src/lib/components/songs/SongsBulkActionBar.svelte src/lib/components/songs/SongsContextMenu.svelte src/lib/components/songs/SongsPlaylistPicker.svelte src/tests/songs-view.test.ts
git commit -m "feat: wire songs list batch actions and multi-select ui"
```

---

### Task 8: 完整验证与收尾

**Files:**
- Verify only

- [ ] **Step 1: 运行新增 targeted tests**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-list-selection.test.ts tests/songs-list-sort-filter.test.ts tests/songs-list-actions.test.ts tests/songs-view.test.ts
```

Expected:
- 全部 PASS

- [ ] **Step 2: 运行完整前端测试**

Run:
```bash
npm --prefix ./src run test
```

Expected:
- 所有 Vitest 测试 PASS

- [ ] **Step 3: 运行前端静态检查**

Run:
```bash
npm --prefix ./src run check
```

Expected:
- `svelte-check` 退出码 0

- [ ] **Step 4: 运行后端回归测试**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml --all-features -- --nocapture
```

Expected:
- 后端测试全部通过，无 songs-list 相关回归

- [ ] **Step 5: 手动验收清单**

手动确认：
- Songs 页面可单击单选
- Cmd/Ctrl 多选可用
- Shift 连选可用
- 双击未选中行时只播放该行并替换当前队列为可见顺序
- 双击已选中集合中的行时保留集合并播放该行
- 批量操作条数量与当前可见选中一致
- 无歌单时“加入歌单”禁用
- 右键菜单只有三项核心动作
- 当前播放行可视化高亮

- [ ] **Step 6: 提交最终验证结果**

```bash
git status
git add -A
git commit -m "test: verify songs list batch actions implementation"
```

如果没有新增改动，则跳过 commit，只在执行总结中贴出验证命令与结果。

---

## 执行注意事项

- 不要把 tauri/mock 分支判断引入 `SongsView` 或新组件；继续走 `src/lib/api/*` adapter。
- 不要把选择状态提升成新的全局 store。
- 不要顺手做删除文件、移除媒体库、虚拟滚动等超出 spec 的工作。
- 如果在 `SongsView` 中出现大段判断逻辑，优先再回推到 `selection.ts` / `actions.ts`。
- 组件要保持“纯展示 + 事件派发”，不要在组件里直接调 bridge。
- 如果 `@testing-library/svelte` 引入后需要额外小修（例如 test env 提示），优先用测试文件头 `// @vitest-environment jsdom` 解决，不要先扩展成全局测试基础设施重构。

## 最终交付物

实现完成后，应至少包含：
- songs-list 三个纯逻辑模块
- songs-list 四个展示组件
- `SongsView` 重构完成
- 新增 bridge surface（`addToQueue` / `addToPlaylist`）
- 新增单元测试与集成测试
- 前后端验证命令的通过证据
