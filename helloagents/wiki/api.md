# API 手册

## 概述
前端通过 Tauri command 调用本地后端能力。当前主要分为音频控制、曲库查询与播放列表管理三类接口。

## 接口列表

### 音频模块

#### `play(track)`
- 描述: 播放指定曲目并切换当前播放状态
- 输入: `Track`
- 输出: `Result<(), String>`

#### `get_playback_state()`
- 描述: 获取当前播放状态
- 输出: `PlaybackState`

#### `get_current_track()`
- 描述: 获取当前播放曲目，前端轮询歌词和元信息依赖该接口
- 输出: `Option<Track>`

#### `set_queue(tracks)`
- 描述: 设置播放队列
- 输入: `Vec<Track>`
- 输出: `Result<(), String>`

### 曲库模块

#### `scan_directory(path)`
- 描述: 扫描目录中的音频文件并写入 SQLite
- 输入: `PathBuf`
- 输出: 插入或更新的曲目数量

#### `get_tracks()`
- 描述: 获取曲库中所有歌曲
- 输出: `Vec<Track>`

#### `get_track(id)`
- 描述: 按主键查询单首歌曲
- 输出: `Option<Track>`

### 播放列表模块

#### `get_playlists()`
- 描述: 获取播放列表集合
- 输出: `Vec<Playlist>`

