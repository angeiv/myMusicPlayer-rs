# 专辑封面提取与缓存（Issue #19）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为专辑建立“外部封面优先、嵌入封面兜底、扫描时落盘缓存、UI 稳定 fallback”的完整闭环，并在 AlbumsView + 当前播放区展示真实封面。

**Architecture:**
- **后端（Rust / SQLite）**：把封面处理收敛为 album 级资产；扫描时解析外部图片或音频内嵌图片，标准化后写入应用缓存目录，并把稳定缓存路径写入 `albums.cover_art_path`。Track/Album 查询返回 path 型字段，而不是把大图片字节直接塞进 DTO。
- **前端（Svelte / TS）**：新增统一的封面渲染 helper / 组件，把 `cover_art_path` 转为 `<img src>` 可消费 URL；AlbumsView、BottomPlayerBar、NowPlayingOverlay 共用同一套“真实封面 + 默认唱片 fallback + 图片加载失败降级”逻辑。

**Tech Stack:** Rust + rusqlite + lofty + image crate（新增）+ Tauri 2；Svelte 5 + TypeScript + @tauri-apps/api/core + @testing-library/svelte + Vitest。

---

## Inputs / References

- Spec（已确认）：`docs/superpowers/specs/2026-04-01-cover-art-extraction-cache-design.md`
- Issue：#19 https://github.com/angeiv/myMusicPlayer-rs/issues/19
- 关键代码：
  - 后端扫描：`src-tauri/src/services/library/mod.rs`
  - 后端模型：`src-tauri/src/models/album.rs`, `src-tauri/src/models/track.rs`
  - 工具函数：`src-tauri/src/utils/mod.rs`
  - 前端类型：`src/lib/types.ts`
  - 前端 surface：`src/lib/views/AlbumsView.svelte`, `src/lib/player/BottomPlayerBar.svelte`, `src/lib/player/NowPlayingOverlay.svelte`
  - Mock 数据：`src/lib/mocks/library.ts`, `src/lib/api/mock/library.ts`
  - 现有测试：`src/tests/player-utility-controls.test.ts`, `src/tests/now-playing-overlay.test.ts`

---

## File/Module Map（先锁定边界）

### Backend / Artwork pipeline
- **Modify:** `src-tauri/Cargo.toml`
  - 新增图片解码/缩放依赖（`image`）
- **Create:** `src-tauri/src/services/library/artwork.rs`
  - 外部封面文件发现
  - embedded artwork 兜底提取
  - 缓存 fingerprint 计算
  - 缓存文件写入与路径生成
  - 失败降级为 `None`
- **Modify:** `src-tauri/src/services/library/mod.rs`
  - `mod artwork;`
  - 扫描期间为 album 决定/刷新 `cover_art_path`
  - 查询时把 `cover_art_path` 映射给 `Album` / `Track`
- **Modify:** `src-tauri/src/models/album.rs`
  - 为前端新增 path 型封面字段（例如 `artwork_path`）
- **Modify:** `src-tauri/src/models/track.rs`
  - 为前端新增 path 型封面字段（当前播放区需要）
- **Modify:** `src-tauri/src/api/audio/mod.rs`
  - 临时打开文件时补齐新的 `Track` 字段，避免 DTO 改动后编译失败
- **Modify:** `src-tauri/src/services/audio/player.rs`
  - 补齐直接构造 `Track` 的运行时代码
- **Modify:** `src-tauri/src/services/audio/audio_player_thread.rs`
  - 补齐测试/辅助构造里的 `Track` 字段
- **Modify:** `src-tauri/src/services/audio/play_queue.rs`
  - 补齐测试辅助构造里的 `Track` 字段
- **Modify:** `src-tauri/src/utils/mod.rs`
  - 新增 `app_cache_dir()` 或等价 helper，用于 artwork cache 目录

### Frontend / artwork rendering
- **Modify:** `src/lib/types.ts`
  - `Album` / `Track` 增加 path 型 artwork 字段
- **Create:** `src/lib/utils/artwork.ts`
  - `cover_art_path -> img src` 解析（Tauri 用 `convertFileSrc`，web/mock 原样返回）
- **Create:** `src/lib/components/CoverArt.svelte`
  - 统一渲染：真实封面、默认唱片 fallback、`on:error` 降级
- **Modify:** `src/lib/views/AlbumsView.svelte`
  - 卡片使用 `CoverArt`
- **Modify:** `src/lib/player/BottomPlayerBar.svelte`
  - 当前播放区使用 `CoverArt`
- **Modify:** `src/lib/player/NowPlayingOverlay.svelte`
  - summary 区使用 `CoverArt`
- **Modify:** `src/lib/mocks/library.ts`
  - 给一部分 mock 专辑/曲目补 path 型 artwork mock（建议 data URI）

### Tests
- **Create:** `src-tauri/tests/fixtures/library/cover-art/tagged-track.mp3`
  - 一个极小、可被 Lofty 读取的带 tag 音频 fixture；扫描集成测试复制它到 tempdir 后再写外部封面/改名
- **Create:** `src/tests/albums-view.test.ts`
  - AlbumsView：有图 / 无图 / 图片失败 fallback
- **Create:** `src/tests/cover-art.test.ts`
  - `CoverArt.svelte`：fallback、error 降级、disc placeholder
- **Modify:** `src/tests/player-utility-controls.test.ts`
  - 底栏 artwork 区：当前曲目有图 / 无图
- **Modify:** `src/tests/now-playing-overlay.test.ts`
  - Now Playing 使用同一封面来源
- **Modify / Add Rust tests:** `src-tauri/src/services/library/artwork.rs`, `src-tauri/src/services/library/mod.rs`
  - 外部封面优先、embedded 兜底、源变化后刷新、失败不阻塞扫描

## Test Fixture Strategy（避免实现时卡住）

- Rust artwork 单测优先使用 **runtime-generated fixtures**，不要为 helper 层引入大量二进制测试资源。
- 外部封面测试：在 `tempdir` 中用 `image` crate 生成一个很小的 jpg/png。
- 扫描集成测试：新增一个极小的、可被 Lofty 正常读取的 **带 tag 音频 fixture**：`src-tauri/tests/fixtures/library/cover-art/tagged-track.mp3`；测试时把它复制到 `tempdir` 并改成目标专辑目录 / 文件名，再叠加 `cover.jpg` 或删除 cover 源做重扫断言。
- embedded artwork 测试：限制在 `src-tauri/src/services/library/artwork.rs` 的单元测试里，使用 helper 写入带 picture 的临时音频副本或直接针对 extracted bytes helper 测试；不要把“生成带封面 FLAC/MP3 fixture”扩散到 library 全链路集成测试。

---

## Task 0: 创建实现 worktree（隔离开发环境）

**Files:** none

- [ ] **Step 1: 创建 worktree 与分支**

Run:
```bash
git fetch origin
git worktree add -b issue-19-cover-art-cache .worktrees/issue-19-cover-art-cache origin/main
```

- [ ] **Step 2: 安装前端依赖**

Run:
```bash
cd .worktrees/issue-19-cover-art-cache
npm --prefix ./src ci
```

- [ ] **Step 3: 基线验证**

Run:
```bash
just qa
```
Expected: PASS

---

## Task 1: 建立后端 artwork helper（来源优先级 + 缓存路径）

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/utils/mod.rs`
- Create: `src-tauri/src/services/library/artwork.rs`

- [ ] **Step 1: 写失败测试：外部封面优先于 embedded artwork**

在 `src-tauri/src/services/library/artwork.rs` 新增测试（示意）：
```rust
#[test]
fn prefers_external_cover_over_embedded_artwork() {
    let fixture = ArtworkFixture::new()
        .with_external_cover("cover.jpg")
        .with_embedded_cover("track01.flac");

    let source = resolve_album_artwork_source(&fixture.album_dir, &fixture.track_paths)
        .expect("source lookup should succeed");

    assert!(matches!(source, Some(ArtworkSource::External { .. })));
}
```

- [ ] **Step 2: 写失败测试：无外部图时回退 embedded artwork**

```rust
#[test]
fn falls_back_to_embedded_artwork_when_no_external_cover_exists() {
    let fixture = ArtworkFixture::new().with_embedded_cover("track01.flac");

    let source = resolve_album_artwork_source(&fixture.album_dir, &fixture.track_paths)
        .expect("source lookup should succeed");

    assert!(matches!(source, Some(ArtworkSource::Embedded { .. })));
}
```

- [ ] **Step 3: 写失败测试：源指纹变化会改变缓存文件名**

```rust
#[test]
fn cache_file_name_changes_when_source_fingerprint_changes() {
    let first = artwork_cache_file_name("album-id", "path:a|size:1|mtime:10");
    let second = artwork_cache_file_name("album-id", "path:a|size:1|mtime:11");

    assert_ne!(first, second);
}
```

- [ ] **Step 4: 运行测试确认失败**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml artwork -- --nocapture
```
Expected: FAIL（模块/函数不存在）

- [ ] **Step 5: 最小实现 artwork helper 与 cache dir**

实现内容：
- `src-tauri/Cargo.toml` 增加 `image = "..."`
- `src-tauri/src/utils/mod.rs` 增加：
```rust
pub fn app_cache_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|mut dir| {
        dir.push("music-player-rs");
        dir
    })
}
```
- `src-tauri/src/services/library/artwork.rs` 实现：
  - `ArtworkSource::{ External, Embedded }`
  - `resolve_album_artwork_source(album_dir, track_paths)`
  - 常见外部文件名匹配（大小写不敏感）
  - `write_cached_artwork(...)`：统一缩放并写入 `<cache>/artwork/<album-id>-<fingerprint>.jpg`
  - 失败返回 `Ok(None)`，不 panic

- [ ] **Step 6: 运行测试确认通过**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml artwork -- --nocapture
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/utils/mod.rs src-tauri/src/services/library/artwork.rs
git commit -m "feat(library): add artwork cache helpers"
```

---

## Task 2: 扫描链路写入 `cover_art_path`，并把 path 型字段暴露给前端

**Files:**
- Modify: `src-tauri/src/services/library/mod.rs`
- Modify: `src-tauri/src/models/album.rs`
- Modify: `src-tauri/src/models/track.rs`
- Modify: `src-tauri/src/api/audio/mod.rs`
- Modify: `src-tauri/src/services/audio/player.rs`
- Modify: `src-tauri/src/services/audio/audio_player_thread.rs`
- Modify: `src-tauri/src/services/audio/play_queue.rs`

- [ ] **Step 1: 写失败测试：扫描时会为 album 写入 `cover_art_path`**

在 `src-tauri/src/services/library/mod.rs` 的测试区新增用例（示意）：
```rust
#[test]
fn scan_persists_cover_art_path_for_album() {
    let fixture = scan_fixture_with_external_cover();
    let mut service = open_test_library_service();

    service.scan_directory(fixture.root()).expect("scan should succeed");
    let albums = service.get_albums().expect("albums query should succeed");

    assert!(albums[0].artwork_path.as_deref().is_some_and(|path| path.ends_with(".jpg")));
}
```

- [ ] **Step 2: 写失败测试：Track 查询也能带出同一个封面路径**

```rust
#[test]
fn track_queries_expose_album_artwork_path() {
    let fixture = scan_fixture_with_external_cover();
    let mut service = open_test_library_service();

    service.scan_directory(fixture.root()).expect("scan should succeed");
    let tracks = service.get_tracks().expect("tracks query should succeed");

    assert!(tracks[0].artwork_path.as_deref().is_some_and(|path| path.ends_with(".jpg")));
}
```

- [ ] **Step 3: 写失败测试：源未变化时复用已有缓存路径；缓存文件丢失时重建**

```rust
#[test]
fn unchanged_source_reuses_cache_path_but_missing_cache_file_is_regenerated() {
    let fixture = scan_fixture_with_external_cover();
    let mut service = open_test_library_service();

    service.scan_directory(fixture.root()).expect("first scan should succeed");
    let first_path = service.get_albums().unwrap()[0].artwork_path.clone().unwrap();

    service.scan_directory(fixture.root()).expect("second scan should succeed");
    let reused_path = service.get_albums().unwrap()[0].artwork_path.clone().unwrap();
    assert_eq!(first_path, reused_path);

    std::fs::remove_file(&reused_path).unwrap();
    service.scan_directory(fixture.root()).expect("third scan should rebuild cache");
    let rebuilt_path = service.get_albums().unwrap()[0].artwork_path.clone().unwrap();
    assert_eq!(first_path, rebuilt_path);
    assert!(std::path::Path::new(&rebuilt_path).exists());
}
```

- [ ] **Step 4: 写失败测试：封面源变化后，下次扫描会刷新缓存路径**

```rust
#[test]
fn changing_cover_source_refreshes_cover_art_path_on_rescan() {
    let fixture = scan_fixture_with_external_cover();
    let mut service = open_test_library_service();

    service.scan_directory(fixture.root()).expect("first scan should succeed");
    let first_path = service.get_albums().unwrap()[0].artwork_path.clone().unwrap();

    fixture.replace_external_cover_with_new_image();
    service.scan_directory(fixture.root()).expect("second scan should succeed");
    let second_path = service.get_albums().unwrap()[0].artwork_path.clone().unwrap();

    assert_ne!(first_path, second_path);
}
```

- [ ] **Step 5: 写失败测试：封面消失后会清空 `cover_art_path`**

```rust
#[test]
fn removing_cover_source_clears_cover_art_path() {
    let fixture = scan_fixture_with_external_cover();
    let mut service = open_test_library_service();

    service.scan_directory(fixture.root()).expect("first scan should succeed");
    fixture.remove_external_cover();

    service.scan_directory(fixture.root()).expect("second scan should succeed");
    let albums = service.get_albums().expect("albums query should succeed");

    assert!(albums[0].artwork_path.is_none());
}
```

- [ ] **Step 6: 写失败测试：封面解析失败不阻塞扫描**

```rust
#[test]
fn corrupt_artwork_does_not_abort_scan() {
    let fixture = scan_fixture_with_broken_cover();
    let mut service = open_test_library_service();

    let inserted = service.scan_directory(fixture.root()).expect("scan should still succeed");
    let albums = service.get_albums().expect("albums query should succeed");

    assert!(inserted > 0);
    assert!(albums.iter().all(|album| album.artwork_path.is_none()));
}
```

- [ ] **Step 7: 运行测试确认失败**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml cover_art_path -- --nocapture
```
Expected: FAIL（字段/行为尚未实现）

- [ ] **Step 8: 扩展模型，改为 path 型字段对外暴露，并补齐所有直接构造 `Track` 的位置**

在 `src-tauri/src/models/album.rs` / `track.rs` 增加：
```rust
pub artwork_path: Option<String>,
```

并同步更新：
- `src-tauri/src/api/audio/mod.rs`
- `src-tauri/src/services/audio/player.rs`
- `src-tauri/src/services/audio/audio_player_thread.rs`
- `src-tauri/src/services/audio/play_queue.rs`

说明：
- 不删除现有 `artwork` 字节字段也可以，但前端主链路统一消费 `artwork_path`
- `Default` / 构造函数 / 测试 helper 一起补齐，避免第一次编译就卡住

- [ ] **Step 9: 在 library scan/query 中真正写入和映射 `cover_art_path`**

在 `src-tauri/src/services/library/mod.rs`：
- `mod artwork;`
- 不要在“当前这首刚入库的 track”上直接决定最终封面；改为封装一个 album 级 refresh helper（例如 `refresh_album_artwork(tx, album_id)`）
- 这个 helper 必须先查询该 album 的 **全部 sibling track 路径**，再交给 artwork helper 做“外部封面优先、embedded artwork 取全专辑第一张可用图”的决策，避免扫描顺序影响结果
- 若源未变化且缓存文件仍存在，则复用已有 `cover_art_path`
- 若缓存文件丢失，则按同一 fingerprint 路径重建缓存文件
- 若本次扫描后 album 已无可用 artwork source，则把 `cover_art_path` 清空为 `NULL`
- `Album` 查询 row 映射：
```rust
artwork_path: row.get::<_, Option<String>>("cover_art_path")?,
```
- `Track` 查询通过 `LEFT JOIN albums al` 后，同样把 album 的 `cover_art_path` 映射进 track DTO（`row_to_track` + 相关 select 列都要同步）

- [ ] **Step 10: 运行测试确认通过**

Run:
```bash
cargo test --manifest-path ./src-tauri/Cargo.toml cover_art_path -- --nocapture
```
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/services/library/mod.rs src-tauri/src/models/album.rs src-tauri/src/models/track.rs src-tauri/src/api/audio/mod.rs src-tauri/src/services/audio/player.rs src-tauri/src/services/audio/audio_player_thread.rs src-tauri/src/services/audio/play_queue.rs src-tauri/tests/fixtures/library/cover-art/tagged-track.mp3
git commit -m "feat(library): expose cached cover art paths"
```

---

## Task 3: 前端 artwork contract + 通用封面组件

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/utils/artwork.ts`
- Create: `src/lib/components/CoverArt.svelte`
- Modify: `src/lib/mocks/library.ts`
- Test: `src/tests/cover-art.test.ts`

- [ ] **Step 1: 写失败测试：`CoverArt` 在无图时显示默认唱片 fallback**

在 `src/tests/cover-art.test.ts` 新增：
```ts
it('renders the disc fallback when artworkPath is missing', () => {
  render(CoverArt, { props: { title: 'Midnight Echoes', artworkPath: null } });

  expect(screen.getByTestId('cover-art-fallback')).toHaveTextContent('♪');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 写失败测试：图片加载失败会自动退回 fallback**

```ts
it('falls back when the image errors', async () => {
  render(CoverArt, { props: { title: 'Midnight Echoes', artworkPath: '/broken.jpg' } });

  const image = screen.getByRole('img', { name: 'Midnight Echoes 封面' });
  await fireEvent.error(image);

  expect(screen.getByTestId('cover-art-fallback')).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/cover-art.test.ts
```
Expected: FAIL（组件/字段不存在）

- [ ] **Step 4: 最小实现 path helper + CoverArt 组件 + mock artwork**

实现内容：
- `src/lib/types.ts`：`Track` / `Album` 增加 `artwork_path?: string | null`
- `src/lib/utils/artwork.ts`：
```ts
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from './env';

export function resolveArtworkSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  return isTauri ? convertFileSrc(path) : path;
}
```
- `src/lib/components/CoverArt.svelte`：
  - `artworkPath`, `title`, `size`, `rounded`
  - `<img>` + `on:error` 切 fallback
  - fallback 采用默认唱片样式，`data-testid="cover-art-fallback"`
- `src/lib/mocks/library.ts`：至少给 `Midnight Echoes` / `Silver Skyline` 补一个可渲染的 data URI artwork path

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/cover-art.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/utils/artwork.ts src/lib/components/CoverArt.svelte src/lib/mocks/library.ts src/tests/cover-art.test.ts
git commit -m "feat(ui): add reusable cover art component"
```

---

## Task 4: AlbumsView 接入真实封面与 fallback

**Files:**
- Modify: `src/lib/views/AlbumsView.svelte`
- Test: `src/tests/albums-view.test.ts`

- [ ] **Step 1: 写失败测试：AlbumsView 有图时渲染 `<img>`，无图时渲染 fallback**

在 `src/tests/albums-view.test.ts` 新增：
```ts
it('renders artwork images when available and disc fallback otherwise', () => {
  render(AlbumsView, {
    props: {
      albums: [
        { id: 'a1', title: 'Midnight Echoes', artist_name: 'Aurora Finch', artwork_path: 'data:image/svg+xml,...', track_count: 1, duration: 60, date_added: '2024-01-01T00:00:00Z' },
        { id: 'a2', title: 'No Cover', artist_name: 'Aurora Finch', artwork_path: null, track_count: 1, duration: 60, date_added: '2024-01-01T00:00:00Z' },
      ],
    },
  });

  expect(screen.getByRole('img', { name: 'Midnight Echoes 封面' })).toBeInTheDocument();
  expect(screen.getAllByTestId('cover-art-fallback')).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/albums-view.test.ts
```
Expected: FAIL

- [ ] **Step 3: 最小改造 AlbumsView**

在 `src/lib/views/AlbumsView.svelte`：
- 引入 `CoverArt`
- 用 `album.artwork_path` 替换当前首字母 artwork 块
- 保持卡片布局稳定，不因图片缺失塌陷

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/albums-view.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/views/AlbumsView.svelte src/tests/albums-view.test.ts
git commit -m "feat(albums): show cached cover art on album cards"
```

---

## Task 5: 当前播放区（底栏 + Now Playing）统一接入专辑封面

**Files:**
- Modify: `src/lib/player/BottomPlayerBar.svelte`
- Modify: `src/lib/player/NowPlayingOverlay.svelte`
- Modify: `src/tests/player-utility-controls.test.ts`
- Modify: `src/tests/now-playing-overlay.test.ts`

- [ ] **Step 1: 写失败测试：BottomPlayerBar 有图时渲染封面，无图时 fallback**

在 `src/tests/player-utility-controls.test.ts` 增加：
```ts
it('shows artwork for the current track when artwork_path is present', () => {
  render(BottomPlayerBar);
  expect(screen.getByRole('img', { name: 'Silver Skyline 封面' })).toBeInTheDocument();
});
```

并增加一组无图 mock 断言 fallback。

- [ ] **Step 2: 写失败测试：NowPlayingOverlay 与底栏使用同一封面来源**

在 `src/tests/now-playing-overlay.test.ts` 增加：
```ts
it('reuses the current track artwork inside the overlay summary', () => {
  render(NowPlayingOverlay);
  expect(screen.getByRole('img', { name: 'Silver Skyline 封面' })).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:
```bash
npm --prefix ./src run test -- --run tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts
```
Expected: FAIL

- [ ] **Step 4: 最小实现：替换底栏 / overlay 的 artwork UI**

在两个组件中：
- 删除 `title.charAt(0)` / `artworkLabel()` 占位实现
- 改用统一 `CoverArt`
- `BottomPlayerBar` 传 `currentTrack?.artwork_path`
- `NowPlayingOverlay` 传 `currentTrack?.artwork_path`
- 无图时统一显示默认唱片 fallback

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
npm --prefix ./src run test -- --run tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/player/BottomPlayerBar.svelte src/lib/player/NowPlayingOverlay.svelte src/tests/player-utility-controls.test.ts src/tests/now-playing-overlay.test.ts
git commit -m "feat(player): show album artwork in playback surfaces"
```

---

## Task 6: 全量回归、手工验证、PR

**Files:**
- Docs / issue body as needed

- [ ] **Step 1: 跑 Rust / 前端 gate**

Run:
```bash
just qa
```
Expected: PASS

- [ ] **Step 2: 跑 #19 关键前端回归子集**

Run:
```bash
npm --prefix ./src run test -- --run tests/cover-art.test.ts tests/albums-view.test.ts tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts
```
Expected: PASS

- [ ] **Step 3: 手工烟测（Tauri 或 web mock）**

至少验证：
- Albums 页面：有封面专辑显示真实图
- Albums 页面：无图专辑显示默认唱片 fallback
- BottomPlayerBar：当前曲目显示专辑封面
- NowPlayingOverlay：与底栏显示同一封面来源
- 替换目录中的 `cover.jpg` 后，下次扫描能看到更新后的封面

- [ ] **Step 4: 更新 issue / PR 说明并提交**

建议用 `--body-file`：
```bash
gh pr create --title "feat(library): 专辑封面提取与缓存（#19）" --body-file .tmp/pr-issue-19-body.md
```

- [ ] **Step 5: Commit / push**

```bash
git status
git push -u origin issue-19-cover-art-cache
```

---

## Verification Checklist（实现完成前必须满足）

- [ ] 外部封面优先于 embedded artwork
- [ ] 无外部封面时能回退 embedded artwork
- [ ] Track 查询与 Album 查询都能拿到正确 `artwork_path`
- [ ] 源未变化时复用已有缓存路径
- [ ] 缓存文件丢失时会在下次扫描重建
- [ ] 封面源消失后会清空 `cover_art_path`
- [ ] 源变化后，下次扫描会刷新缓存路径
- [ ] 封面损坏不会阻塞扫描主流程
- [ ] AlbumsView 展示真实封面 / fallback
- [ ] BottomPlayerBar 与 NowPlayingOverlay 使用同一封面来源
- [ ] 图片加载失败时自动退回默认唱片 fallback
- [ ] `just qa` 通过

---

## Notes for Implementers

- 保持 **DRY / YAGNI**：本期不要顺手扩到 Playlist / Artist / SearchResults。
- 不要把图片字节重新塞回前端 DTO 主链路；UI 统一消费 path 型字段。
- 缓存 GC 不是本期目标；先保证 DB 指向最新可用的 `cover_art_path`。
- 新增前端 helper/组件时，优先复用，不要在 AlbumsView / BottomPlayerBar / NowPlayingOverlay 各写一套 fallback 逻辑。
