# 技术设计: 本地歌词获取与展示

## 方案概要
首版仅支持音频文件同名 `.lrc`。后端在切歌时读取并缓存原始歌词文本到 `Track.lyrics`，前端继续使用现有 `get_current_track` 轮询链路，新增 `.lrc` 时间轴解析与当前行高亮。

## 技术方案

### 后端
1. 新增共享歌词加载模块，按音频路径推导同名 `.lrc`
2. 读取歌词文件文本，尽量兼容 UTF-8 / UTF-8 BOM / GB18030
3. 在 `play_track_internal()` 中为当前播放曲目注入歌词，避免 `get_current_track()` 每秒重复读取
4. 在 `play_file()` 临时构造曲目时同样注入歌词，保持直接打开文件播放的一致性

### 前端
1. 复用 `BottomPlayerBar.svelte` 现有歌词面板
2. 去掉硬编码 fallback 文案，改为显式空态
3. 新增 `.lrc` 解析逻辑，支持多时间标签映射到多行
4. 基于播放进度计算当前激活歌词行，并在面板中高亮

## 安全与性能
- 只读取与当前音频同路径的同名 `.lrc`，不遍历目录、不联网
- 歌词只在切歌时读取一次，前端轮询读取缓存结果，避免高频磁盘 IO
- 对无法解析的歌词文件返回空值，不阻断播放

## 架构决策 ADR

### ADR-20260320-local-lyrics
- 状态: 已采纳
- 决策: 首版本地歌词使用同名 `.lrc` 伴生文件，且在后端切歌时一次性注入当前播放曲目
- 原因:
  - 与现有前端 `get_current_track` 轮询链路兼容
  - 修改面最小，不需要新 Tauri command
  - 可避免每秒轮询触发重复文件读取
- 影响模块:
  - `src-tauri/src/services/audio/*`
  - `src-tauri/src/api/audio/mod.rs`
  - `src/lib/player/BottomPlayerBar.svelte`

## 验证计划
- 后端单测覆盖歌词文件发现、编码与当前曲目注入
- 前端单测覆盖歌词解析、空态与当前行高亮
- 运行 `cargo test --manifest-path ./src-tauri/Cargo.toml --all-features -- --nocapture`
- 运行 `npm --prefix ./src test`
- 运行 `npm --prefix ./src run check`

