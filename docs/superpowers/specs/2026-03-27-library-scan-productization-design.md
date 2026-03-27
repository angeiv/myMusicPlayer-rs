# 扫描流程产品化（MVP1 / Issue #15）设计稿

> 目标：把“库扫描”从同步黑盒调用提升为**可观察、可取消、可恢复**的用户流程，并默认规避隐藏项/系统目录噪音。

- 关联 Issue：#15 https://github.com/angeiv/myMusicPlayer-rs/issues/15
- 方案选择：**方案 A（后台扫描任务 + 轮询 ScanStatus）**

---

## 1. 背景与现状

当前扫描入口：
- 后端：`src-tauri/src/api/library/mod.rs` → `scan_directory(path)`
- 后端实现：`src-tauri/src/services/library/mod.rs` → `LibraryService::scan_directory()`
- 前端：`src/lib/api/tauri/library.ts` → `scanDirectory()`
- UI：`src/lib/views/SettingsView.svelte` 的 “Rescan Now” 会对 `libraryPaths` 逐个 `await scanDirectory(path)`。

现存问题（与 #15 验收标准对齐）：
1. **不可观察**：无进度、无当前处理路径、无扫描状态（running/finished）。
2. **不可取消**：扫描一旦开始只能等待返回。
3. **错误不可用**：仅日志输出（warn/error），前端无法拿到“错误摘要”。
4. **噪音高**：默认不会忽略隐藏文件/目录；存在误扫系统目录与临时目录的风险。
5. **阻塞体验不清晰**：扫描时会占用 `library` 锁，其他读命令可能被阻塞，但前端没有“扫描中锁定/提示”。

---

## 2. 目标与非目标

### 2.1 目标（MVP）
- 扫描流程：
  - 扫描过程中，前端能展示 **扫描中提示 + 进度（无总量）+ 取消按钮**。
  - 扫描结束后（完成/取消/失败），前端能拿到 **结果摘要** 并触发库 refresh。
- 规则与安全：
  - 默认忽略隐藏项（文件/目录名以 `.` 开头）与常见噪音目录。
  - 避免误扫明显危险/无意义路径（如根目录、系统目录）。
  - 默认不跟随符号链接（避免循环与越界扫描）。
- 取消语义：
  - 用户点击取消后：**停止后续扫描**；本次已成功入库的内容**保留**；最终给出 `Cancelled` 摘要。
- 错误摘要：
  - 扫描结束时返回：`errorCount` + `sampleErrors(前 N 条)`（含路径与原因）。

### 2.2 非目标（明确不做）
- 文件系统实时监听、增量同步算法。
- 为了“精确 total”进行两遍遍历（先统计再扫描）。
- 扫描任务跨进程/跨重启续扫（本期只保证 playlist 已闭环；扫描闭环以“可取消 + 可提示 + 有摘要”为主）。

---

## 3. 方案 A 总览：后台扫描任务 + 轮询 ScanStatus

核心思路：
- 扫描由后端启动一个后台任务执行。
- 前端通过 `get_library_scan_status` 轮询获取状态并更新 UI。
- 后端提供 `cancel_library_scan` 设置取消标志。

为什么选 A：
- 与现有工程实践一致（前端已有轮询 playback 状态的模式）。
- 不引入 Tauri event 订阅体系，改动面更小、可测试性更高。

---

## 4. API 设计（Tauri commands）

新增 3 个命令（snake_case，与现有一致）：

### 4.1 `start_library_scan`
- 名称：`start_library_scan`
- 入参：`{ paths: string[] }`
- 返回：`Result<(), String>`
- 行为：
  - 若已在扫描中：返回错误（前端应提示“扫描正在进行”）。
  - 对路径做基础校验（不存在/不是目录/危险路径）后，启动后台任务。

### 4.2 `get_library_scan_status`
- 名称：`get_library_scan_status`
- 入参：无
- 返回：`Result<ScanStatus, String>`
- 说明：该命令**不得依赖 library 锁**，确保扫描时仍能及时返回。

### 4.3 `cancel_library_scan`
- 名称：`cancel_library_scan`
- 入参：无
- 返回：`Result<(), String>`
- 行为：设置取消标志，状态进入 `Cancelling`；后台任务尽快停止遍历并提交已入库内容。

---

## 5. ScanStatus 数据模型（后端与前端共享语义）

### 5.1 枚举：`ScanPhase`
- `Idle`
- `Running`
- `Cancelling`
- `Completed`
- `Cancelled`
- `Failed`

### 5.2 结构：`ScanErrorSample`
- `path: String`
- `message: String`
- `kind: ScanErrorKind`

`ScanErrorKind`（MVP）：
- `Walk`
- `ReadMetadata`
- `Persist`

### 5.3 结构：`ScanStatus`
- `phase: ScanPhase`
- `startedAtMs?: number`（可选）
- `endedAtMs?: number`（可选）
- `currentPath?: string`（可选，建议截断到合理长度）
- `processedFiles: number`（无 total，仅累计“已处理候选音频文件数”）
- `insertedTracks: number`（本次扫描新增入库数量）
- `errorCount: number`
- `sampleErrors: ScanErrorSample[]`（最多 N 条）

约束：
- `sampleErrors` 只保留前 N 条（默认 N=20），避免 payload 过大。

---

## 6. 后端实现设计

### 6.1 状态存放：独立 ScanState（不和 LibraryService 共锁）
在 `AppState` 增加一个新的共享状态（建议 `Mutex<ScanState>`）：
- `status: ScanStatus`
- `cancel_flag: Arc<AtomicBool>`（或等价实现）
- `scan_thread_handle`（可选，仅用于防止重复启动；MVP 可不保存 handle）

关键点：
- `get_library_scan_status` 只读该 `ScanState`，不触碰 `state.library`。
- 扫描线程内部会锁住 `state.library` 进行实际扫描（与“扫描时锁定并提示”一致）。

### 6.2 扫描执行：将 LibraryService::scan_directory 改造成“可取消 + 可汇总”
对 `LibraryService::scan_directory` 做结构调整（保持对外语义：返回 inserted 数量），但内部改为：
1. **流式遍历**：不再 `collect()` 全量文件列表，而是边遍历边处理。
2. **忽略规则**：
   - 默认忽略隐藏项：任何 path segment 的文件名以 `.` 开头则跳过（目录直接 prune）。
   - 默认忽略常见噪音目录：`.git/`, `node_modules/`, `target/`（可扩展，但 MVP 先固定一小组）。
   - 默认不跟随 symlink：`WalkDir::new(path).follow_links(false)`。
3. **可取消**：每处理一定步数（至少每个候选音频文件之前）检查 `cancel_flag`。
4. **错误汇总**：
   - 读取元数据失败：计数 + 采样。
   - 入库失败：计数 + 采样。
   - WalkDir entry error：计数 + 采样。
5. **事务语义**：
   - 扫描依旧使用一个 transaction（当前实现也是 tx + commit）。
   - 取消时：停止遍历，`tx.commit()` 提交已完成部分（符合“保留已入库”）。

建议新增一个内部函数（示意）：
- `scan_directory_with_control(path, cancel_flag, status_sink) -> ScanSummary`

其中 `status_sink` 用于把 `currentPath/processedFiles/insertedTracks/errorCount/sampleErrors` 写回 `ScanState`。

### 6.3 危险路径与输入校验
在 `start_library_scan` 入口对每个 path 做：
- `exists && is_dir` 校验。
- 明显危险路径拒绝（MVP 最小集合）：
  - Unix：`/`、`/System`、`/Library`、`/Applications`、`/Volumes`（macOS）
  - Linux：`/proc`、`/sys`、`/dev`
  - Windows：系统目录（可用 `dirs`/`known folders` 能力不足时先做“盘符根目录拒绝” + `Windows` 目录字符串匹配）

> 目标不是完美覆盖所有系统路径，而是显著降低误扫风险；规则后续可迭代。

### 6.4 后端并发与幂等
- 同一时刻只允许 1 个扫描任务。
- 若再次调用 start：返回错误（前端可提示）。
- cancel 在 `Idle/Completed/Cancelled/Failed` 状态下应为 no-op（返回 Ok）。

---

## 7. 前端实现设计（锁定并提示）

### 7.1 新增前端 API
在 `src/lib/api/tauri/library.ts` 新增：
- `startLibraryScan(paths: string[]): Promise<void>`（invoke `start_library_scan`）
- `getLibraryScanStatus(): Promise<ScanStatus>`（invoke `get_library_scan_status`）
- `cancelLibraryScan(): Promise<void>`（invoke `cancel_library_scan`）

并在 `src/lib/api/library.ts` / mock 侧补齐对应抽象（保证测试可注入）。

### 7.2 新增 scan store（轮询）
新增：`src/lib/features/library-scan/store.ts`
- state：`status: Writable<ScanStatus>`
- actions：`start(paths) / cancel() / stopPolling()`
- polling：`setInterval` 每 250-500ms（MVP），当 phase 进入终态（Completed/Cancelled/Failed）后自动停止。

### 7.3 UI 行为
用户选择：**锁定并提示**。

最小实现：
- `SettingsView.svelte`
  - “Rescan Now” 改为调用 `start(paths)`，并展示状态面板：
    - `phase`（Running/Cancelling/...）
    - `processedFiles / insertedTracks / errorCount`
    - `currentPath`（截断）
    - Cancel 按钮
  - 终态后：触发 `refreshLibrary`（复用既有事件），由 `AppShell` 统一 `loadLibrary()`。
- App shell / 其他视图：
  - 扫描 Running/Cancelling 时，将 `isLibraryLoading` 置为 true（或新增专用字段），用于禁用库相关交互（搜索/切换库视图等）并显示“扫描中”。

---

## 8. 测试策略（验收对齐）

### 8.1 Rust
- 忽略隐藏项：目录含 `.hidden/` 或 `.DS_Store` 等，确保不会被处理。
- 取消语义：扫描中调用 cancel，确保 phase 最终为 `Cancelled`，且 `insertedTracks` 为已提交的部分（不回滚）。
- 错误摘要 cap：构造多错误路径，验证 `errorCount` 累计正确且 `sampleErrors.len() <= N`。

### 8.2 Frontend
- Settings：点击 Rescan 会调用 `startLibraryScan`，并在 status 更新后渲染进度与 Cancel。
- Cancel：点击后会调用 `cancelLibraryScan`。
- 终态：进入 `Completed/Cancelled/Failed` 后会触发 `refreshLibrary`（或直接断言 `appShell.loadLibrary` 被调用，按既有 wiring 风格）。

---

## 9. 验收清单（Definition of Done for #15）

- [ ] 默认忽略隐藏文件、系统目录和明显无效路径
- [ ] 前后端能暴露扫描进度（Running + processedFiles + currentPath）
- [ ] 用户可以取消扫描，且取消后状态能正确回收（Cancelled 摘要）
- [ ] 扫描结束能返回错误摘要（errorCount + sampleErrors 前 N 条）
- [ ] Settings / Library 入口能展示扫描中的状态与结果（至少 Settings）
- [ ] 补齐测试（Rust + 前端）

---

## 10. 风险与后续

- 危险路径过滤为 MVP 规则集，跨平台覆盖不可能一次到位；后续可以把规则变为可配置或更精细的 allowlist。
- 单 transaction + 大扫描可能导致 commit 较慢；MVP 接受，后续可改为分批提交。
