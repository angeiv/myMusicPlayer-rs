# [MVP2][P0] 本地歌词：播放器模式 / 歌词全屏（Now Playing）（Issue #20）设计稿

- Date: 2026-03-31
- Issue: #20 <https://github.com/angeiv/myMusicPlayer-rs/issues/20>
- Related:
  - #21（队列与 Now Playing 体验完善，已合并）<https://github.com/angeiv/myMusicPlayer-rs/issues/21>
  - #17（配置与启动恢复加固，已合并）<https://github.com/angeiv/myMusicPlayer-rs/issues/17>

> 本文为 **设计稿（spec）**，不包含实现。

---

## 1. 背景与设计目标

当前项目已经具备：
- 后端本地歌词加载能力（同名 `.lrc`）。
- 底栏歌词浮层 / 歌词解析基础。
- 队列基础能力与可复用 `QueueList` 组件（由 #21 提供）。

但“歌词”仍未成为“当前播放”的主交互场景，距离主流播放器的沉浸式体验还有明显差距：
- 没有 Now Playing 覆盖层。
- 歌词的自动跟随 / 手动浏览 / 恢复跟随缺少明确交互合同。
- 当前歌曲信息、歌词、队列之间缺少统一的“正在播放”视图。

本设计稿的目标是：
1. 建立 **Now Playing 覆盖层**（不是新页面路由）。
2. 默认展示歌词页，并保留队列 Tab（复用 #21 的队列能力）。
3. 建立“自动跟随 + 手动滚动浏览 + 选中歌词行 seek + 5 秒自动恢复”的完整歌词交互合同。

---

## 2. 范围 / 非目标

### 2.1 本期范围（MVP2 P0）

- 点击底栏左下角当前播放歌曲区，打开 **Now Playing 覆盖层**。
- 覆盖层隐藏侧栏/顶部，但 **保留底栏控制**。
- 默认进入「歌词」Tab；可切换到「队列」Tab。
- 对带时间戳歌词（LRC）支持：
  - 当前行高亮
  - 自动跟随
  - 用户滚动后暂停自动跟随
  - 水平辅助线 + 右侧“▶︎ + 时间”胶囊
  - 点击胶囊，从当前所选歌词行的时间开始播放（seek）
  - 5 秒无继续滚动时，自动回到当前播放行并恢复跟随
- 对纯文本歌词（无时间戳）支持：
  - 展示全文
  - 不做当前行高亮 / 自动跟随 / seek 胶囊
- 对无歌词支持：
  - 明确空态提示，不影响播放
- 退出支持：
  - 左上角返回
  - `Esc`
  - 再次点击底栏当前播放歌曲区 toggle 关闭

### 2.2 非目标

- karaoke 逐字/逐词动效
- 在线歌词抓取 / 歌词编辑器
- 移动端适配优化
- 高级视觉特效（粒子、频谱背景等）

> 注意：原 issue #20 文本里曾把“点击歌词跳转 seek”列为非目标；但基于本轮你提供的主流产品截图与明确确认，本设计 **将“点击右侧 ▶︎ + 时间胶囊触发 seek”纳入本期范围**。不是“点歌词行直接 seek”，而是“滚动选中歌词行后，点胶囊 seek”。

---

## 3. 核心产品决策（已确认）

### 3.1 壳层模式

- **Now Playing 采用覆盖层（overlay）**，不是 hash route 新页面。
- 覆盖层打开后：
  - 隐藏侧栏与顶部栏
  - 底栏继续可见并继续承担播放控制
- 这样更贴合“点击底栏歌曲区再次 toggle 关闭”的交互，也避免额外路由状态管理。

### 3.2 底栏保留

- Now Playing **不再复制一套播放控制条**。
- 播放 / 暂停 / 上一首 / 下一首 / 音量 / 进度等继续使用底栏。
- 覆盖层主要承载：当前歌曲信息、歌词/队列内容。

### 3.3 默认内容

- 打开覆盖层后默认是「歌词」Tab。
- 「队列」Tab 复用 #21 已交付的 `QueueList` / 队列能力。

---

## 4. 信息架构与界面结构

## 4.1 结构总览

Now Playing 覆盖层从视觉上分为三部分：

1. **Header 区**
   - 左上角返回按钮
   - 当前歌曲标题 / 艺术家 / 专辑信息
   - Tab：歌词 / 队列

2. **主体内容区**
   - 两栏桌面布局：
     - 左侧：较大的封面 / 歌曲元信息
     - 右侧：歌词滚动区或队列区

3. **底部保留区**
   - 底栏继续可见，不被覆盖层遮挡
   - 覆盖层内容区底部需留出与底栏等高的安全空间

## 4.2 打开入口

- 底栏左下角当前播放歌曲区（封面 / 标题 / 艺人）改造成可点击的交互入口。
- 语义上应是一个可聚焦、可键盘触发的 button-like 区域，而不是纯 `div`。

## 4.3 关闭入口

- Header 左上角返回按钮
- 键盘 `Esc`
- 再次点击底栏左下角当前播放歌曲区（toggle）

## 4.4 与现有 BottomPlayerBar 表面的关系

为了避免交互重复与嵌套控件冲突，本期约定如下：

- **当前歌曲区（封面 / 标题 / 艺人）**：升级为 Now Playing 入口 trigger。
- **favorite 按钮**：保留为独立按钮；点击 favorite 不打开 Now Playing。
- **底栏歌词按钮 / 旧歌词面板**：本期移除，Now Playing 成为唯一歌词主入口。
- **底栏队列 popover**：在 Now Playing 关闭时继续保留（#21 已交付的 quick access）；在 Now Playing 打开时，不再额外弹出底栏队列 popover，用户改用覆盖层里的 Queue Tab。

---

## 5. 状态与组件边界

## 5.1 共享 Playback Store

Now Playing 与 BottomPlayerBar 必须共享同一个播放状态源，避免：
- 两份 `createPlaybackStore()` 各自轮询
- 当前曲 / 进度 / 队列状态不一致

设计要求：
- 从现有 `createPlaybackStore()` 派生出一个 **共享实例**（singleton or shared module instance）。
- BottomPlayerBar 与 Now Playing 覆盖层都使用这同一实例。

推荐结构：
- 保留 `src/lib/stores/playback.ts` 中的工厂函数用于单测。
- 新增类似 `src/lib/player/sharedPlayback.ts` 的共享实例模块，仅负责导出共享 playback store。

## 5.2 覆盖层显示状态

覆盖层开关状态不应耦合到 router。

推荐新增轻量 UI store（例如 `src/lib/player/now-playing.ts`）：
- `openNowPlaying()`
- `closeNowPlaying()`
- `toggleNowPlaying()`
- `isNowPlayingOpen`（writable/readable）

BottomPlayerBar 与 App/Overlay 共同依赖该 UI store。

## 5.3 组件建议

- **Create:** `src/lib/player/NowPlayingOverlay.svelte`
  - 覆盖层外壳、Header、Tab 切换、Esc 监听
- **Create:** `src/lib/player/NowPlayingLyricsTab.svelte`
  - 歌词渲染、自动跟随、手动滚动浏览、辅助线、seek 胶囊
- **Reuse:** `src/lib/player/QueueList.svelte`
  - 用于 Queue Tab
- **Modify:** `src/lib/player/BottomPlayerBar.svelte`
  - 打开/关闭 Now Playing 的入口与 toggle
- **Modify:** `src/App.svelte`
  - 渲染 `NowPlayingOverlay`

---

## 6. 歌词交互合同（核心）

## 6.1 正常跟随模式（Follow Mode）

前提：当前歌曲存在带时间戳歌词。

行为：
- 当前播放行高亮。
- 歌词列表自动滚动，使当前播放行始终位于可读区域。
- 切歌后：
  - 清空手动浏览状态
  - 切换到新歌歌词
  - 跟随新歌当前行
- 暂停时：
  - 高亮停留在当前行
  - 不继续滚动
- 继续播放时：
  - 从当前行继续自动跟随

## 6.2 手动浏览模式（Browse Mode）

触发条件：
- 用户对歌词区进行手动滚轮/滚动操作。

进入 Browse Mode 后：
- 暂停自动跟随。
- 显示一条 **水平辅助线**（推荐位于歌词区垂直中线附近）。
- 根据辅助线当前位置，确定“当前所选歌词行”。
- 右侧显示“▶︎ + 时间”胶囊（仅对 timed lyrics 生效）。
- 每次新的滚动/选择动作都会重置 5 秒计时器。

## 6.3 所选歌词行的定义

- 选中行不是“鼠标点击某一行”得到的，而是：
  - 用户滚动歌词列表
  - 歌词行经过固定辅助线
  - 与辅助线相交 / 最近的 timed line 视为“当前所选行”
- 所选行与“当前播放行”可能不同：
  - 当前播放行：表示真实音频进度
  - 所选行：表示用户浏览时准备 seek 的目标行

视觉上两者应能区分：
- 当前播放行：主高亮
- 所选行：辅助线命中的选中态（可用 outline / stronger emphasis）

## 6.4 Seek 胶囊

在 Browse Mode 且当前所选行为 timed lyric 时：
- 在歌词区右侧显示一个“▶︎ + timestamp”胶囊
- timestamp 来自所选歌词行的时间戳
- **MVP 精度规则：seek 采用整秒精度**。对于带小数的 LRC timestamp，前端在触发 seek 前按 **向下取整到秒** 处理（例如 `01:23.87` → `83` 秒）。
- 用户点击该胶囊：
  - 调用 playback seek 到该时间
  - **无论当前是 paused 还是 playing，都按“明确播放意图”处理：从该时间开始播放（进入 playing）**
  - 退出 Browse Mode
  - 自动回到 Follow Mode

### 明确约束

- **不支持点击歌词文本直接 seek**。
- seek 只能通过右侧“▶︎ + 时间”胶囊触发。

这样既保留了你想要的主流交互感，又能降低误触风险。

## 6.5 5 秒自动恢复

在 Browse Mode 中：
- 若 5 秒内无新的滚动/选择操作，自动：
  1. 清除所选行状态
  2. 滚回当前播放行
  3. 恢复 Follow Mode

这个 5 秒计时器应在以下动作后重置：
- 再次滚动
- 选中行变化

## 6.6 无时间戳 / 无歌词处理

### 无时间戳歌词（plain text）
- 展示全文
- 不显示辅助线
- 不显示 seek 胶囊
- 不做自动跟随

### 无歌词
- 展示明确空态，例如：
  - “未找到同名 .lrc 文件”
- Queue Tab 仍可切换使用

---

## 7. 技术实现建议

## 7.1 歌词数据层

优先复用现有：
- `src/lib/player/lyrics.ts`
  - `parseLyrics`
  - `buildLyricsPanelState`
  - `getActiveLyricsIndex`

需要新增的不是“解析”，而是 UI 层状态：
- `isBrowseMode`
- `selectedLyricIndex`
- `resumeTimer`
- `showGuideLine`
- `showSeekPill`

## 7.2 Seek API

当前 PlaybackStore 已有 `commitSeek(position)`，但它语义偏向进度条拖拽。

推荐新增更直接的方法，例如：
- `playFromLyricsTimestamp(seconds: number)`

职责：
- 将传入的歌词 timestamp 先按 MVP 规则规范为整秒（向下取整）
- 调用底层 `deps.seekTo(seconds)`
- 若当前不是 `playing`，则显式恢复/开始播放（因为点击胶囊代表“播放当前所选行”）
- 刷新 playback state
- 不依赖 `beginSeek/previewSeek` 那套 slider 状态

这样歌词 seek 与进度条拖拽解耦，更清晰。

## 7.3 Overlay 布局与层级

- Overlay 作为固定层覆盖 main 区域
- Sidebar / TopBar 在视觉上被遮挡
- BottomPlayerBar 通过更高 z-index 保持在 overlay 之上
- Overlay 内容区需设置底部安全间距（至少 >= 底栏高度）

## 7.4 覆盖层可访问性与交互约束

Now Playing 不是完整路由，而是覆盖层；其可访问性合同如下：

- 覆盖层打开时：
  - Sidebar / TopBar / Main content 进入 inert 状态，不可点击、不可滚动。
  - BottomPlayerBar **保留可见且可交互**（这是已确认的产品决策），因此覆盖层不应使用 `aria-modal="true"` 的严格模态语义。
- 覆盖层本身应具备明确可访问名称（例如通过标题 `aria-labelledby` 关联），并作为独立对话/面板容器实现。
- 打开时焦点进入覆盖层 Header（推荐落在返回按钮或当前激活的 Tab 按钮）。
- 按 `Esc` 时关闭覆盖层。
- 关闭后焦点返回到底栏“当前歌曲区” trigger。

## 7.5 Queue Tab

- Queue Tab 直接复用 #21 的 `QueueList`
- 不新增队列能力，只做集成
- 这保证 #20 不会重新实现 queue 管理逻辑

---

## 8. 测试策略

## 8.1 前端组件 / store 测试（Vitest）

至少覆盖：
1. **入口 / 退出**
   - 点击底栏当前歌曲区打开 overlay
   - Esc 关闭
   - 再点底栏歌曲区关闭
2. **默认 Tab**
   - 打开后默认显示歌词页
3. **自动跟随**
   - progress 变化时，高亮行更新
4. **手动滚动进入 Browse Mode**
   - 显示辅助线 + seek 胶囊
   - 5 秒后自动恢复
5. **seek 胶囊**
   - 点击后调用 `playFromLyricsTimestamp(floor(selected.timestamp))`
6. **切歌**
   - Browse Mode 退出
   - 新歌歌词加载并恢复 Follow Mode
7. **无 timed lyrics / 无歌词**
   - 正确展示 plain text / empty state

## 8.2 回归覆盖

- `BottomPlayerBar` 现有 utility controls 测试不回归
- #21 的 QueueList 接入后不回归

---

## 9. 验收标准（更新版）

- 满足入口 / 退出合同：
  - 底栏歌曲区打开
  - Esc / 返回 / 再点底栏 toggle 关闭
- Now Playing 采用：
  - 覆盖层模式
  - 保留底栏控制
  - 默认歌词 Tab
- LRC timed lyrics 支持：
  - 当前行高亮 + 自动跟随
  - 手动滚动后进入 Browse Mode
  - 辅助线 + 右侧 seek 胶囊
  - 点击胶囊从所选行 timestamp 开始播放
  - 5 秒无操作自动恢复跟随
- plain lyrics / no lyrics 有合理降级
- Queue Tab 可用并复用 #21 队列能力
- 对应前端测试补齐

---

## 10. 风险与降级策略

### 风险 1：共享播放 store 改造引入双实例/双轮询问题
- 策略：显式引入共享 playback store 模块，不在 BottomPlayerBar / Overlay 内各自 `createPlaybackStore()`。

### 风险 2：Browse Mode 的 DOM 计算复杂度较高
- 策略：MVP 只支持“固定辅助线 + 最近 timed line”，不做更复杂碰撞检测。

### 风险 3：seek 胶囊引入范围扩张
- 策略：限定为“点击胶囊 seek”，不支持点击歌词文本直接 seek，避免范围继续膨胀。
