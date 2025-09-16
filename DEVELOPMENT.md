# 音乐播放器开发指南

本文档详细介绍了基于 Tauri + Rust + Svelte 的跨平台音乐播放器项目的开发环境搭建、构建系统使用和开发工作流程。

## 目录

1. [开发环境要求](#开发环境要求)
2. [项目结构](#项目结构)
3. [构建系统](#构建系统)
4. [开发工作流](#开发工作流)
5. [测试](#测试)
6. [代码风格](#代码风格)
7. [提交规范](#提交规范)

## 开发环境要求

### 必需工具

- Rust 1.87+ (推荐使用 `rustup` 安装)
- Cargo (Rust 包管理器)
- Node.js 18+ 和 npm
- Git 2.25+
- Tauri CLI (`cargo install tauri-cli`)

### 平台特定依赖

#### Windows

- Visual Studio 2019+ with C++ build tools
- WebView2 Runtime (通常已预装在 Windows 10/11)

#### macOS

- Xcode 命令行工具
- macOS 10.15+ (Catalina)

```bash
xcode-select --install
```

#### Linux

- WebKitGTK 开发包
- 其他系统依赖

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Fedora
sudo dnf install webkit2gtk3-devel openssl-devel curl wget libappindicator-gtk3-devel librsvg2-devel
sudo dnf group install "C Development Tools and Libraries"

# Arch Linux
sudo pacman -S webkit2gtk base-devel curl wget openssl appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg libvips
```

## 项目结构

```
myMusicPlayer-rs/
├── src/                   # 前端源代码 (Svelte + TypeScript)
│   ├── lib/               # 前端组件库
│   │   ├── components/    # UI 组件
│   │   │   ├── Player.svelte      # 播放器控制组件
│   │   │   ├── Library.svelte     # 音乐库组件
│   │   │   ├── Playlist.svelte    # 播放列表组件
│   │   │   └── Settings.svelte    # 设置组件
│   │   ├── stores/        # Svelte 状态管理
│   │   │   ├── player.ts          # 播放器状态
│   │   │   ├── library.ts         # 音乐库状态
│   │   │   └── settings.ts        # 设置状态
│   │   └── utils/         # 前端工具函数
│   ├── App.svelte         # 主应用组件
│   ├── main.ts            # 前端入口点
│   ├── index.html         # HTML 模板
│   ├── vite.config.ts     # Vite 构建配置
│   ├── package.json       # 前端依赖
│   └── node_modules/      # 前端依赖包
├── src-tauri/             # 后端源代码 (Rust + Tauri)
│   ├── src/               # Rust 源代码
│   │   ├── main.rs        # 应用入口点
│   │   ├── lib.rs         # 库入口点
│   │   ├── api/           # Tauri 命令 API
│   │   │   ├── audio.rs           # 音频播放命令
│   │   │   ├── library.rs         # 音乐库命令
│   │   │   ├── playlist.rs        # 播放列表命令
│   │   │   └── config.rs          # 配置命令
│   │   ├── models/        # 数据模型
│   │   │   ├── track.rs           # 音轨模型
│   │   │   ├── album.rs           # 专辑模型
│   │   │   ├── artist.rs          # 艺术家模型
│   │   │   └── playlist.rs        # 播放列表模型
│   │   ├── services/      # 业务逻辑服务
│   │   │   ├── audio/             # 音频服务
│   │   │   ├── library/           # 音乐库服务
│   │   │   ├── playback/          # 播放控制服务
│   │   │   └── config/            # 配置服务
│   │   └── utils/         # 工具函数
│   ├── Cargo.toml         # Rust 项目配置
│   ├── Tauri.toml         # Tauri 应用配置
│   ├── build.rs           # 构建脚本
│   ├── icons/             # 应用图标
│   └── capabilities/      # Tauri 权限配置
├── dist/                  # 前端构建输出
├── resources/             # 资源文件
├── packaging/             # 打包配置
├── justfile               # 开发任务运行器
├── DEVELOPMENT.md         # 开发指南
├── TODO.md                # 待办事项
├── Rust跨平台桌面音乐播放器概要设计方案.md  # 概要设计文档
└── Rust跨平台桌面音乐播放器详细设计方案.md  # 详细设计文档
```

## 构建系统

### 快速开始

```bash
# 1. 克隆项目
git clone <repository-url>
cd myMusicPlayer-rs

# 2. 安装依赖
just install

# 3. 开发模式运行
just dev

# 4. 构建发布版本
just package
```

### 使用 just 任务运行器

项目使用 `just` 作为任务运行器，提供了一致的开发体验：

```bash
# 安装 just (如果尚未安装)
cargo install just

# 查看所有可用任务
just --list

# 安装开发依赖 (包括前端和后端)
just install

# 开发模式 (启动前端开发服务器和 Tauri)
just dev

# 构建项目 (debug模式)
just build

# 构建发布版本
just release

# 运行程序
just run

# 运行测试
just test

# 检查代码质量
just check

# 格式化代码
just fmt

# 清理构建产物
just clean
```

### 构建和打包

#### 开发构建

```bash
# 前端构建 (开发模式)
cd src && npm run dev

# 后端构建 (调试模式)
cd src-tauri && cargo build

# 完整构建 (调试模式)
just build
```

#### 发布构建

```bash
# 发布构建
just release

# 或者分步骤
cd src && npm run build
cd ../src-tauri && cargo build --release
```

#### 打包应用

```bash
# 为当前平台打包
just package

# 为特定平台打包
just package-windows
just package-macos
just package-linux
```

### 前端开发

前端使用 Svelte + TypeScript + Vite：

```bash
# 进入前端目录
cd src

# 安装依赖
npm install

# 开发模式 (热重载)
npm run dev

# 构建生产版本
npm run build

# 类型检查
npm run check
```

### 后端开发

后端使用 Rust + Tauri：

```bash
# 进入后端目录
cd src-tauri

# 构建
cargo build

# 运行测试
cargo test

# 检查代码
cargo clippy

# 格式化代码
cargo fmt
```

## 开发工作流

### 日常开发

1. **获取最新代码**
   ```bash
   git pull
   just install
   ```

2. **创建特性分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **开发模式**
   ```bash
   # 启动开发环境 (前端热重载 + Tauri)
   just dev
   ```

4. **实现功能**
   - 前端代码：修改 `src/` 目录下的 Svelte 组件
   - 后端代码：修改 `src-tauri/src/` 目录下的 Rust 代码
   - 添加测试
   - 更新文档

5. **测试和检查**
   ```bash
   # 运行测试
   just test

   # 代码质量检查
   just check

   # 格式化代码
   just fmt
   ```

6. **构建验证**
   ```bash
   # 构建发布版本
   just release
   ```

7. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加新功能"
   git push origin feature/your-feature-name
   ```

8. **创建合并请求**
   - 在代码托管平台上创建合并请求
   - 等待代码审查
   - 通过CI/CD流水线

### 调试技巧

#### 前端调试
- 使用浏览器开发者工具
- Svelte DevTools 扩展
- Vite 热重载

#### 后端调试
- 使用 `log` 宏输出调试信息
- Rust 调试器 (lldb/gdb)
- Tauri 开发者工具

#### 前后端通信调试
- 检查 Tauri 命令注册
- 验证 API 调用参数
- 查看控制台错误信息

## 测试

### 后端测试 (Rust)

```bash
# 运行所有后端测试
cd src-tauri && cargo test

# 运行特定测试
cd src-tauri && cargo test test_name

# 运行测试并显示输出
cd src-tauri && cargo test -- --nocapture

# 使用 just 运行测试
just test
```

### 前端测试 (JavaScript/TypeScript)

```bash
# 进入前端目录
cd src

# 类型检查
npm run check

# 如果有测试框架，运行测试
# npm test
```

### 集成测试

```bash
# 构建并测试完整应用
just build
just test
```

### 覆盖率报告

```bash
# 生成测试覆盖率报告 (需要安装 cargo-tarpaulin)
just coverage
```

### 测试最佳实践

- 为每个服务编写单元测试
- 测试 Tauri 命令的输入输出
- 模拟外部依赖
- 测试错误处理路径

## 代码风格

项目使用 `rustfmt` 和 `clippy` 来保持代码风格一致。

### 代码格式化

```bash
just fmt
```

### 代码检查

```bash
just check
```

## 提交规范

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

示例：
```
feat: 添加播放列表功能
fix: 修复音频播放卡顿问题
docs: 更新开发文档
```

## 贡献指南

1. Fork 项目仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

本项目采用 GNU GENERAL PUBLIC LICENSE Version 3 - 详情请参阅 [LICENSE](LICENSE) 文件。
