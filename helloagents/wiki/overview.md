# myMusicPlayer-rs

> 本文件记录项目级核心信息，详细模块说明见 `modules/`。

## 1. 项目概述

### 目标与背景
myMusicPlayer-rs 是一个跨平台桌面音乐播放器，采用 Tauri 2 组合 Rust 后端与 Svelte 5 前端，目标是提供本地音乐库扫描、播放控制、播放队列与设备切换等能力。

### 范围
- 范围内: 本地曲库扫描、播放控制、队列、设备切换、基础详情视图、播放状态轮询
- 范围外: 在线歌词服务、流媒体服务集成、云端同步

## 2. 模块索引

| 模块名称 | 职责 | 状态 | 文档 |
|---------|------|------|------|
| backend-audio | 音频播放线程、队列、设备与当前播放状态 | 稳定 | [modules/backend-audio.md](modules/backend-audio.md) |
| backend-library | 曲库扫描、SQLite 持久化、检索 | 稳定 | [modules/backend-library.md](modules/backend-library.md) |
| backend-playlist | 播放列表管理 | 稳定 | [modules/backend-playlist.md](modules/backend-playlist.md) |
| frontend-player | 底部播放器、歌词面板、播放状态交互 | 开发中 | [modules/frontend-player.md](modules/frontend-player.md) |
| frontend-library-views | 歌曲/专辑/艺人/播放列表视图 | 稳定 | [modules/frontend-library-views.md](modules/frontend-library-views.md) |

## 3. 快速链接
- [技术约定](../project.md)
- [架构设计](arch.md)
- [API 手册](api.md)
- [数据模型](data.md)
- [变更历史](../history/index.md)

