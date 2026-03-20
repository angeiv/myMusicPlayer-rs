# 项目技术约定

## 技术栈
- 核心后端: Rust 1.94 + Tauri 2 + rusqlite + rodio
- 核心前端: Svelte 5 + TypeScript + Vite + Vitest
- 本地存储: SQLite（曲库）+ 本地文件系统（音频文件与伴生资源）

## 开发约定
- 代码规范: Rust 使用 `cargo fmt` / `clippy -D warnings`，前端使用 `svelte-check` 与 `vitest`
- 命名约定: Rust 以 snake_case 为主，TypeScript 以 camelCase 为主，组件使用 PascalCase
- 播放链路: 前端通过 `src/lib/api/*` 调用 Tauri command，避免在纯工具层直接调用 `invoke`

## 错误与日志
- 策略: 后端以 `Result<T, String>` 暴露 Tauri command 错误，内部使用 `anyhow` 与日志补充上下文
- 日志: 运行期日志通过 `tauri-plugin-log` 输出到 stdout、webview 与日志目录

## 测试与流程
- 后端测试: `cargo test --manifest-path ./src-tauri/Cargo.toml --all-features -- --nocapture`
- 前端测试: `npm --prefix ./src test`
- 前端语法检查: `npm --prefix ./src run check`
- 质量入口: 优先使用 `just check`、`just test`、`just qa`

