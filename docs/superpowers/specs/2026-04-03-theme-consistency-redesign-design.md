# M002 设计稿：全应用主题一致性与视觉重做（R009）

- Milestone: `M002 自动同步与维护体验`
- Requirement: `R009 暗色 / 亮色模式下的整体视觉语义应保持一致`
- 日期: `2026-04-03`
- 状态: `Draft / 已完成设计确认，待实现计划`

## 1. 背景

当前项目已经具备主题切换基础：`src/app.css` 中存在全局 dark / light token，`SettingsView.svelte` 中也已有主题切换入口，`App.svelte` 已经形成 `Sidebar + TopBar + Main + BottomPlayerBar` 的应用壳体。

但现状仍然明显割裂：

- 全局 token 在一层
- 主壳体结构在一层
- 各页面和组件里仍然大量保留局部硬编码的偏 dark 风格

这使得项目当前更像“有主题支持”，而不是“主题统一”。切换到亮色模式后，很多页面和组件不会自然地映射成同一套产品，只是勉强换了一组背景色。

这份 spec **只负责 M002 中的 R009：全应用主题一致性与视觉重做**。

它不负责定义 watcher 的事件模型、auto-sync 的产品语义或自动同步的错误恢复路径。那些仍属于 M002 的 sibling workstream，但需要在视觉系统和主壳体稳定之后，作为**独立 spec / 独立 planning**进入实现。

本期目标不是补几个颜色变量，而是把播放器收口为：

- dark / light 下都成立的同一套视觉系统
- 允许小到中等主结构调整的统一应用壳体
- 面向长期桌面使用的克制工具气质
- 仅在播放器、当前态和主操作上保留少量精致高光

---

## 2. 本期目标

### 2.1 In scope

- 建立覆盖 dark / light 的统一视觉系统
- 重构全局语义 token，而不是继续依赖页面级硬编码颜色
- 统一应用壳体：
  - `App.svelte`
  - `Sidebar.svelte`
  - `TopBar.svelte`
  - `BottomPlayerBar.svelte`
- 统一播放相关表面：
  - `NowPlayingOverlay.svelte`
  - `QueueList.svelte`
  - `NowPlayingLyricsTab.svelte`
  - 播放器内的 queue / device / volume popover 语义
- 统一主要页面的视觉语言：
  - `Home`
  - `Songs`
  - `Albums`
  - `AlbumDetail`
  - `Artists`
  - `ArtistDetail`
  - `SearchResults`
  - `PlaylistDetail`
  - `Settings`
- 统一主要状态语义：
  - hover
  - active
  - selected
  - playing
  - disabled
  - missing
  - danger / warning / success
- 在不改变主能力边界的前提下，允许对主结构和页面骨架做重排
- 将视觉重做拆成 M2 内的分阶段切片，而不是一次性全量翻面

### 2.2 Out of scope

- watcher 实现本身
- auto-sync 的事件模型、去抖策略、错误恢复策略
- 扫描状态 contract 和后台同步行为语义
- 把项目改造成流媒体产品式视觉路线
- 用媒体首页、hero 区、封面主导色覆盖全应用
- 重做 Library / Playlist / Search 的信息模型和核心能力定义
- 云端、跨设备、品牌化推广路线相关视觉包装

---

## 3. 用户已确认的设计决策

### 3.1 重做范围

本次工作是：

- **整应用纳入**
- 不是只修 Settings 或只修几处主题差异

### 3.2 重做性质

本次工作是：

- **视觉重做**
- 不只是 token 清理或颜色修补

### 3.3 总体审美方向

用户已选择：

- **B：克制桌面工具感**
- 并进一步细化为：
  - **B3：克制里保留一点精致高光**

也就是说，这次重做的目标不是做成更强烈的“媒体产品感”，而是在稳定、专业、可长期驻留的桌面工具气质里，保留适量高光和完成度。

### 3.4 高光允许的位置

高光主要放在：

- 底部播放器
- 当前播放相关区域（含 overlay / queue / lyrics tab 的当前态表达）
- 当前选中态 / active 态
- 主按钮

高光**不应该**扩散到整个导航骨架、整页卡片或封面驱动的大面积彩色块。

### 3.5 亮色主题方向

亮色主题已确定为：

- **冷静中性白**

不走：

- 略暖纸感白
- 高对比效率工具白

### 3.6 主结构调整权限

本次工作：

- **允许重排主结构**
- 但不把现有产品能力改造成另一类应用

### 3.7 落地方式

本次工作采用：

- **分阶段收口**

而不是：

- 一次性全量翻面
- 或只做几个样板页后把剩余页面长期留在旧语言里

---

## 4. 设计总览

### 4.1 本期要解决的真实问题

这次重做要解决的不是“某几个颜色不舒服”，而是三类系统性问题：

1. **层级语言不统一**
   - 哪些区域是底、骨架、内容容器、浮层、强调区，不同页面说法不一样
2. **状态语义不统一**
   - selected / active / playing / danger / missing 在不同表面看起来像来自不同系统
3. **结构气质不统一**
   - 有些页面像桌面工具，有些页面像夜间主题 demo，有些区域又有明显局部风格残留

### 4.2 本期完成后的产品观感

完成后，这个播放器应该给人的感觉是：

> 一个长期驻留桌面、稳定、克制、可读、专业的本地音乐工具；
> 播放器区域和当前态有适度精致感，但不会把整应用拉成“媒体产品化 UI”。

### 4.3 设计原则

- **统一优先于局部惊艳。**
- **同一语义在不同页面必须长得像一家人。**
- **dark / light 是同一套系统的不同光照条件，不是两套审美。**
- **高光只服务当前态和主操作，不服务大面积装饰。**
- **先统一壳体和基线，再迁移页面与播放表面。**
- **watcher 后续接入新壳体，但不由本 spec 负责定义。**

---

## 5. 视觉系统设计

### 5.1 五层视觉层级

全应用统一为 5 层视觉语义：

1. **Canvas**
   - 应用底色
   - 承接外围背景和页面留白
2. **Shell**
   - `Sidebar` / `TopBar` / `BottomPlayerBar` / 主内容外壳
3. **Panel**
   - 卡片、表格容器、设置分区、详情分区、歌词/队列面板
4. **Elevated**
   - popover / context menu / dropdown / picker / queue 浮层
5. **Highlight**
   - 当前播放、当前选中、主按钮、关键强调态

关键约束：

- 页面不能再自己发明“第六层”视觉语义
- Elevated 只用于真正浮起的交互
- Highlight 只给当前态和关键操作，不铺满页面

### 5.2 语义 token 结构

`src/app.css` 应从“几组颜色变量”演进为语义 token 入口，建议至少覆盖：

#### Surface
- `--surface-canvas`
- `--surface-shell`
- `--surface-panel`
- `--surface-panel-subtle`
- `--surface-elevated`

#### Text
- `--text-primary`
- `--text-secondary`
- `--text-tertiary`
- `--text-on-accent`

#### Border
- `--border-subtle`
- `--border-default`
- `--border-strong`

#### State
- `--accent`
- `--accent-soft`
- `--state-selected`
- `--state-playing`
- `--state-danger`
- `--state-warning`
- `--state-success`

#### Effect
- `--shadow-soft`
- `--shadow-elevated`
- `--glow-accent`
- `--focus-ring`

### 5.3 token 使用约束

- 页面组件不得再通过直接书写深色 `rgba(...)` 来决定主题气质
- 同一种状态必须依赖共享语义 token，而不是页面私有颜色
- dark / light 可以调整强度，但不能改变语义映射

例如：

- `selected` 在 dark 和 light 中可以亮度不同
- 但都必须一眼可读为“当前选中态”

---

## 6. 主壳体与播放表面设计

### 6.1 App shell

`App.svelte` 仍然维持“导航骨架 + 主内容 + 底部播放器”的播放器结构，但允许对区域比例、留白、滚动关系和标题区模板进行重排。

目标：

- 主结构更稳定
- 内容密度更统一
- 不让壳体和页面像两个不同项目拼接

### 6.2 Sidebar

Sidebar 应从“带 emoji 的功能按钮集合”收敛为稳定导航骨架：

- 弱化玩具感和装饰性
- 强化分组、当前态、计数信息秩序
- 将它定义为结构性区域，而不是视觉焦点

### 6.3 TopBar

TopBar 应作为轻量工具条而不是重复品牌展示区：

- 搜索是核心工具输入，不是网页式搜索框
- 顶栏语气要轻、稳、辅助性强
- 如果保留品牌信息，应显著降权

### 6.4 BottomPlayerBar

BottomPlayerBar 是 B3 方向中最允许承载精致感的区域：

- 可以保留适度高光
- 可以拥有更精细的层级和微光感
- 但不应依靠大面积彩色、夸张渐变或产品化 hero 感

播放器应成为整应用最“完成”的区域，而不是最“吵”的区域。

### 6.5 Now Playing / Queue / Lyrics surfaces

以下播放相关表面必须一起进入统一系统：

- `NowPlayingOverlay.svelte`
- `QueueList.svelte`
- `NowPlayingLyricsTab.svelte`
- 播放器中的 queue / volume / device popover

原因：

- 它们属于用户高频可见、强感知的播放核心表面
- 如果只重做 BottomPlayerBar 而不迁移 overlay 与 queue / lyrics，整应用仍会保留最显眼的“旧语言残留”

这些表面应共享：

- panel 层级
- 当前播放态表达
- tab / selected / hover 语义
- popover 与 overlay 的 elevated 语言

---

## 7. 页面与组件迁移规则

### 7.1 页面级统一基线

以下页面和播放表面必须全部迁移到统一系统：

- Home
- Songs
- Albums
- AlbumDetail
- Artists
- ArtistDetail
- SearchResults
- PlaylistDetail
- Settings
- BottomPlayerBar
- NowPlayingOverlay
- QueueList / Lyrics tab / playback popover

迁移要求：

- 页面标题区结构一致
- 主要内容容器使用一致的 panel 语言
- 空态、错误态、反馈区、分区 header 都共享同一语法
- 不再存在明显“旧页面 / 新页面”割裂
- 不再存在“播放器是新语言，overlay/queue 还是旧语言”的割裂

### 7.2 必须共享的组件语义

#### 容器类
- page header
- section header
- standard panel
- inset panel
- empty state
- feedback banner
- error summary
- overlay panel
- queue / lyrics content panel

#### 交互类
- primary button
- secondary button
- ghost button
- danger button
- pill / badge
- text input
- search input
- select
- radio / checkbox / slider
- menu item / popover item
- tab button
- transport / utility trigger

#### 内容类
- table row
- list row
- card
- selected row
- active row
- playing row
- disabled row
- missing row

关键约束：

- `Songs`、`Settings`、`Playlist`、`Search`、`Now Playing` 不得各自定义一套 button / panel / row 审美
- 状态语义必须跨页面统一

### 7.3 状态语义约束

至少统一以下状态：

- hover
- active
- selected
- playing
- disabled
- missing
- success
- warning
- danger

其中需要特别强调：

- `playing` 与 `selected` 不应混淆
- `missing` 要与 `disabled` 区分
- `danger` 只用于真正需要警示或 destructive 行为，不扩散为装饰色
- `当前播放` 与 `当前选中行` 必须在播放器、歌曲列表、队列里保持同一语义家族

---

## 8. dark / light 对应策略

### 8.1 dark

dark 不应是“更炫”的版本，而应是：

- 更沉稳
- 更安静
- 依靠层级差、边框和小剂量高光来建立秩序

避免：

- 纯黑 + 荧光蓝
- 大面积发光边框
- 整页饱和色强调

### 8.2 light

light 已确定为冷静中性白：

- 不偏暖
- 不做纸感肌理
- 不做高对比效率工具风
- 通过蓝灰层级、精准边框、温和阴影和少量 accent 建立秩序

### 8.3 双主题一致性标准

dark / light 的关系应是：

- 同一套布局
- 同一套状态映射
- 同一套层级逻辑
- 只是处在不同光照条件下

不能出现：

- dark 看起来像成熟播放器
- light 看起来像另一个半成品后台模板

---

## 9. 主题重做切片建议（本 spec 专用）

这份 spec 只给出 **R009 视觉重做 track** 的切片，不包含 watcher planning。

### S01 — 视觉系统与主壳体定型
收口内容：
- 语义 token
- App shell
- Sidebar
- TopBar
- BottomPlayerBar
- 全局容器和基础交互态

目标：
- 先把“这是什么样的播放器”定下来

### S02 — 高频主链路与播放表面迁移
收口内容：
- Songs
- Albums
- Artists
- AlbumDetail
- ArtistDetail
- NowPlayingOverlay
- QueueList
- Lyrics tab
- 相关列表、表格、selection / playing 语义

目标：
- 先让日常高频浏览与播放链路统一

### S03 — 次级页面与维护表面收口
收口内容：
- Home
- SearchResults
- PlaylistDetail
- Settings
- 表单、设置面板、反馈面板、空态、错误态

目标：
- 把全域主要表面完成统一
- 对应 requirement `R009`

### S04 — 双主题验收与收尾
收口内容：
- dark / light 逐页验收
- 播放表面与维护表面视觉回归
- 组件和状态语义的最后收口

目标：
- 证明这次重做不是截图统一，而是整应用日用体验统一

### 后续说明

在这条视觉重做 track 完成后，M2 中 watcher / auto-sync 的 spec 和 planning 才进入下一阶段。那部分会消费这里产出的视觉系统和主壳体，但不会反过来定义本 spec 的范围。

---

## 10. 验证标准

### 10.1 结构完成线

以下壳体必须统一：

- `App.svelte`
- `Sidebar.svelte`
- `TopBar.svelte`
- `BottomPlayerBar.svelte`
- `NowPlayingOverlay.svelte`

通过标准：

- dark / light 切换后仍像同一套产品
- 区域层级清晰
- 主结构可调整，但导航模型不混乱
- 播放器与 overlay 是同一视觉家族，而不是两套产品

### 10.2 页面完成线

以下页面和播放表面全部进入统一系统：

- Home
- Songs
- Albums
- AlbumDetail
- Artists
- ArtistDetail
- SearchResults
- PlaylistDetail
- Settings
- BottomPlayerBar
- NowPlayingOverlay
- QueueList / Lyrics tab / playback popover

通过标准：

- 页面标题区、内容容器、空态、错误态、按钮区说同一套语言
- Settings 不再像独立皮肤
- 不再存在明显旧新混搭

### 10.3 组件完成线

以下语义必须跨页面统一：

- button 族
- panel / card / popover / overlay
- input / select / slider / radio / checkbox
- row hover / selected / active / playing / disabled / missing
- feedback / warning / error / success state
- tab / transport / utility trigger

### 10.4 双主题完成线

- light / dark 的层级映射一致
- 亮色主题保持冷静中性白
- 重点状态在双主题下都清楚
- 不出现某些页面正常、某些页面像另一项目的情况

### 10.5 风格完成线

应成立：

- 整体是克制桌面工具感
- 播放器和当前态有适度精致高光
- 高光提升完成度而非抢内容
- 高频页面长时间停留依然舒适

不应出现：

- 变成媒体平台或流媒体首页
- 整页大面积渐变和彩色面板
- 亮色主题比暗色主题更散
- 页面之间像不同设计师各做各的

### 10.6 代码完成线

- `src/app.css` 成为核心语义 token 入口
- 页面不再直接写大量硬编码主题色
- 共享视觉基线沉到全局或复用层
- 后续新增功能可沿用这套系统，而不是重新发明视觉规则

### 10.7 最终验证方式

至少包括：

1. 逐页 dark / light 视觉验收
2. 运行中的截图证据或浏览器验证证据
3. `npm --prefix ./src run check`
4. 相关页面和组件测试更新通过
5. 一轮人工高频使用回路验证：
   - 切主题
   - 浏览 Songs / Album / Playlist / Settings
   - 搜索、选中、播放、打开当前播放、切换歌词 / 队列、调整设置

---

## 11. 风险与边界

### 风险 1：范围膨胀

因为本期允许主结构调整，如果不先锁定视觉系统和壳体语言，很容易一路滑向“顺手重做信息模型”或顺手把 watcher 也纳入同一计划。

应对：

- 主能力边界不变
- watcher 明确留在本 spec 之外
- 先做壳体和视觉系统，再做页面迁移

### 风险 2：全局 token 与页面实现断裂

如果只整理 token 而不收页面硬编码，重做会停留在表面。

应对：

- 明确把页面与播放表面迁移作为独立切片
- 把组件语义收成共享基线

### 风险 3：亮色主题沦为兼容模式

如果实现过程中先按 dark 做视觉，最后“顺手兼容” light，最终仍然会像两套产品。

应对：

- 每个切片都要求 dark / light 双向验收
- 亮色主题从一开始就按冷静中性白设计，而不是后补

### 风险 4：高光扩散导致跑偏

B3 方向最容易滑向“哪里都想加一点高光”。

应对：

- 高光严格限制在播放器、当前态、主按钮和关键强调态
- Sidebar、主体容器和普通内容面板保持克制

### 风险 5：播放表面遗漏导致最显眼处仍割裂

如果只重做主页面，不纳入 overlay / queue / lyrics，用户最强感知的播放链路仍然会保留旧语言。

应对：

- 在 spec 和 planning 中显式列出所有播放相关表面
- 把播放表面放进高频迁移切片，而不是后补

---

## 12. 本期结论

M2 中的“暗色 / 亮色模式整体不统一”不应被处理为零散修补，而应被定义为：

- 一次覆盖整应用的视觉重做
- 方向是克制桌面工具感
- 在播放器、当前态和主按钮上保留少量精致高光
- 亮色主题采用冷静中性白
- 允许重排主结构，但不改写产品能力边界
- 通过“视觉系统与壳体 -> 高频页面与播放表面 -> 次级页面 -> 双主题验收”的顺序分阶段完成

它解决的是 `R009`，并为 M002 后续的 watcher / auto-sync workstream 提供稳定的 UI 壳体，但不替后者做 planning 决策。

---

## 13. 下一步

如果这份 spec 通过 review 并得到用户最终确认，下一步进入：

1. `writing-plans`：只针对这条 **R009 视觉重做 track** 写正式实现计划
2. 在计划中明确各 slice 的 demo、验证命令、页面范围和回归要求
3. watcher / auto-sync 作为 M002 sibling track，在后续独立 spec 中再进入 planning
4. 再进入实现阶段
