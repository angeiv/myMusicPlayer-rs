# TODO（需求地图）— myMusicPlayer-rs

更新时间：2026-03-29

本文件用于从**产品需求/交付目标**角度说明“接下来要做什么”，并将需求映射到 GitHub 的 milestone / issue。

- **执行门禁（source of truth）**：GitHub milestone / issue
- **设计与计划证据**：`docs/superpowers/specs/`（设计稿）与 `docs/superpowers/plans/`（实现计划）
- **验证命令**（约定）：`just qa`（= check + test）

> 历史版本：原先的“大而全任务清单”（最后更新 2025-09-17）已归档为：
> `docs/backlog/TODO-legacy-2025-09-17.md`

---

## 里程碑规划（按需求优先级）

### MVP 1 — 可用闭环（Milestone 1）
Milestone: https://github.com/angeiv/myMusicPlayer-rs/milestone/1

**交付目标（用户可完成最小闭环）**
- 扫描/导入 → 浏览与批量操作 → 歌单持久化 → 重启后基础偏好可稳定恢复
- last session：不自动播放；仅在用户点击播放且当前 stopped 时尝试恢复；失败会自动清理并回退

**当前阻塞项**
- [ ] **#17 [P0] 配置与启动恢复加固**
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/17
  - Spec: `docs/superpowers/specs/2026-03-29-config-startup-restore-hardening-design.md`

**已完成（闭环基础能力已具备）**
- [x] #14 持久化歌单服务并修复 playlist 状态一致性
- [x] #15 扫描流程产品化：忽略隐藏项、进度、取消与错误摘要
- [x] #16 Songs 列表增强验收与缺陷收口

---

### MVP 2 — 日常可用（Milestone 2）
Milestone: https://github.com/angeiv/myMusicPlayer-rs/milestone/2

**交付目标（把“能用”提升到“日常愿意用”）**
- 队列/Now Playing 的一致性与可操作性完善
- 封面与歌词补齐，提升信息密度与沉浸感
- （可选）把全量重扫降频：提供增量同步能力（无 watcher）

**需求映射（按优先级）**
- [ ] **#21 [P0] 队列与 Now Playing 体验完善**
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/21
- [ ] #20 [P1] 本地歌词关联与展示链路
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/20
- [ ] #19 [P1] 专辑封面提取与缓存
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/19
- [ ] #18 [P2] 增量扫描（无 watcher）
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/18

---

### MVP 3 — 发布准备（Milestone 3）
Milestone: https://github.com/angeiv/myMusicPlayer-rs/milestone/3

**交付目标（可分发 + 工程质量门禁）**
- CI/质量门禁让改动可持续
- 打包与系统集成收口，形成发布 checklist

**需求映射（按优先级）**
- [ ] **#22 [P0] 建立前后端测试与 CI 质量门禁**
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/22
- [ ] #23 [P1] 系统集成与打包发布 MVP
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/23
- [ ] #28 [P2] 文件系统监听自动同步（watcher）
  - Issue: https://github.com/angeiv/myMusicPlayer-rs/issues/28

**安全（建议在进入打包前处理）**
- [ ] PR #7 glib 漏洞缓解（Linux 依赖栈）
  - PR: https://github.com/angeiv/myMusicPlayer-rs/pull/7

---

## Backlog（需求存在，但暂不排期）

以下条目来自 legacy TODO 的“需求层”，但不作为 MVP1~3 的硬门禁；需要时再拆分 issue 并进入里程碑：

### UI / 交互
- 窗口大小记忆、侧边栏可调整大小
- 更完整的快捷键配置 UI / 交互去抖与可访问性优化

### 播放体验
- 迷你播放器模式
- AB 循环、播放速度控制

### 音乐库工程化
- 数据库迁移系统、备份/恢复
- 更高级的元数据规范化与批量编辑

### 生态与在线能力
- 插件系统
- 在线歌词/在线封面下载

---

## 维护规则（避免 TODO 与 GitHub 冲突）

- 任何要进入执行的需求：必须有 GitHub issue（含验收标准），并归档到对应 milestone。
- TODO.md 只做“需求地图/入口索引”，不再追踪实现细项的完成状态。
