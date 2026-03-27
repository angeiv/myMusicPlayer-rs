# 任务清单: 本地歌词获取与展示

- [√] 实现同名 `.lrc` 文件发现、文本解码与时间标签兼容策略
- [√] 在后端播放链路中注入歌词文本，覆盖曲库播放与“打开文件”播放
- [√] 在底栏歌词面板中实现时间轴解析、高亮与“未找到本地歌词”空态
- [√] 补充后端与前端测试，覆盖歌词存在/缺失/同步展示场景
- [√] 运行后端测试、前端测试和前端语法检查，修复失败项
- [√] 同步更新知识库、CHANGELOG，并将方案包迁移至 history

## 执行总结
- 后端新增 `src-tauri/src/services/audio/lyrics.rs`，在切歌时加载同名 `.lrc`
- 前端新增 `src/lib/player/lyrics.ts`，负责 LRC 解析与当前行计算
- 已完成 `cargo test --manifest-path ./src-tauri/Cargo.toml --all-features -- --nocapture`
- 已完成 `npm --prefix ./src test -- --run`
- 已完成 `npm --prefix ./src run check`
