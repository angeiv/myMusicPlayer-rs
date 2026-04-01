# #19 设计稿：专辑封面提取与缓存

- Issue: `#19 [MVP2][P1] 专辑封面提取与缓存`
- 日期: `2026-04-01`
- 状态: `Draft / 待确认`

## 1. 背景

当前数据模型已经为 `Album` / `Track` 预留了封面字段，但后端没有真正提取封面、没有形成稳定缓存，也没有把可展示的封面表面接到前端。

这会直接影响两个 MVP2 的主使用面：

1. `AlbumsView`：专辑卡片只能显示首字母占位。
2. 当前播放区（`BottomPlayerBar` / `Now Playing`）：无法展示正在播放歌曲所属专辑封面。

用户已经确认：MVP2 本期只收敛这两个 surface，不扩散到 Playlist 等更多界面。

---

## 2. 本期目标

### 2.1 In scope

- 扫描资料库时，为专辑提取可复用的封面资源。
- 将封面缓存到应用缓存目录，避免前端每次展示都重新解析音频元数据。
- 在以下界面展示真实封面，缺失时回退到统一 fallback：
  - `src/lib/views/AlbumsView.svelte`
  - `src/lib/player/BottomPlayerBar.svelte`
  - `src/lib/player/NowPlayingOverlay.svelte`
- 对封面缺失、图片损坏、超大图片、非库内临时播放等情况提供稳定降级。

### 2.2 Out of scope

- 在线下载封面
- 用户手动替换/编辑封面
- Playlist / Artist 等额外 surface 的封面接线
- watcher 驱动的实时封面刷新（交给后续 #28 / watcher 体系）

---

## 3. 用户已确认的产品决策

### 3.1 展示范围

本期只覆盖：

- `AlbumsView` 专辑卡片
- 当前播放区（底栏 + Now Playing）

### 3.2 缓存形态

采用 **落盘封面缓存**，不走“每次运行时都重新解析原文件”的按需方案。

原因：

- 列表滚动和当前播放区都需要稳定、低成本读取
- 避免反复解析大音频文件或大图片
- 更符合桌面音乐库的长期缓存模型

### 3.3 封面来源优先级

当“目录外部封面”和“音频嵌入封面”同时存在时，优先级为：

1. **专辑目录外部封面优先**
2. 没有外部封面时，再退回 **音频嵌入封面**

### 3.4 缓存刷新时机

当封面源文件发生变化时，采用：

- **只在下次扫描 / 增量扫描时刷新缓存**

不在每次应用启动时主动全量检查，也不要求单独的“刷新封面”入口。

### 3.5 无封面时的 fallback 风格

采用 **默认唱片（disc-like placeholder）**，而不是字母 monogram。

原因：

- 在当前播放区更符合播放器心智
- 与音乐软件整体气质一致
- 作为 AlbumsView 与当前播放区的统一 fallback 也足够自然

---

## 4. 设计总览

## 4.1 数据流

```text
资料库扫描
  -> 识别 album 归属
  -> 为 album 解析封面来源（外部图 / 内嵌图）
  -> 标准化并写入缓存目录
  -> 将缓存文件路径写入 albums.cover_art_path
  -> Track / Album 查询结果带出 artwork path
  -> 前端把 artwork path 转换为可渲染的图片 URL
  -> AlbumsView / BottomPlayerBar / NowPlaying 使用真实封面或 fallback
```

## 4.2 核心原则

- **封面是 album 级资产，不是 track 级独立缓存。**
  - 当前播放区展示的是“当前曲目所属专辑封面”。
- **缓存路径稳定可复用，但变化时要能自然失效。**
- **封面解析失败绝不阻塞主扫描主流程。**
- **UI 永远可渲染：有图显示图，无图显示默认唱片 fallback。**

---

## 5. 后端设计

## 5.1 DB 与领域模型

当前 SQLite schema 已经存在：

- `albums.cover_art_path TEXT`

但目前查询虽然 `SELECT al.cover_art_path`，`row_to_album` / `row_to_track` 还没有真正把它映射给前端可消费的字段。

### 本期收敛

- 延续 `albums.cover_art_path` 作为 album 封面缓存文件的真实来源。
- `Album` / `Track` DTO 不再承载 `Vec<u8>` 原始图片字节作为 UI 主通道。
- 改为暴露 **可序列化的封面路径字段**（例如 `artwork_path` / `cover_art_path` 一类的 string 字段）。

> 命名细节在实现阶段可统一，但原则是：前后端都应以“路径/URL 型字段”为主，而非 `number[]` 大字节数组。

## 5.2 封面来源识别

### 5.2.1 外部封面优先

扫描 album 时，先在专辑目录中查找常见封面文件名，建议按以下优先顺序尝试：

- `cover.jpg` / `cover.jpeg` / `cover.png` / `cover.webp`
- `folder.jpg` / `folder.jpeg` / `folder.png` / `folder.webp`
- `front.jpg` / `front.jpeg` / `front.png` / `front.webp`
- `album.jpg` / `album.png`
- `artwork.jpg` / `artwork.png`

匹配规则：

- 文件名大小写不敏感
- 仅处理常见图片格式（jpg/jpeg/png/webp）
- 命中后直接作为封面源进入缓存管线

### 5.2.2 内嵌封面兜底

如果专辑目录没有外部封面，再从该专辑下的轨道文件中按顺序寻找第一张可用 embedded artwork：

- 读取 tag attached picture
- 找到第一张可解析图片即可停止
- 不要求比较多轨之间封面是否完全一致，MVP 采用 first-success 策略

### 5.2.3 无封面

若外部封面与内嵌封面都不可用：

- `albums.cover_art_path = NULL`
- 当前播放区 / AlbumsView 走默认唱片 fallback

## 5.3 缓存目录与文件命名

缓存写入应用缓存目录，例如：

```text
<AppCache>/artwork/
```

文件命名原则：

- 以 **album id + 源指纹** 形成文件名
- 例如：`<album-id>-<fingerprint>.jpg`

其中 `fingerprint` 可由以下信息组成：

- 外部封面：源文件路径 + 文件大小 + mtime
- 内嵌封面：轨道文件路径 + 文件大小 + mtime

这样可以满足两点：

1. 同一专辑在内容未变时稳定复用缓存
2. 当源文件变化并触发下一次扫描时，缓存文件名自然变化，避免 UI 命中旧图缓存

## 5.4 图片标准化策略

写缓存前统一进行轻量标准化：

- 限制最大边长（例如 512 或 640）
- 转为统一输出格式（优先 jpeg，透明图可视情况保留 png）
- 过大图片先缩放再写盘

本期目标不是高保真图片管理，而是：

- 足够清晰
- 足够稳定
- 不拖慢扫描与 UI

## 5.5 刷新策略

- **只在扫描 / 增量扫描时刷新**
- 应用普通启动不主动重建封面缓存
- 后续如果 #18 增量扫描更新到某 album，会同时刷新其封面缓存

扫描时的逻辑：

- 如果检测到 album 当前封面源未变，则复用已有 `cover_art_path`
- 如果源变化或缓存丢失，则重新生成缓存并更新 `cover_art_path`
- 如果这次扫描后 album 已无可用封面，则清空 `cover_art_path`

## 5.6 容错

以下情况都不能影响主扫描流程，只记日志/错误并继续：

- 图片文件损坏
- embedded artwork 解析失败
- 图片过大导致缩放失败
- 缓存目录写入失败

降级策略：

- 该专辑 `cover_art_path = NULL`
- UI 走默认唱片 fallback
- 扫描结果仍然成功提交其他音乐元数据

---

## 6. 前端设计

## 6.1 DTO 与 transport

前端 `Album` / `Track` 类型需要从“原始字节 artwork”切换到“路径型 artwork 字段”。

前端渲染层只关心：

- 有没有封面路径
- 如何把路径变成 `<img src>` 可消费的 URL
- 没有时展示 fallback

## 6.2 AlbumsView

当前 `AlbumsView.svelte` 中 artwork 只是首字母占位。

本期改为：

- 有封面：显示专辑封面 `<img>`
- 无封面：显示默认唱片 fallback
- hover / 卡片布局保持现有风格，不因图片失败产生跳动

UI 约束：

- 图片容器比例固定为正方形
- `object-fit: cover`
- 图片加载失败时自动切回 fallback

## 6.3 当前播放区

### BottomPlayerBar

当前底栏左侧 artwork 区现在是字母/音符占位。

本期改为：

- 若当前曲目所属专辑有封面，显示真实封面
- 若没有封面，显示默认唱片 fallback
- 非库内临时播放（例如直接打开文件）默认走 fallback，除非未来单独支持临时 embedded artwork

### Now Playing

Now Playing 头部/主视觉区与底栏保持同一封面来源：

- 同一首曲目不出现“底栏有图、Now Playing 无图”或反之
- 没图时统一为默认唱片 fallback

## 6.4 fallback 视觉

用户已确认采用 **默认唱片风格**：

- 音乐化、播放器导向
- 可作为 album card 与当前播放区的统一无图表面

实现上建议把 fallback 组件抽成可复用的小组件或样式片段，避免 AlbumsView / BottomPlayerBar / NowPlaying 各写一套。

---

## 7. 测试策略

## 7.1 Rust / 后端

至少覆盖：

1. 外部封面优先于 embedded artwork
2. 无外部封面时能回退到 embedded artwork
3. 无可用封面时 `cover_art_path = NULL`
4. 图片损坏 / 缓存写失败不会导致扫描失败
5. 封面源变化后，下一次扫描会更新缓存路径
6. 源未变化时复用已有缓存

## 7.2 前端

至少覆盖：

1. `AlbumsView`：有图展示 `<img>`，无图展示默认唱片 fallback
2. `BottomPlayerBar`：当前曲目有图 / 无图两种状态
3. `NowPlayingOverlay`：与底栏使用同一封面来源
4. 图片加载失败时自动降级到 fallback

## 7.3 回归验证

实现完成后，最少需要：

- `just qa`
- 覆盖 #19 的前端测试子集
- 一次手工烟测：
  - Albums 页出现真实封面
  - 当前播放区出现真实封面
  - 无图专辑显示默认唱片 fallback
  - 替换 `cover.jpg` 后，下次扫描可看到更新后的封面

---

## 8. 风险与边界

### 风险 1：图片解码/缩放依赖带来的实现复杂度

应对：

- 选一个稳定、轻量、跨平台的 Rust 图片处理方案
- MVP 只做最小标准化，不做复杂编辑逻辑

### 风险 2：同名专辑 / 合辑的封面归属

应对：

- 继续沿用当前 album 聚合键（title + artist）
- 封面缓存绑定 album id，而不是散落到 track 级别

### 风险 3：旧缓存堆积

应对：

- MVP 先允许历史缓存文件残留，不在本期做复杂 GC
- 只要 DB 指向最新 `cover_art_path` 即可
- 如后续需要，再加缓存清理任务

---

## 9. 本期结论

#19 的 MVP2 设计收敛为：

- 只覆盖 `AlbumsView` + 当前播放区（底栏 / Now Playing）
- 采用 **落盘封面缓存**
- **目录外部封面优先**，embedded artwork 兜底
- 封面变更时，**下一次扫描 / 增量扫描再刷新**
- 无图统一使用 **默认唱片 fallback**
- 封面失败绝不阻塞资料库主流程

---

## 10. 待你确认

如果你认可这个设计，我下一步会进入：

1. 写 #19 的实现计划（plan）
2. 更新 GitHub issue #19 body
3. 再进入实现阶段
