# 数据模型

## 概述
项目的数据模型分为两部分：
- 后端 SQLite 中持久化曲库元信息
- 前后端共享的运行时 DTO，用于 Tauri command 序列化

## 关键模型

### Track

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | 主键 | 曲目唯一标识 |
| title | String | 非空 | 歌曲标题 |
| path | PathBuf / string | 非空 | 音频文件路径 |
| duration | u32 | 非空 | 秒级时长 |
| artist_name | Option<String> | 可空 | 艺术家展示名 |
| album_title | Option<String> | 可空 | 专辑名 |
| lyrics | Option<String> | 可空 | 当前返回给前端的原始歌词文本 |

### PlaybackState

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| state | enum | 非空 | `stopped` / `playing` / `paused` / `error` |
| position | number | 条件存在 | 当前播放秒数 |
| duration | number | 条件存在 | 当前曲目秒数 |

## SQLite 表

### `tracks`

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | 主键 | 曲目 ID |
| title | TEXT | 非空 | 标题 |
| file_path | TEXT | 非空、唯一 | 音频路径 |
| duration | INTEGER | 非空 | 秒级时长 |
| format | TEXT | 非空 | 文件格式 |
| play_count | INTEGER | 默认 0 | 播放次数 |
| last_played | INTEGER | 可空 | 最近播放时间 |

## 伴生资源
- 同名 `.lrc` 文件不入库，作为与音频文件同路径的运行时伴生资源读取

