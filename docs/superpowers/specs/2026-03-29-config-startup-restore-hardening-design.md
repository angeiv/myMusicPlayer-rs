# 配置与启动恢复加固（MVP1 / Issue #17）设计稿

> 目标：把当前“能保存一些字段”的配置链路提升到“可稳定驱动启动行为”的级别，形成可验证的启动闭环。

- 关联 Issue：#17 https://github.com/angeiv/myMusicPlayer-rs/issues/17
- 本稿结论：采用 **方案 A（后端保证 config 永不崩 + 前端按职责应用）**

---

## 1. 背景与现状

现有关键点（仅列与本议题相关部分）：

- 后端配置模型：`src-tauri/src/models/mod.rs` 的 `Config`
  - 当前字段：`library_paths/default_volume/auto_scan/theme/output_device_id/last_track_id/last_position_seconds`
  - `#[serde(default)]` + `Default` 已提供基础回退。

- 后端配置 API：`src-tauri/src/api/config/mod.rs`
  - `get_config / save_config`
  - `set_last_session`

- 前端配置读取/归一化：`src/lib/transport/config.ts`
  - `normalizeConfigForRestore`（AppShell 启动用：theme/autoScan/libraryPaths/outputDeviceId/defaultVolume）
  - `normalizeConfigForSettings`（SettingsView UI 用）
  - `normalizeConfigSession`（last session 用）

- 启动时配置应用现状：`src/lib/features/app-shell/store.ts`
  - `bootstrap()` 会读取 config，应用 theme，并在 `auto_scan` 置真且有路径时执行扫描，然后加载库与歌单。

- 播放侧 last session：`src/lib/stores/playback.ts`
  - `togglePlayPause()` 在 stopped 时会调用 `restoreLastSession()` 尝试恢复，然后播放。

当前主要缺口（与 #17 验收标准对齐）：

1) **配置损坏容错不足**：当 `config.json` 损坏/无法解析时，应该“安全回退 + 自动修复”，且避免备份文件无限增长。
2) **启动恢复不够确定**：需要明确启动恢复顺序与职责边界，避免 UI 初始状态与最终状态不一致。
3) **播放模式未纳入配置闭环**：当前播放模式跨重启不保证一致。
4) **输出设备持久化闭环不完整**：Settings 能保存，但底部播放器栏切换输出设备后，未必持久化（期望跨重启一致）。
5) **last session 失败需要一次性清理**：避免每次点播放都反复失败。

---

## 2. 目标与非目标

### 2.1 目标（MVP）

- 配置读取与回退：
  - `config.json` 缺失/损坏/字段缺失/旧字段时，应用仍可启动。
  - 损坏时采取 **“备份后回退默认，并生成新 config.json”**。
  - 为避免历史堆积：**最多保留最近 5 份备份**，超出自动清理（best-effort）。

- 启动闭环（可测试）：
  - 启动时能稳定读取并应用：库路径、主题、自动扫描、默认音量、输出设备、播放模式。
  - 自动扫描行为可配置，失败有明确处理（记录/提示，但不阻塞启动）。

- last session（用户确认的语义）：
  - **不自动播放**。
  - 仅当用户点击“播放”且当前 `stopped` 时：尝试从 `last_track_id/last_position_seconds` 恢复并开始播放。
  - 若恢复失败（找不到 track 或无法播放）：**自动清除 last session**（写回 config），并回退到“选择文件播放”。

- 偏好持久化：
  - 播放模式（shuffle/repeat → backend play_mode）**持久化到 config**，并在启动时恢复。
  - 输出设备选择（包括底部播放器栏切换）**持久化到 config**，并在启动时恢复。

### 2.2 非目标

- 完整设置中心重设计。
- 文件系统实时监听/增量同步。
- 启动即把上次曲目加载为 paused（本期不做；按“点播放再恢复”）。

---

## 3. 方案对比

### 方案 A（推荐）：后端保证 config 永不崩 + 前端按职责应用

- Rust：`get_config()` 尽量**永远返回可用 Config**（缺失/损坏都回退默认；损坏会备份并生成新文件）。
- 前端：
  - AppShell：主题 + autoScan + 扫描/加载库
  - PlaybackStore：默认音量 + 输出设备 + 播放模式（以及 last session 仅在用户点击播放时触发）

优点：边界清晰、启动更确定，且便于单测。

### 方案 B：全部集中在 AppShell bootstrap

需要显式控制 BottomPlayerBar 的 playback store 启动时机（等待 bootstrap 完成），改动面更大。

---

## 4. 数据模型与字段约定

### 4.1 后端 Config 新增字段：play_mode

- Rust：在 `Config` 增加字段：
  - `play_mode: String`
  - 默认值：`"sequential"`

说明：与现有 backend play mode 字符串保持一致（`sequential/random/single_repeat/list_repeat`）。

### 4.2 前端 AppConfig 扩展

- TS：在 `src/lib/types.ts` 的 `AppConfig` 增加：
  - `play_mode?: string | null`

并在需要处做值域校验（非法值回退 `sequential`）。

---

## 5. 后端实现设计：损坏备份 + 自动修复 + 备份清理

### 5.1 修复策略

当 `config.json` 无法解析：

1) 将当前 `config.json` 重命名为 `config.json.broken-<unix_ms>`（best-effort）。
2) 生成 `Config::default()` 并 **写回新的 `config.json`**（best-effort）。
3) 返回 `Config::default()` 给前端。

> 说明：让 `get_config` 带有“修复副作用”，是为了避免每次启动/每次读取都重复遇到损坏文件。

### 5.2 备份保留策略（用户确认）

- 在 config 目录中，匹配备份文件：`config.json.broken-*`
- 保留策略：**最多保留最近 5 份**；排序规则：优先从文件名解析 `<unix_ms>`，解析失败则回退按文件修改时间（mtime）排序。
- 清理：删除多余的更旧备份（best-effort；任何删除失败仅 log，不阻塞启动）

### 5.3 并发与写入原子性（避免互相覆盖/再次损坏）

背景问题：
- `save_config` / `set_last_session` / 路径增删等命令都会执行 “load → 修改 → write”。
- `set_last_session` 在播放过程中会高频写入（节流后仍会周期性发生），如果与其它配置写入并发，可能发生“互相覆盖”导致偏好丢失（例如 play_mode/output_device_id 回退）。

MVP 方案：
- 在 `AppState` 增加 `config_lock: Arc<Mutex<()>>`（或等价实现），所有涉及 config 读写/修复的命令在执行 load/write 时持有该锁，确保串行化。
- 写入采用原子替换（best-effort）：写到 `config.json.tmp` 后再 rename 覆盖 `config.json`，降低部分写导致的文件损坏风险。

---

## 6. 前端启动恢复与职责边界

### 6.1 AppShell 负责内容（启动壳）

- `bootstrapDesktopShell()`
- `get_config()` → 应用 theme
- 不在 AppShell 里应用 `default_volume/output_device_id/play_mode`（避免与 PlaybackStore 并发竞态；由 PlaybackStore.start 统一负责）
- 若 `auto_scan` 且 `library_paths` 非空：`await runLibraryScan(paths)`，任何错误只记录并继续后续 `loadLibrary/loadPlaylists`
- `loadLibrary()` / `loadPlaylists()`

### 6.2 PlaybackStore 负责内容（播放/音频偏好）

PlaybackStore 在 `start()` 时：

1) 读取 config：`default_volume/output_device_id/play_mode`
2) 应用到后端：
   - `set_volume(default_volume)`
   - `set_output_device(output_device_id)`
   - `set_play_mode(play_mode)`
3) 再执行现有刷新：`refreshState/refreshPlayMode/refreshOutputDeviceState`
4) 启动轮询 interval

调用时机说明（当前代码结构）：
- `BottomPlayerBar.svelte` 在 `onMount` 调用 `playback.start()`。
- `BottomPlayerBar` 在 `src/App.svelte` 根组件中常驻渲染，因此该 `start()` 发生在应用启动早期。

失败策略：任一应用失败只 log（或写入可见的 UI error），不阻塞启动；失败后回退到后端实际值（通过 refresh 读回）。

> 关键目标：避免“底栏先读到默认 output device，之后又不刷新”的不一致。

---

## 7. 偏好持久化闭环

### 7.1 播放模式持久化（用户确认：要做）

当用户在底栏切换 shuffle / repeat：

1) 调用后端 `set_play_mode`（现有能力）
2) 成功后写回 config（读-改-写，避免 partial 覆盖）：
   - `base = await getConfig()`（调用 `get_config`）
   - `next = { ...base, play_mode: <next> }`
   - `await saveConfig(next)`（调用 `save_config`）

### 7.2 输出设备持久化（用户确认：底栏切换也要持久化）

当用户在底栏切换输出设备：

1) 调用后端 `set_output_device`
2) 成功后写回 config（读-改-写，避免 partial 覆盖）：
   - `base = await getConfig()`（调用 `get_config`）
   - `next = { ...base, output_device_id: <next> }`
   - `await saveConfig(next)`（调用 `save_config`）

### 7.3 配置写入的“覆盖风险”

SettingsView 当前保存配置时会基于本地缓存 `config` 组装整份对象，可能覆盖掉底栏刚更新的字段。

MVP 修正：
- SettingsView 保存时，每次以 `await getConfig()` 作为 base，再合并 overrides 与当前 UI 字段，避免写回旧值。

（可选增强，非 MVP 必需）：
- 在前端提供一个 `updateConfigPatch(patch)` helper，并用 promise chain 串行化写入，降低并发写导致的丢更新风险。

---

## 8. last session 行为（用户确认的语义）

- 启动：不自动播放，也不预览 last session。
- 仅当用户点击播放且当前 `stopped`：
  - 读取 `last_track_id/last_position_seconds`
  - 若存在且 track 可加载：设置队列 → 播放 → seek 到位置（>0）
  - 若恢复失败：调用 `set_last_session(null, 0)` 清理 last session，然后回退到“选择文件播放”。

---

## 9. 测试与验证

### 9.1 Rust（后端）

- `load_config`：
  - 缺失文件 → 返回 default
  - 损坏 JSON → 备份生成 + 生成新 config.json + 返回 default
  - 备份保留策略：超过 5 份时会清理旧备份（best-effort）

建议使用 `tempfile` 构造临时目录，避免污染真实 config 目录。

### 9.2 前端（Vitest）

- PlaybackStore：
  - `start()` 会先应用 `default_volume/output_device_id/play_mode` 再刷新 UI state
  - 切换 shuffle/repeat 后会写回 `play_mode` 到 config（通过 deps stub 断言）
  - 切换输出设备后会写回 `output_device_id` 到 config（通过 deps stub 断言）

- SettingsView：
  - 保存 config 时不会覆盖 `play_mode`（通过“base 从 getConfig 读取”来保证）

---

## 10. 迁移与兼容性

- 旧 config.json 缺少 `play_mode` 字段：
  - Rust `#[serde(default)]` 自动补默认 `sequential`
  - 前端遇到 `play_mode` 缺失/非法：回退 `sequential`

---

## 11. 里程碑与交付物

- 本设计稿通过后：进入 `writing-plans`，拆分为可执行任务（Rust + 前端）并列出验证命令。
