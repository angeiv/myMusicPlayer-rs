# 设计稿：Home 页面选中文本蓝线与同类摘要卡片的统一修复

- 日期: `2026-04-06`
- 状态: `Draft / 已完成设计确认，待实现计划`
- 触发问题: `Home 页面在摘要卡片内误触拖拽或双击时，会出现系统文本选中的蓝线；Songs 页面已具备更稳定的不可选中文本行为。`

## 1. 背景

当前前端里已经存在两类不同的列表/行语义：

1. `SongsTable.svelte` / `TrackActionRow.svelte`
   - 面向可点击、可聚焦、可选择的行
   - 已明确处理 `user-select` / `-webkit-user-select` / `::selection`
   - 目标是避免桌面式列表在点击、双击、拖拽过程中出现突兀的文本选中蓝线

2. `HomeView.svelte` 中的摘要卡片列表
   - `Recently Added Tracks`
   - `Top Artists`
   - 视觉上是卡片式摘要行，但当前仍是普通文本块
   - 在误触拖拽、双击或快速扫读时，会触发系统文本选中并出现蓝线

从产品体验看，这不是单点样式问题，而是**同类摘要表面缺少统一的“不可选中文本行为约束”**。

如果只修 Home 当前这两处，不建立统一边界，后续在其他卡片页或摘要行里仍然可能重复出现同类问题。

---

## 2. 本期目标

### 2.1 In scope

- 修复 `HomeView.svelte` 中摘要卡片文本被选中后出现蓝线的问题
- 以 Songs 页已验证过的处理方式为参考，统一**以下已冻结表面**的文本选中行为：
  - `src/lib/views/HomeView.svelte`
    - `Recently Added Tracks` 的 `.summary-list li`
    - `Top Artists` 的 `.summary-list li`
  - `src/lib/views/AlbumsView.svelte`
    - 专辑网格卡片 `.card`
  - `src/lib/views/ArtistsView.svelte`
    - 艺人网格卡片 `.card`
  - `src/lib/views/SearchResultsView.svelte`
    - 轨道结果行 `.result-list__row`
    - 轨道结果主文案块 `.track-copy`
    - 专辑/艺人结果按钮 `.list-button`
- 只在上述已冻结范围内收口，不再把“同类表面”继续向其他页面开放式扩张
- 为这批表面建立明确规则：默认不出现系统文本选中高亮
- 补充针对该问题的回归测试，避免后续页面再次出现同类退化

### 2.2 Out of scope

- 不改写 Home 页信息结构
- 不引入新的共享设计系统或大规模 UI 重构
- 不修改真正需要支持文本复制的输入区、详情文本区、错误日志区
- 不改变 Songs 既有选择逻辑、双击逻辑、焦点逻辑
- 不把本次工作扩展成全应用交互语义重做

---

## 3. 已确认的方案决策

用户已在方案比较后确认采用：

### 方案 B（推荐方案）—— 全面收口同类摘要卡片语义

不是只修 `HomeView.svelte` 的一个局部样式，而是：

- 先修 Home 当前可复现问题
- 再横向扫描同类摘要卡片 / 摘要行
- 将这些表面统一到与 Songs 页一致的“不可选中文本”交互基线
- 对明确需要保留文本选择能力的区域保持不动

### 放弃的备选方案

#### 方案 A：仅修 Home
- 优点：改动最小
- 缺点：同类问题容易在其他摘要卡片中继续出现

本次不采用。

---

## 4. 设计总览

### 4.1 问题本质

这次问题的本质不是“蓝色不好看”，而是：

- 用户看到的是摘要卡片或桌面列表式表面
- 浏览动作却触发了浏览器/系统层的文本选择反馈
- 该反馈与当前产品交互语义不一致，显得像误触或样式漏网

因此，本次修复的目标不是隐藏某一条蓝线，而是统一一个更清晰的规则：

> 对于播放器里承担“摘要浏览 / 列表行 / 卡片行”职责、且不以文本复制为主要用途的表面，默认不应出现文本选中蓝线。

### 4.2 修复后的体验标准

修复完成后，以下行为应成立：

- 在 Home 页面快速点击、双击、扫过、轻微拖拽摘要卡片时，不出现突兀蓝线
- 行/卡片仍保持既有 hover、focus、selected、active 等视觉反馈
- Songs 页与 Home 页在这类表面上的交互体验更一致
- 同类摘要卡片如果也存在该问题，应一起收口，而不是留下新的边缘点

---

## 5. 适用表面与边界

### 5.1 需要纳入统一规则的表面

本次范围在 spec 阶段直接冻结，不在 planning 或 implementation 阶段二次扩张。纳入统一规则的表面仅包括：

- `src/lib/views/HomeView.svelte`
  - `Recently Added Tracks` 列表项：`.summary-list li`
  - `Top Artists` 列表项：`.summary-list li`
- `src/lib/views/AlbumsView.svelte`
  - 专辑卡片：`.card`
- `src/lib/views/ArtistsView.svelte`
  - 艺人卡片：`.card`
- `src/lib/views/SearchResultsView.svelte`
  - 轨道结果行：`.result-list__row`
  - 轨道结果主文案块：`.track-copy`
  - 专辑/艺人结果按钮：`.list-button`

这些表面的共同点是：

- 视觉上属于摘要卡片、摘要行或卡片式结果项
- 用户主要行为是浏览、点击、扫读，而不是复制文本
- 与 Songs 页列表行属于同一体验家族

已存在共享行为基线、因此**不纳入本次修改范围**的表面包括：

- `src/lib/components/songs/SongsTable.svelte`
- `src/lib/components/library/TrackActionRow.svelte`
- 基于 `TrackActionRow` 的 Album / Playlist 详情行

### 5.2 不应纳入的表面

以下区域明确不在本次 spec 范围内：

- `HomeView.svelte` 的统计卡片 `.stat-card`
- `HomeView.svelte` 的页头摘要块 `.home-summary-chip`
- 输入框、搜索框、文本域
- 真正可能需要复制内容的说明文本或错误文本
- 代码/日志/路径展示区
- 任何以文本选择为合理行为的区域

本次原则是：

- **局部精准收口**
- 不做全局 `* { user-select: none; }` 之类的粗暴处理
- 不把未列入 5.1 的页面或组件在实施时顺手带入

---

## 6. 实现策略

### 6.1 参考基线

实现以现有已验证表面为参考：

- `src/lib/components/songs/SongsTable.svelte`
- `src/lib/components/library/TrackActionRow.svelte`

这两处已经证明：

- 行容器禁用文本选择
- 子元素同步禁用文本选择
- 在需要时控制 `::selection`

可以稳定避免误触拖拽带来的文本蓝线，同时不破坏列表行本身的交互感。

### 6.2 具体策略

对纳入范围的摘要卡片 / 摘要行，统一采用以下约束：

1. **行容器禁止文本选择**
   - `user-select: none`
   - `-webkit-user-select: none`

2. **子元素同步禁止文本选择**
   - 防止标题、次级文案、数字字段等局部仍被选中

3. **必要时定义局部 `::selection`**
   - 防止浏览器在边缘情况下仍渲染突兀选中底色
   - 该规则只挂在目标摘要表面上，不外溢到全局

4. **保留现有交互态**
   - hover
   - focus-visible
   - active / selected（如有）
   - 不因禁用文本选择而损失原本的交互反馈

### 6.3 抽象层级原则

本次是否提取共享类或共享组件，遵循以下原则：

- 如果只有已冻结范围中的某一处缺口需要修补，优先做最小实现
- 如果已冻结范围中的多个表面存在相同缺口，则允许提取共享样式基线
- 不允许借这次修复把范围扩展到 5.1 之外的页面或组件
- 不为这次修复发明过度抽象的新组件体系

换句话说：

- **优先统一规则**
- **按真实重复度决定是否抽象**

而不是为了“全面”强行重构页面结构。

---

## 7. 代码落点

预计优先涉及：

- `src/lib/views/HomeView.svelte`
- `src/lib/views/AlbumsView.svelte`
- `src/lib/views/ArtistsView.svelte`
- `src/lib/views/SearchResultsView.svelte`

回归测试预计涉及：

- Home / theme / 相关 view 测试文件

明确作为参考、不应被大改的文件：

- `src/lib/components/songs/SongsTable.svelte`
- `src/lib/components/library/TrackActionRow.svelte`

这两者是行为基线，不是这次重构目标。

---

## 8. 测试与验证设计

### 8.1 回归测试目标

需要增加一条与本次问题直接对应的前端回归测试，证明：

- Home 摘要卡片不再保留可选中文本的样式缺口
- 同类表面如果纳入修复，也具备相同契约

### 8.2 建议验证方式

至少包括：

1. **针对 Home 的必选回归测试**
   - 读取渲染结果或样式契约
   - 验证 Home 摘要卡片表面具备不可选中文本约束

2. **针对其余已冻结表面的验证**
   - 可通过新增测试、现有 view/theme 测试补强，或源文件样式契约验证完成
   - 目标是证明 5.1 中列出的表面都已被覆盖，而不是只修 Home

3. **前端静态检查**
   - `npm --prefix ./src run check`

4. **相关测试回归**
   - Home / theme / 相关 view 测试

5. **构建验证**
   - `npm --prefix ./src run build`

6. **必要时人工浏览确认**
   - 在 Home 页面实际拖拽、双击、扫读摘要卡片
   - 确认蓝线不再出现
   - Songs 页既有表现不受影响

---

## 9. 风险与防护

### 风险 1：误伤可复制文本区域

如果收口边界过大，可能把本来合理的文本选择也禁掉。

**防护：**
- 仅作用于摘要卡片/摘要行类表面
- 不做全局规则

### 风险 2：只修 Home，别处复发

如果完全当作 Home 单点问题处理，后续同类卡片还会继续漏。

**防护：**
- 实现时横向扫描同类表面
- 在低风险范围内一并收口

### 风险 3：为小问题引入过度抽象

如果为了统一而强行抽象出新的组件体系，改动面会失控。

**防护：**
- 先最小实现
- 只有确认真实重复时才提取共享样式

### 风险 4：焦点态或 hover 态被一并削弱

如果简单粗暴覆盖选择态样式，可能破坏原有交互层次。

**防护：**
- 明确将 focus / hover / selected / active 作为保留项
- 通过现有测试和人工验证确认没有回归

---

## 10. 完成标准

本次工作完成后，应满足：

- Home 页面摘要卡片不再出现文本选中蓝线
- 同类摘要卡片缺口得到统一收口，至少不存在当前已知复现点
- Songs 页作为参考基线不被破坏
- 不影响真正需要文本选择的区域
- `npm --prefix ./src run check` 通过
- `npm --prefix ./src run build` 通过
- 相关前端测试通过

---

## 11. 下一步

如果这份 spec 通过 review 并得到用户最终确认，下一步进入：

1. `writing-plans`：把本次修复写成正式实施计划
2. 明确本次计划涉及的文件、测试和验证命令
3. 再进入实现阶段
