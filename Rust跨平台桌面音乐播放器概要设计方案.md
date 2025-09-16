# Rust跨平台桌面音乐播放器概要设计方案

**作者：** Manus AI  
**日期：** 2025年6月7日  
**版本：** 1.0

## 目录

1. [引言](#1-引言)
   1. [设计目的](#11-设计目的)
   2. [项目背景](#12-项目背景)
   3. [参考资料](#13-参考资料)
2. [总体设计](#2-总体设计)
   1. [系统架构](#21-系统架构)
   2. [技术选型](#22-技术选型)
   3. [系统功能](#23-系统功能)
3. [详细设计](#3-详细设计)
   1. [GUI模块](#31-gui模块)
   2. [音频处理模块](#32-音频处理模块)
   3. [播放控制模块](#33-播放控制模块)
   4. [音乐库管理模块](#34-音乐库管理模块)
   5. [配置管理模块](#35-配置管理模块)
4. [接口设计](#4-接口设计)
   1. [模块间接口](#41-模块间接口)
   2. [外部接口](#42-外部接口)
5. [数据设计](#5-数据设计)
   1. [数据结构](#51-数据结构)
   2. [数据存储](#52-数据存储)
6. [实现计划](#6-实现计划)
   1. [开发环境](#61-开发环境)
   2. [实现步骤](#62-实现步骤)
   3. [测试计划](#63-测试计划)
7. [附录](#7-附录)
   1. [术语表](#71-术语表)
   2. [参考文献](#72-参考文献)




## 1. 引言

### 1.1 设计目的

本文档旨在提供一个使用Rust语言开发的跨平台桌面音乐播放器的概要设计方案。该设计方案将详细描述音乐播放器的系统架构、核心模块、技术选型以及实现细节，为后续的开发工作提供指导。

本设计方案的主要目标包括：

1. 确定适合跨平台桌面应用开发的Rust GUI框架
2. 选择合适的音频处理库，支持mp3、flac、ape等主流与无损音乐格式
3. 设计模块化、可扩展的系统架构
4. 提供清晰的模块划分和接口定义
5. 参考开源项目的最佳实践，设计高性能、用户友好的音乐播放器

### 1.2 项目背景

随着Rust语言的日益成熟和普及，越来越多的开发者开始使用Rust开发各种应用程序。Rust语言以其内存安全、并发安全和高性能等特点，非常适合开发如音乐播放器这类需要高效处理音频数据的应用程序。

目前，市场上已有多种音乐播放器应用，但使用Rust开发的跨平台音乐播放器相对较少。本项目旨在探索Rust在桌面应用开发领域的潜力，特别是在音频处理和用户界面方面的应用。

通过调研主流的Rust跨平台GUI框架和音频处理库，并分析现有的开源音乐播放器项目，我们可以设计一个功能完善、性能优秀的音乐播放器，为Rust社区提供一个有价值的参考实现。

### 1.3 参考资料

在设计本音乐播放器时，我们参考了以下资料：

1. Rust官方文档：https://www.rust-lang.org/learn
2. 2025年Rust GUI库调研报告：https://www.boringcactus.com/2025/04/13/2025-survey-of-rust-gui-libraries.html
3. Symphonia音频库文档：https://github.com/pdeljanov/Symphonia
4. Rodio音频库文档：https://github.com/RustAudio/rodio
5. flac_music项目：https://github.com/wandercn/flac_music
6. music-player项目：https://github.com/tsirysndr/music-player

这些资料提供了关于Rust语言、GUI框架、音频处理库以及音乐播放器实现的宝贵信息，为本设计方案的制定提供了重要参考。


## 2. 总体设计

### 2.1 系统架构

本音乐播放器采用模块化的分层架构设计，将系统分为表示层、业务逻辑层和数据层三个主要层次。这种架构设计有助于实现关注点分离，使各个模块可以独立开发和测试，同时提高系统的可维护性和可扩展性。

#### 2.1.1 架构图

```
+----------------------------------+
|             表示层               |
|  +----------------------------+  |
|  |         GUI模块           |  |
|  +----------------------------+  |
+----------------------------------+
                 |
                 v
+----------------------------------+
|           业务逻辑层             |
|  +------------+  +------------+  |
|  | 播放控制模块|  |音乐库管理模块|  |
|  +------------+  +------------+  |
|  +------------+  +------------+  |
|  |音频处理模块 |  |配置管理模块 |  |
|  +------------+  +------------+  |
+----------------------------------+
                 |
                 v
+----------------------------------+
|              数据层              |
|  +------------+  +------------+  |
|  |  音频文件  |  |  配置文件  |  |
|  +------------+  +------------+  |
|  +----------------------------+  |
|  |         音乐库数据         |  |
|  +----------------------------+  |
+----------------------------------+
```

#### 2.1.2 层次说明

1. **表示层**：负责用户界面的显示和用户交互，包括GUI模块。
2. **业务逻辑层**：负责核心业务逻辑的处理，包括播放控制模块、音频处理模块、音乐库管理模块和配置管理模块。
3. **数据层**：负责数据的存储和访问，包括音频文件、配置文件和音乐库数据。

#### 2.1.3 模块交互

各模块之间通过定义良好的接口进行交互，主要交互流程如下：

1. GUI模块接收用户操作，调用相应的业务逻辑模块处理用户请求。
2. 播放控制模块负责控制音频的播放、暂停、停止等操作，调用音频处理模块进行具体的音频处理。
3. 音频处理模块负责音频文件的解码和播放，从数据层读取音频文件数据。
4. 音乐库管理模块负责管理音乐库，包括扫描、导入、删除等操作，与数据层的音乐库数据交互。
5. 配置管理模块负责管理用户配置，从数据层读取和写入配置文件。

### 2.2 技术选型

基于前期调研结果，我们为音乐播放器选择了以下技术栈：

#### 2.2.1 GUI框架

经过对多种Rust GUI框架的比较和评估，我们选择了**Tauri**作为本项目的GUI框架。选择理由如下：

1. **跨平台支持**：Tauri支持Windows、macOS和Linux等主要桌面平台，满足跨平台需求。
2. **Web技术集成**：Tauri允许使用HTML、CSS和JavaScript等Web技术构建用户界面，这些技术成熟且生态丰富。
3. **性能优势**：Tauri应用比Electron应用更轻量级，内存占用更少，启动速度更快。
4. **安全性**：Tauri提供了细粒度的安全控制，可以限制应用对系统资源的访问。
5. **活跃社区**：Tauri拥有活跃的社区和良好的文档支持。

作为备选方案，我们也考虑了以下框架：

- **Dioxus**：纯Rust实现的跨平台GUI框架，支持桌面和Web，但生态相对较新。
- **egui**：即时模式GUI库，简单易用，但不适合复杂界面。
- **Slint**：声明式UI框架，性能优秀，但生态相对较小。

#### 2.2.2 音频处理库

对于音频处理，我们选择了**Symphonia**作为主要的音频解码库，并使用**Rodio**作为音频播放库。选择理由如下：

1. **Symphonia**：
   - 纯Rust实现，无需外部依赖
   - 支持多种音频格式，包括MP3、FLAC、WAV、AAC等
   - 性能优秀，内存安全
   - 模块化设计，可扩展性好

2. **Rodio**：
   - 基于cpal（跨平台音频库）
   - 提供简单易用的音频播放API
   - 可以与Symphonia集成，用于播放Symphonia解码的音频

对于APE格式的支持，我们计划使用**FFmpeg绑定**（如ffmpeg-next）作为补充，因为Symphonia目前不直接支持APE格式。

#### 2.2.3 数据存储

对于数据存储，我们选择了以下技术：

1. **SQLite**：用于存储音乐库元数据，如歌曲信息、播放列表等。
   - 轻量级，无需单独的数据库服务
   - 跨平台支持
   - Rust有成熟的SQLite绑定库（如rusqlite）

2. **Serde**：用于配置文件的序列化和反序列化。
   - 支持多种格式，如JSON、TOML等
   - 与Rust类型系统无缝集成

### 2.3 系统功能

本音乐播放器将提供以下核心功能：

#### 2.3.1 音频播放功能

1. **基本播放控制**：播放、暂停、停止、上一首、下一首
2. **播放模式**：顺序播放、随机播放、单曲循环、列表循环
3. **音量控制**：调节音量、静音
4. **进度控制**：显示播放进度，支持拖动进度条跳转
5. **音频格式支持**：支持MP3、FLAC、APE、WAV、AAC等主流音频格式

#### 2.3.2 音乐库管理功能

1. **音乐扫描**：扫描本地文件系统，导入音乐文件
2. **元数据管理**：读取和显示音频文件的元数据（如标题、艺术家、专辑等）
3. **音乐分类**：按艺术家、专辑、流派等分类显示音乐
4. **搜索功能**：支持按标题、艺术家、专辑等搜索音乐

#### 2.3.3 播放列表功能

1. **创建和管理播放列表**：创建、编辑、删除播放列表
2. **添加和移除歌曲**：向播放列表添加或移除歌曲
3. **导入和导出**：支持导入和导出播放列表文件（如M3U格式）

#### 2.3.4 用户界面功能

1. **主界面**：显示当前播放歌曲、播放控制、播放列表等
2. **音乐库界面**：显示音乐库中的歌曲，支持多种视图（如列表视图、网格视图）
3. **播放列表界面**：显示和管理播放列表
4. **设置界面**：配置应用程序设置

#### 2.3.5 其他功能

1. **音频可视化**：显示音频波形或频谱
2. **歌词显示**：支持显示和同步歌词
3. **主题切换**：支持明暗主题切换
4. **快捷键支持**：支持键盘快捷键控制
5. **系统集成**：支持系统通知、媒体键控制等


## 3. 详细设计

### 3.1 GUI模块

GUI模块负责用户界面的显示和用户交互，是用户与应用程序交互的入口。本项目采用Tauri框架，结合Web前端技术构建用户界面。

#### 3.1.1 技术实现

1. **前端技术栈**
   - **框架**：React.js
   - **样式**：TailwindCSS
   - **状态管理**：Redux或Context API
   - **构建工具**：Vite

2. **Tauri集成**
   - 使用Tauri API与Rust后端通信
   - 利用Tauri的窗口管理功能
   - 使用Tauri的系统集成功能（如通知、托盘图标等）

#### 3.1.2 界面设计

音乐播放器的界面将包含以下主要部分：

1. **主界面**
   - 顶部：应用标题栏、搜索框、设置按钮
   - 左侧：导航栏（音乐库、播放列表、设置等）
   - 中间：内容区域（根据导航显示不同内容）
   - 底部：播放控制栏（播放/暂停按钮、进度条、音量控制等）

2. **音乐库界面**
   - 支持列表视图和网格视图
   - 提供按艺术家、专辑、流派等分类的视图
   - 显示歌曲元数据（标题、艺术家、专辑、时长等）
   - 支持排序和筛选

3. **播放列表界面**
   - 显示播放列表中的歌曲
   - 支持拖放排序
   - 提供播放列表管理功能（创建、编辑、删除等）

4. **设置界面**
   - 音频设置（输出设备、音质等）
   - 界面设置（主题、语言等）
   - 音乐库设置（扫描目录、元数据管理等）
   - 快捷键设置

#### 3.1.3 交互设计

1. **播放控制**
   - 点击播放/暂停按钮控制播放状态
   - 拖动进度条调整播放位置
   - 点击上一首/下一首按钮切换歌曲
   - 拖动音量滑块调整音量

2. **音乐库操作**
   - 双击歌曲开始播放
   - 右键菜单提供更多操作（添加到播放列表、查看详情等）
   - 拖放歌曲到播放列表

3. **播放列表操作**
   - 拖放排序播放列表中的歌曲
   - 右键菜单提供更多操作（移除、查看详情等）

#### 3.1.4 响应式设计

界面将采用响应式设计，适应不同屏幕尺寸：

1. **大屏幕**：显示完整的三栏布局（导航栏、内容区域、详情面板）
2. **中等屏幕**：隐藏详情面板，保留导航栏和内容区域
3. **小屏幕**：使用抽屉式导航，最大化内容区域

### 3.2 音频处理模块

音频处理模块负责音频文件的解码和播放，是音乐播放器的核心模块之一。

#### 3.2.1 模块结构

音频处理模块将分为以下几个子模块：

1. **解码器管理**：负责管理不同格式的音频解码器
2. **音频源**：负责从不同来源（文件、网络等）读取音频数据
3. **音频输出**：负责将解码后的音频数据输出到音频设备
4. **音频处理**：负责对音频数据进行处理（如音量调整、均衡器等）

#### 3.2.2 解码器实现

我们将使用Symphonia作为主要的音频解码库，并使用FFmpeg绑定作为补充，以支持更多音频格式。

1. **Symphonia解码器**
   - 支持的格式：MP3、FLAC、WAV、AAC等
   - 实现方式：使用Symphonia的解码API，创建解码器trait的具体实现

   ```rust
   pub struct SymphoniaDecoder {
       format: Box<dyn FormatReader>,
       decoder: Box<dyn Decoder>,
       sample_buffer: Option<SampleBuffer<f64>>,
   }

   impl AudioDecoder for SymphoniaDecoder {
       fn seek(&mut self, position_ms: u32) -> Result<u32, DecoderError> {
           // 实现seek功能
       }

       fn next_packet(&mut self) -> DecoderResult<Option<(AudioPacketPosition, AudioPacket, u16, u32)>> {
           // 实现获取下一个音频包的功能
       }
   }
   ```

2. **FFmpeg解码器**
   - 支持的格式：APE等Symphonia不支持的格式
   - 实现方式：使用ffmpeg-next库，创建解码器trait的具体实现

   ```rust
   pub struct FFmpegDecoder {
       context: AVCodecContext,
       frame: AVFrame,
       // 其他必要字段
   }

   impl AudioDecoder for FFmpegDecoder {
       fn seek(&mut self, position_ms: u32) -> Result<u32, DecoderError> {
           // 实现seek功能
       }

       fn next_packet(&mut self) -> DecoderResult<Option<(AudioPacketPosition, AudioPacket, u16, u32)>> {
           // 实现获取下一个音频包的功能
       }
   }
   ```

3. **解码器工厂**
   - 根据音频文件格式创建合适的解码器
   - 提供统一的解码器接口

   ```rust
   pub struct DecoderFactory;

   impl DecoderFactory {
       pub fn create_decoder<R>(input: R, hint: Hint) -> DecoderResult<Box<dyn AudioDecoder>>
       where
           R: MediaSource + 'static,
       {
           // 根据hint选择合适的解码器
           if let Some(mime_type) = hint.mime_type {
               match mime_type {
                   "audio/mpeg" | "audio/flac" | "audio/wav" | "audio/aac" => {
                       let decoder = SymphoniaDecoder::new(input, hint)?;
                       Ok(Box::new(decoder))
                   }
                   "audio/ape" => {
                       let decoder = FFmpegDecoder::new(input, hint)?;
                       Ok(Box::new(decoder))
                   }
                   _ => Err(DecoderError::UnsupportedFormat),
               }
           } else {
               // 尝试自动检测格式
               // ...
           }
       }
   }
   ```

#### 3.2.3 音频输出实现

我们将使用Rodio作为音频输出库，负责将解码后的音频数据输出到音频设备。

```rust
pub struct AudioOutput {
    stream: OutputStream,
    stream_handle: OutputStreamHandle,
    sink: Sink,
}

impl AudioOutput {
    pub fn new() -> Result<Self, AudioOutputError> {
        let (stream, stream_handle) = OutputStream::try_default()?;
        let sink = Sink::try_new(&stream_handle)?;
        
        Ok(Self {
            stream,
            stream_handle,
            sink,
        })
    }
    
    pub fn play(&self, source: Box<dyn Source + Send>) {
        self.sink.append(source);
    }
    
    pub fn pause(&self) {
        self.sink.pause();
    }
    
    pub fn resume(&self) {
        self.sink.play();
    }
    
    pub fn stop(&self) {
        self.sink.stop();
    }
    
    pub fn set_volume(&self, volume: f32) {
        self.sink.set_volume(volume);
    }
}
```

#### 3.2.4 音频处理功能

音频处理模块将提供以下音频处理功能：

1. **音量调整**：调整音频的音量
2. **均衡器**：调整不同频段的音量
3. **音频效果**：添加各种音频效果（如混响、立体声增强等）
4. **音频可视化**：生成音频波形或频谱数据，用于可视化显示

### 3.3 播放控制模块

播放控制模块负责控制音频的播放、暂停、停止等操作，是连接用户界面和音频处理模块的桥梁。

#### 3.3.1 模块结构

播放控制模块将包含以下主要组件：

1. **播放器核心**：负责播放控制的核心逻辑
2. **播放队列**：管理当前的播放队列
3. **播放状态**：管理播放状态（播放中、暂停、停止等）
4. **事件系统**：发送和处理播放相关事件

#### 3.3.2 播放器核心实现

播放器核心将实现以下功能：

1. **播放控制**：播放、暂停、停止、上一首、下一首
2. **播放模式**：顺序播放、随机播放、单曲循环、列表循环
3. **进度控制**：获取当前播放进度，跳转到指定位置
4. **音量控制**：调整音量、静音

```rust
pub struct Player {
    audio_output: AudioOutput,
    decoder_factory: DecoderFactory,
    queue: PlayQueue,
    state: PlayerState,
    mode: PlayMode,
    volume: f32,
    position_ms: u32,
    event_sender: mpsc::UnboundedSender<PlayerEvent>,
}

impl Player {
    pub fn new() -> Result<Self, PlayerError> {
        let audio_output = AudioOutput::new()?;
        let (event_sender, _) = mpsc::unbounded_channel();
        
        Ok(Self {
            audio_output,
            decoder_factory: DecoderFactory,
            queue: PlayQueue::new(),
            state: PlayerState::Stopped,
            mode: PlayMode::Order,
            volume: 1.0,
            position_ms: 0,
            event_sender,
        })
    }
    
    pub fn play(&mut self) -> Result<(), PlayerError> {
        if let Some(track) = self.queue.current_track() {
            let decoder = self.decoder_factory.create_decoder(track.path())?;
            self.audio_output.play(decoder);
            self.state = PlayerState::Playing;
            self.event_sender.send(PlayerEvent::Playing { track: track.clone() })?;
        }
        Ok(())
    }
    
    pub fn pause(&mut self) -> Result<(), PlayerError> {
        self.audio_output.pause();
        self.state = PlayerState::Paused;
        self.event_sender.send(PlayerEvent::Paused)?;
        Ok(())
    }
    
    pub fn stop(&mut self) -> Result<(), PlayerError> {
        self.audio_output.stop();
        self.state = PlayerState::Stopped;
        self.position_ms = 0;
        self.event_sender.send(PlayerEvent::Stopped)?;
        Ok(())
    }
    
    pub fn next(&mut self) -> Result<(), PlayerError> {
        self.queue.next(self.mode);
        self.play()
    }
    
    pub fn previous(&mut self) -> Result<(), PlayerError> {
        self.queue.previous(self.mode);
        self.play()
    }
    
    pub fn seek(&mut self, position_ms: u32) -> Result<(), PlayerError> {
        // 实现seek功能
    }
    
    pub fn set_volume(&mut self, volume: f32) -> Result<(), PlayerError> {
        self.volume = volume.clamp(0.0, 1.0);
        self.audio_output.set_volume(self.volume);
        self.event_sender.send(PlayerEvent::VolumeChanged { volume: self.volume })?;
        Ok(())
    }
    
    pub fn set_mode(&mut self, mode: PlayMode) -> Result<(), PlayerError> {
        self.mode = mode;
        self.event_sender.send(PlayerEvent::ModeChanged { mode: self.mode })?;
        Ok(())
    }
}
```

#### 3.3.3 播放队列实现

播放队列将管理当前的播放队列，支持不同的播放模式。

```rust
pub struct PlayQueue {
    tracks: Vec<Track>,
    current_index: Option<usize>,
    history: Vec<usize>,
}

impl PlayQueue {
    pub fn new() -> Self {
        Self {
            tracks: Vec::new(),
            current_index: None,
            history: Vec::new(),
        }
    }
    
    pub fn add_track(&mut self, track: Track) {
        self.tracks.push(track);
        if self.current_index.is_none() && !self.tracks.is_empty() {
            self.current_index = Some(0);
        }
    }
    
    pub fn add_tracks(&mut self, tracks: Vec<Track>) {
        for track in tracks {
            self.add_track(track);
        }
    }
    
    pub fn remove_track(&mut self, index: usize) -> Option<Track> {
        if index < self.tracks.len() {
            let track = self.tracks.remove(index);
            
            // 更新current_index
            if let Some(current_index) = self.current_index {
                if index == current_index {
                    self.current_index = if self.tracks.is_empty() {
                        None
                    } else {
                        Some(current_index.min(self.tracks.len() - 1))
                    };
                } else if index < current_index {
                    self.current_index = Some(current_index - 1);
                }
            }
            
            Some(track)
        } else {
            None
        }
    }
    
    pub fn clear(&mut self) {
        self.tracks.clear();
        self.current_index = None;
        self.history.clear();
    }
    
    pub fn current_track(&self) -> Option<&Track> {
        self.current_index.and_then(|index| self.tracks.get(index))
    }
    
    pub fn next(&mut self, mode: PlayMode) -> Option<&Track> {
        if self.tracks.is_empty() {
            return None;
        }
        
        if let Some(current_index) = self.current_index {
            self.history.push(current_index);
        }
        
        self.current_index = match mode {
            PlayMode::Order => {
                if let Some(current_index) = self.current_index {
                    if current_index + 1 < self.tracks.len() {
                        Some(current_index + 1)
                    } else {
                        Some(0)
                    }
                } else {
                    Some(0)
                }
            }
            PlayMode::Random => {
                use rand::Rng;
                let mut rng = rand::thread_rng();
                Some(rng.gen_range(0..self.tracks.len()))
            }
            PlayMode::Repeat => self.current_index,
            PlayMode::RepeatAll => {
                if let Some(current_index) = self.current_index {
                    if current_index + 1 < self.tracks.len() {
                        Some(current_index + 1)
                    } else {
                        Some(0)
                    }
                } else {
                    Some(0)
                }
            }
        };
        
        self.current_track()
    }
    
    pub fn previous(&mut self, mode: PlayMode) -> Option<&Track> {
        if self.tracks.is_empty() {
            return None;
        }
        
        self.current_index = match mode {
            PlayMode::Order | PlayMode::RepeatAll => {
                if let Some(current_index) = self.current_index {
                    if current_index > 0 {
                        Some(current_index - 1)
                    } else {
                        Some(self.tracks.len() - 1)
                    }
                } else {
                    Some(0)
                }
            }
            PlayMode::Random => {
                if let Some(last_index) = self.history.pop() {
                    Some(last_index)
                } else {
                    self.current_index
                }
            }
            PlayMode::Repeat => self.current_index,
        };
        
        self.current_track()
    }
}
```

#### 3.3.4 事件系统实现

事件系统将使用Tokio的mpsc通道实现，用于发送和处理播放相关事件。

```rust
#[derive(Debug, Clone)]
pub enum PlayerEvent {
    Playing { track: Track },
    Paused,
    Stopped,
    TrackChanged { track: Track },
    ProgressChanged { position_ms: u32, duration_ms: u32 },
    VolumeChanged { volume: f32 },
    ModeChanged { mode: PlayMode },
    QueueChanged,
    Error { message: String },
}

pub type PlayerEventSender = mpsc::UnboundedSender<PlayerEvent>;
pub type PlayerEventReceiver = mpsc::UnboundedReceiver<PlayerEvent>;

pub fn create_event_channel() -> (PlayerEventSender, PlayerEventReceiver) {
    mpsc::unbounded_channel()
}
```

### 3.4 音乐库管理模块

音乐库管理模块负责管理音乐库，包括扫描、导入、删除等操作，以及管理音乐元数据。

#### 3.4.1 模块结构

音乐库管理模块将包含以下主要组件：

1. **扫描器**：负责扫描文件系统，发现音乐文件
2. **元数据解析器**：负责解析音乐文件的元数据
3. **音乐库存储**：负责存储音乐库数据
4. **音乐库查询**：负责查询音乐库数据

#### 3.4.2 扫描器实现

扫描器将负责扫描文件系统，发现音乐文件。

```rust
pub struct Scanner {
    supported_extensions: HashSet<String>,
}

impl Scanner {
    pub fn new() -> Self {
        let mut supported_extensions = HashSet::new();
        supported_extensions.insert("mp3".to_string());
        supported_extensions.insert("flac".to_string());
        supported_extensions.insert("ape".to_string());
        supported_extensions.insert("wav".to_string());
        supported_extensions.insert("m4a".to_string());
        supported_extensions.insert("ogg".to_string());
        
        Self {
            supported_extensions,
        }
    }
    
    pub fn scan_directory(&self, path: &Path) -> Result<Vec<PathBuf>, ScannerError> {
        let mut music_files = Vec::new();
        
        if !path.exists() || !path.is_dir() {
            return Err(ScannerError::InvalidDirectory);
        }
        
        for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            
            if path.is_file() {
                if let Some(extension) = path.extension() {
                    if let Some(ext_str) = extension.to_str() {
                        if self.supported_extensions.contains(&ext_str.to_lowercase()) {
                            music_files.push(path.to_path_buf());
                        }
                    }
                }
            }
        }
        
        Ok(music_files)
    }
}
```

#### 3.4.3 元数据解析器实现

元数据解析器将负责解析音乐文件的元数据。

```rust
pub struct MetadataParser;

impl MetadataParser {
    pub fn parse_metadata(&self, path: &Path) -> Result<Metadata, MetadataError> {
        let hint = Hint::new();
        let source = Box::new(File::open(path)?);
        let mss = MediaSourceStream::new(source, Default::default());
        
        let format_opts = FormatOptions::default();
        let metadata_opts = MetadataOptions::default();
        
        let probed = symphonia::default::get_probe().format(&hint, mss, &format_opts, &metadata_opts)?;
        
        let mut metadata = Metadata {
            path: path.to_path_buf(),
            title: None,
            artist: None,
            album: None,
            genre: None,
            year: None,
            track_number: None,
            duration: None,
        };
        
        // 从probed.format.metadata()中提取元数据
        if let Some(title) = probed.format.metadata().get("title") {
            metadata.title = Some(title.to_string());
        }
        
        if let Some(artist) = probed.format.metadata().get("artist") {
            metadata.artist = Some(artist.to_string());
        }
        
        if let Some(album) = probed.format.metadata().get("album") {
            metadata.album = Some(album.to_string());
        }
        
        if let Some(genre) = probed.format.metadata().get("genre") {
            metadata.genre = Some(genre.to_string());
        }
        
        if let Some(year) = probed.format.metadata().get("date") {
            metadata.year = year.parse::<u32>().ok();
        }
        
        if let Some(track) = probed.format.metadata().get("track") {
            metadata.track_number = track.parse::<u32>().ok();
        }
        
        // 计算音频时长
        let duration = probed.format.duration();
        if duration > 0 {
            metadata.duration = Some(duration as f64 / probed.format.time_base().unwrap().den as f64);
        }
        
        Ok(metadata)
    }
}
```

#### 3.4.4 音乐库存储实现

音乐库存储将使用SQLite数据库存储音乐库数据。

```rust
pub struct MusicLibrary {
    conn: Connection,
}

impl MusicLibrary {
    pub fn new(db_path: &Path) -> Result<Self, MusicLibraryError> {
        let conn = Connection::open(db_path)?;
        
        // 创建必要的表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                title TEXT,
                artist TEXT,
                album TEXT,
                genre TEXT,
                year INTEGER,
                track_number INTEGER,
                duration REAL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER,
                track_id INTEGER,
                position INTEGER,
                PRIMARY KEY (playlist_id, track_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE
            )",
            [],
        )?;
        
        Ok(Self { conn })
    }
    
    pub fn add_track(&self, metadata: &Metadata) -> Result<i64, MusicLibraryError> {
        let mut stmt = self.conn.prepare(
            "INSERT OR REPLACE INTO tracks (path, title, artist, album, genre, year, track_number, duration)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )?;
        
        let id = stmt.insert(params![
            metadata.path.to_string_lossy().to_string(),
            metadata.title,
            metadata.artist,
            metadata.album,
            metadata.genre,
            metadata.year,
            metadata.track_number,
            metadata.duration,
        ])?;
        
        Ok(id)
    }
    
    pub fn get_track(&self, id: i64) -> Result<Track, MusicLibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, title, artist, album, genre, year, track_number, duration
             FROM tracks
             WHERE id = ?",
        )?;
        
        let track = stmt.query_row(params![id], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: PathBuf::from(row.get::<_, String>(1)?),
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                duration: row.get(8)?,
            })
        })?;
        
        Ok(track)
    }
    
    pub fn get_all_tracks(&self) -> Result<Vec<Track>, MusicLibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, title, artist, album, genre, year, track_number, duration
             FROM tracks
             ORDER BY artist, album, track_number",
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: PathBuf::from(row.get::<_, String>(1)?),
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                duration: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }
    
    // 其他方法：创建播放列表、添加歌曲到播放列表、获取播放列表等
}
```

### 3.5 配置管理模块

配置管理模块负责管理用户配置，包括音频设置、界面设置、音乐库设置等。

#### 3.5.1 模块结构

配置管理模块将包含以下主要组件：

1. **配置存储**：负责存储和加载配置
2. **配置访问**：提供访问和修改配置的接口
3. **配置验证**：验证配置的有效性

#### 3.5.2 配置结构

配置将使用Serde进行序列化和反序列化，存储为TOML格式。

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub audio: AudioConfig,
    pub ui: UIConfig,
    pub library: LibraryConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioConfig {
    pub volume: f32,
    pub output_device: Option<String>,
    pub equalizer_enabled: bool,
    pub equalizer_presets: HashMap<String, Vec<f32>>,
    pub current_equalizer_preset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIConfig {
    pub theme: Theme,
    pub language: String,
    pub show_album_art: bool,
    pub show_lyrics: bool,
    pub show_visualizer: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryConfig {
    pub music_directories: Vec<PathBuf>,
    pub scan_on_startup: bool,
    pub exclude_directories: Vec<PathBuf>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Theme {
    Light,
    Dark,
    System,
}
```

#### 3.5.3 配置管理器实现

配置管理器将负责加载、保存和访问配置。

```rust
pub struct ConfigManager {
    config: Config,
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(config_path: PathBuf) -> Result<Self, ConfigError> {
        let config = if config_path.exists() {
            let config_str = fs::read_to_string(&config_path)?;
            toml::from_str(&config_str)?
        } else {
            let default_config = Config::default();
            let config_str = toml::to_string(&default_config)?;
            fs::create_dir_all(config_path.parent().unwrap())?;
            fs::write(&config_path, config_str)?;
            default_config
        };
        
        Ok(Self {
            config,
            config_path,
        })
    }
    
    pub fn get_config(&self) -> &Config {
        &self.config
    }
    
    pub fn get_config_mut(&mut self) -> &mut Config {
        &mut self.config
    }
    
    pub fn save(&self) -> Result<(), ConfigError> {
        let config_str = toml::to_string(&self.config)?;
        fs::write(&self.config_path, config_str)?;
        Ok(())
    }
    
    pub fn reload(&mut self) -> Result<(), ConfigError> {
        let config_str = fs::read_to_string(&self.config_path)?;
        self.config = toml::from_str(&config_str)?;
        Ok(())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            audio: AudioConfig {
                volume: 0.5,
                output_device: None,
                equalizer_enabled: false,
                equalizer_presets: HashMap::new(),
                current_equalizer_preset: None,
            },
            ui: UIConfig {
                theme: Theme::System,
                language: "en".to_string(),
                show_album_art: true,
                show_lyrics: true,
                show_visualizer: true,
            },
            library: LibraryConfig {
                music_directories: vec![],
                scan_on_startup: true,
                exclude_directories: vec![],
            },
        }
    }
}
```


## 4. 接口设计

### 4.1 模块间接口

模块间接口定义了各个模块之间的交互方式，确保模块之间的解耦和可测试性。本项目采用Trait（特质）来定义模块间的接口，这是Rust语言中实现多态和接口的主要方式。

#### 4.1.1 音频解码器接口

音频解码器接口定义了解码器的基本功能，使不同的解码器实现可以互换使用。

```rust
pub trait AudioDecoder: Send {
    /// 跳转到指定位置
    /// 
    /// # 参数
    /// * `position_ms` - 目标位置，单位为毫秒
    /// 
    /// # 返回值
    /// 实际跳转到的位置，单位为毫秒
    fn seek(&mut self, position_ms: u32) -> Result<u32, DecoderError>;
    
    /// 获取下一个音频包
    /// 
    /// # 返回值
    /// 如果成功，返回音频包位置、音频包数据、通道数和采样率
    /// 如果到达文件末尾，返回None
    fn next_packet(&mut self) -> DecoderResult<Option<(AudioPacketPosition, AudioPacket, u16, u32)>>;
    
    /// 获取音频元数据
    /// 
    /// # 返回值
    /// 音频元数据
    fn metadata(&self) -> Option<&Metadata> {
        None
    }
    
    /// 获取音频总时长
    /// 
    /// # 返回值
    /// 音频总时长，单位为毫秒
    fn duration(&self) -> Option<u32> {
        None
    }
}
```

#### 4.1.2 音频输出接口

音频输出接口定义了音频输出的基本功能，使不同的音频输出实现可以互换使用。

```rust
pub trait AudioOutput: Send {
    /// 播放音频
    /// 
    /// # 参数
    /// * `source` - 音频源
    fn play(&self, source: Box<dyn Source + Send>);
    
    /// 暂停播放
    fn pause(&self);
    
    /// 恢复播放
    fn resume(&self);
    
    /// 停止播放
    fn stop(&self);
    
    /// 设置音量
    /// 
    /// # 参数
    /// * `volume` - 音量值，范围为0.0-1.0
    fn set_volume(&self, volume: f32);
    
    /// 获取当前音量
    /// 
    /// # 返回值
    /// 当前音量值，范围为0.0-1.0
    fn volume(&self) -> f32;
    
    /// 是否正在播放
    /// 
    /// # 返回值
    /// 如果正在播放，返回true；否则返回false
    fn is_playing(&self) -> bool;
}
```

#### 4.1.3 播放器接口

播放器接口定义了播放器的基本功能，是GUI模块与播放控制模块交互的主要接口。

```rust
#[async_trait]
pub trait Player: Send + Sync {
    /// 加载音频文件
    /// 
    /// # 参数
    /// * `track_id` - 音频文件ID
    /// * `start_playing` - 是否立即开始播放
    /// * `position_ms` - 开始播放的位置，单位为毫秒
    fn load(&mut self, track_id: &str, start_playing: bool, position_ms: u32);
    
    /// 加载播放列表
    /// 
    /// # 参数
    /// * `tracks` - 音频文件列表
    fn load_tracklist(&mut self, tracks: Vec<Track>);
    
    /// 预加载音频文件
    /// 
    /// # 参数
    /// * `track_id` - 音频文件ID
    fn preload(&self, track_id: &str);
    
    /// 开始播放
    fn play(&self);
    
    /// 暂停播放
    fn pause(&self);
    
    /// 停止播放
    fn stop(&self);
    
    /// 跳转到指定位置
    /// 
    /// # 参数
    /// * `position_ms` - 目标位置，单位为毫秒
    fn seek(&self, position_ms: u32);
    
    /// 播放下一首
    fn next(&self);
    
    /// 播放上一首
    fn previous(&self);
    
    /// 播放指定位置的音频文件
    /// 
    /// # 参数
    /// * `index` - 音频文件在播放列表中的索引
    fn play_track_at(&self, index: usize);
    
    /// 清空播放列表
    fn clear(&self);
    
    /// 获取所有音频文件
    /// 
    /// # 返回值
    /// 所有音频文件和当前播放列表
    async fn get_tracks(&self) -> (Vec<Track>, Vec<Track>);
    
    /// 获取当前播放的音频文件
    /// 
    /// # 返回值
    /// 当前播放的音频文件、索引、播放位置和是否正在播放
    async fn get_current_track(&self) -> Option<(Option<Track>, usize, u32, bool)>;
}
```

#### 4.1.4 音乐库接口

音乐库接口定义了音乐库的基本功能，是GUI模块与音乐库管理模块交互的主要接口。

```rust
#[async_trait]
pub trait MusicLibraryService: Send + Sync {
    /// 扫描音乐目录
    /// 
    /// # 参数
    /// * `directories` - 要扫描的目录列表
    /// 
    /// # 返回值
    /// 扫描结果，包括新增、更新和删除的音频文件数量
    async fn scan_directories(&self, directories: Vec<PathBuf>) -> Result<ScanResult, MusicLibraryError>;
    
    /// 获取所有音频文件
    /// 
    /// # 返回值
    /// 所有音频文件
    async fn get_all_tracks(&self) -> Result<Vec<Track>, MusicLibraryError>;
    
    /// 获取指定ID的音频文件
    /// 
    /// # 参数
    /// * `id` - 音频文件ID
    /// 
    /// # 返回值
    /// 指定ID的音频文件
    async fn get_track(&self, id: i64) -> Result<Track, MusicLibraryError>;
    
    /// 搜索音频文件
    /// 
    /// # 参数
    /// * `query` - 搜索关键词
    /// 
    /// # 返回值
    /// 符合搜索条件的音频文件
    async fn search_tracks(&self, query: &str) -> Result<Vec<Track>, MusicLibraryError>;
    
    /// 获取所有艺术家
    /// 
    /// # 返回值
    /// 所有艺术家
    async fn get_all_artists(&self) -> Result<Vec<Artist>, MusicLibraryError>;
    
    /// 获取所有专辑
    /// 
    /// # 返回值
    /// 所有专辑
    async fn get_all_albums(&self) -> Result<Vec<Album>, MusicLibraryError>;
    
    /// 获取指定艺术家的所有专辑
    /// 
    /// # 参数
    /// * `artist_id` - 艺术家ID
    /// 
    /// # 返回值
    /// 指定艺术家的所有专辑
    async fn get_albums_by_artist(&self, artist_id: i64) -> Result<Vec<Album>, MusicLibraryError>;
    
    /// 获取指定专辑的所有音频文件
    /// 
    /// # 参数
    /// * `album_id` - 专辑ID
    /// 
    /// # 返回值
    /// 指定专辑的所有音频文件
    async fn get_tracks_by_album(&self, album_id: i64) -> Result<Vec<Track>, MusicLibraryError>;
    
    /// 获取所有播放列表
    /// 
    /// # 返回值
    /// 所有播放列表
    async fn get_all_playlists(&self) -> Result<Vec<Playlist>, MusicLibraryError>;
    
    /// 创建播放列表
    /// 
    /// # 参数
    /// * `name` - 播放列表名称
    /// 
    /// # 返回值
    /// 创建的播放列表ID
    async fn create_playlist(&self, name: &str) -> Result<i64, MusicLibraryError>;
    
    /// 删除播放列表
    /// 
    /// # 参数
    /// * `playlist_id` - 播放列表ID
    async fn delete_playlist(&self, playlist_id: i64) -> Result<(), MusicLibraryError>;
    
    /// 获取指定播放列表的所有音频文件
    /// 
    /// # 参数
    /// * `playlist_id` - 播放列表ID
    /// 
    /// # 返回值
    /// 指定播放列表的所有音频文件
    async fn get_tracks_by_playlist(&self, playlist_id: i64) -> Result<Vec<Track>, MusicLibraryError>;
    
    /// 添加音频文件到播放列表
    /// 
    /// # 参数
    /// * `playlist_id` - 播放列表ID
    /// * `track_id` - 音频文件ID
    async fn add_track_to_playlist(&self, playlist_id: i64, track_id: i64) -> Result<(), MusicLibraryError>;
    
    /// 从播放列表中移除音频文件
    /// 
    /// # 参数
    /// * `playlist_id` - 播放列表ID
    /// * `track_id` - 音频文件ID
    async fn remove_track_from_playlist(&self, playlist_id: i64, track_id: i64) -> Result<(), MusicLibraryError>;
}
```

#### 4.1.5 配置管理接口

配置管理接口定义了配置管理的基本功能，是各个模块访问和修改配置的主要接口。

```rust
pub trait ConfigService: Send + Sync {
    /// 获取配置
    /// 
    /// # 返回值
    /// 当前配置
    fn get_config(&self) -> Config;
    
    /// 更新配置
    /// 
    /// # 参数
    /// * `config` - 新的配置
    fn update_config(&self, config: Config) -> Result<(), ConfigError>;
    
    /// 获取音频配置
    /// 
    /// # 返回值
    /// 当前音频配置
    fn get_audio_config(&self) -> AudioConfig;
    
    /// 更新音频配置
    /// 
    /// # 参数
    /// * `audio_config` - 新的音频配置
    fn update_audio_config(&self, audio_config: AudioConfig) -> Result<(), ConfigError>;
    
    /// 获取UI配置
    /// 
    /// # 返回值
    /// 当前UI配置
    fn get_ui_config(&self) -> UIConfig;
    
    /// 更新UI配置
    /// 
    /// # 参数
    /// * `ui_config` - 新的UI配置
    fn update_ui_config(&self, ui_config: UIConfig) -> Result<(), ConfigError>;
    
    /// 获取音乐库配置
    /// 
    /// # 返回值
    /// 当前音乐库配置
    fn get_library_config(&self) -> LibraryConfig;
    
    /// 更新音乐库配置
    /// 
    /// # 参数
    /// * `library_config` - 新的音乐库配置
    fn update_library_config(&self, library_config: LibraryConfig) -> Result<(), ConfigError>;
}
```

### 4.2 外部接口

外部接口定义了应用程序与外部系统的交互方式，包括文件系统、音频设备和系统集成等。

#### 4.2.1 文件系统接口

文件系统接口用于访问和管理音频文件和配置文件。

```rust
pub trait FileSystem: Send + Sync {
    /// 读取文件
    /// 
    /// # 参数
    /// * `path` - 文件路径
    /// 
    /// # 返回值
    /// 文件内容
    fn read_file(&self, path: &Path) -> Result<Vec<u8>, FileSystemError>;
    
    /// 写入文件
    /// 
    /// # 参数
    /// * `path` - 文件路径
    /// * `content` - 文件内容
    fn write_file(&self, path: &Path, content: &[u8]) -> Result<(), FileSystemError>;
    
    /// 检查文件是否存在
    /// 
    /// # 参数
    /// * `path` - 文件路径
    /// 
    /// # 返回值
    /// 如果文件存在，返回true；否则返回false
    fn file_exists(&self, path: &Path) -> bool;
    
    /// 获取目录中的所有文件
    /// 
    /// # 参数
    /// * `dir` - 目录路径
    /// 
    /// # 返回值
    /// 目录中的所有文件
    fn list_files(&self, dir: &Path) -> Result<Vec<PathBuf>, FileSystemError>;
    
    /// 创建目录
    /// 
    /// # 参数
    /// * `dir` - 目录路径
    fn create_dir(&self, dir: &Path) -> Result<(), FileSystemError>;
}
```

#### 4.2.2 音频设备接口

音频设备接口用于与系统音频设备交互，播放音频数据。

```rust
pub trait AudioDevice: Send + Sync {
    /// 获取所有可用的音频输出设备
    /// 
    /// # 返回值
    /// 所有可用的音频输出设备
    fn get_output_devices(&self) -> Result<Vec<AudioDeviceInfo>, AudioDeviceError>;
    
    /// 获取当前使用的音频输出设备
    /// 
    /// # 返回值
    /// 当前使用的音频输出设备
    fn get_current_output_device(&self) -> Result<AudioDeviceInfo, AudioDeviceError>;
    
    /// 设置音频输出设备
    /// 
    /// # 参数
    /// * `device_id` - 设备ID
    fn set_output_device(&self, device_id: &str) -> Result<(), AudioDeviceError>;
    
    /// 播放音频数据
    /// 
    /// # 参数
    /// * `data` - 音频数据
    /// * `format` - 音频格式
    fn play_audio(&self, data: &[u8], format: AudioFormat) -> Result<(), AudioDeviceError>;
    
    /// 暂停播放
    fn pause(&self) -> Result<(), AudioDeviceError>;
    
    /// 恢复播放
    fn resume(&self) -> Result<(), AudioDeviceError>;
    
    /// 停止播放
    fn stop(&self) -> Result<(), AudioDeviceError>;
    
    /// 设置音量
    /// 
    /// # 参数
    /// * `volume` - 音量值，范围为0.0-1.0
    fn set_volume(&self, volume: f32) -> Result<(), AudioDeviceError>;
}
```

#### 4.2.3 系统集成接口

系统集成接口用于与操作系统集成，如系统通知、媒体键控制等。

```rust
pub trait SystemIntegration: Send + Sync {
    /// 显示系统通知
    /// 
    /// # 参数
    /// * `title` - 通知标题
    /// * `message` - 通知内容
    /// * `icon` - 通知图标
    fn show_notification(&self, title: &str, message: &str, icon: Option<&Path>) -> Result<(), SystemIntegrationError>;
    
    /// 注册媒体键处理器
    /// 
    /// # 参数
    /// * `handler` - 媒体键处理器
    fn register_media_key_handler(&self, handler: Box<dyn MediaKeyHandler>) -> Result<(), SystemIntegrationError>;
    
    /// 设置系统托盘图标
    /// 
    /// # 参数
    /// * `icon` - 托盘图标
    /// * `menu` - 托盘菜单
    fn set_tray_icon(&self, icon: &Path, menu: Vec<TrayMenuItem>) -> Result<(), SystemIntegrationError>;
    
    /// 获取系统主题
    /// 
    /// # 返回值
    /// 系统主题
    fn get_system_theme(&self) -> Result<Theme, SystemIntegrationError>;
    
    /// 注册系统主题变化监听器
    /// 
    /// # 参数
    /// * `listener` - 系统主题变化监听器
    fn register_theme_change_listener(&self, listener: Box<dyn ThemeChangeListener>) -> Result<(), SystemIntegrationError>;
}
```


## 5. 数据设计

### 5.1 数据结构

数据结构定义了应用程序中使用的主要数据类型，包括音频文件、播放列表、配置等。

#### 5.1.1 音频文件数据结构

音频文件数据结构用于表示音频文件的元数据和播放信息。

```rust
/// 音频文件元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    /// 文件路径
    pub path: PathBuf,
    /// 标题
    pub title: Option<String>,
    /// 艺术家
    pub artist: Option<String>,
    /// 专辑
    pub album: Option<String>,
    /// 流派
    pub genre: Option<String>,
    /// 年份
    pub year: Option<u32>,
    /// 音轨号
    pub track_number: Option<u32>,
    /// 时长（秒）
    pub duration: Option<f64>,
}

/// 音频文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    /// 唯一标识符
    pub id: i64,
    /// 文件路径
    pub path: PathBuf,
    /// 标题
    pub title: Option<String>,
    /// 艺术家
    pub artist: Option<String>,
    /// 专辑
    pub album: Option<String>,
    /// 流派
    pub genre: Option<String>,
    /// 年份
    pub year: Option<u32>,
    /// 音轨号
    pub track_number: Option<u32>,
    /// 时长（秒）
    pub duration: Option<f64>,
}

/// 艺术家
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artist {
    /// 唯一标识符
    pub id: i64,
    /// 名称
    pub name: String,
    /// 专辑数量
    pub album_count: u32,
    /// 音轨数量
    pub track_count: u32,
}

/// 专辑
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    /// 唯一标识符
    pub id: i64,
    /// 标题
    pub title: String,
    /// 艺术家ID
    pub artist_id: i64,
    /// 艺术家名称
    pub artist_name: String,
    /// 年份
    pub year: Option<u32>,
    /// 音轨数量
    pub track_count: u32,
}

/// 播放列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    /// 唯一标识符
    pub id: i64,
    /// 名称
    pub name: String,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 音轨数量
    pub track_count: u32,
}

/// 播放列表音轨
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistTrack {
    /// 播放列表ID
    pub playlist_id: i64,
    /// 音轨ID
    pub track_id: i64,
    /// 位置
    pub position: u32,
}
```

#### 5.1.2 播放控制数据结构

播放控制数据结构用于表示播放状态、播放模式等。

```rust
/// 播放状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlayerState {
    /// 播放中
    Playing,
    /// 暂停
    Paused,
    /// 停止
    Stopped,
}

/// 播放模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlayMode {
    /// 顺序播放
    Order,
    /// 随机播放
    Random,
    /// 单曲循环
    Repeat,
    /// 列表循环
    RepeatAll,
}

/// 播放事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlayerEvent {
    /// 开始播放
    Playing {
        /// 当前播放的音轨
        track: Track,
    },
    /// 暂停播放
    Paused,
    /// 停止播放
    Stopped,
    /// 音轨变化
    TrackChanged {
        /// 新的音轨
        track: Track,
    },
    /// 进度变化
    ProgressChanged {
        /// 当前位置（毫秒）
        position_ms: u32,
        /// 总时长（毫秒）
        duration_ms: u32,
    },
    /// 音量变化
    VolumeChanged {
        /// 新的音量
        volume: f32,
    },
    /// 播放模式变化
    ModeChanged {
        /// 新的播放模式
        mode: PlayMode,
    },
    /// 播放队列变化
    QueueChanged,
    /// 错误
    Error {
        /// 错误信息
        message: String,
    },
}

/// 播放队列
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayQueue {
    /// 音轨列表
    pub tracks: Vec<Track>,
    /// 当前索引
    pub current_index: Option<usize>,
    /// 历史记录
    pub history: Vec<usize>,
}
```

#### 5.1.3 配置数据结构

配置数据结构用于表示用户配置。

```rust
/// 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// 音频配置
    pub audio: AudioConfig,
    /// UI配置
    pub ui: UIConfig,
    /// 音乐库配置
    pub library: LibraryConfig,
}

/// 音频配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioConfig {
    /// 音量
    pub volume: f32,
    /// 输出设备
    pub output_device: Option<String>,
    /// 均衡器是否启用
    pub equalizer_enabled: bool,
    /// 均衡器预设
    pub equalizer_presets: HashMap<String, Vec<f32>>,
    /// 当前均衡器预设
    pub current_equalizer_preset: Option<String>,
}

/// UI配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIConfig {
    /// 主题
    pub theme: Theme,
    /// 语言
    pub language: String,
    /// 是否显示专辑封面
    pub show_album_art: bool,
    /// 是否显示歌词
    pub show_lyrics: bool,
    /// 是否显示可视化效果
    pub show_visualizer: bool,
}

/// 音乐库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryConfig {
    /// 音乐目录
    pub music_directories: Vec<PathBuf>,
    /// 是否在启动时扫描
    pub scan_on_startup: bool,
    /// 排除目录
    pub exclude_directories: Vec<PathBuf>,
}

/// 主题
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Theme {
    /// 亮色主题
    Light,
    /// 暗色主题
    Dark,
    /// 跟随系统
    System,
}
```

### 5.2 数据存储

数据存储定义了应用程序中数据的存储方式，包括音乐库数据、配置数据等。

#### 5.2.1 音乐库数据存储

音乐库数据将使用SQLite数据库存储，数据库结构如下：

##### 5.2.1.1 数据库表结构

**tracks表**：存储音频文件信息

| 字段名 | 类型 | 说明 |
|-------|------|------|
| id | INTEGER | 主键，自增 |
| path | TEXT | 文件路径，唯一 |
| title | TEXT | 标题 |
| artist | TEXT | 艺术家 |
| album | TEXT | 专辑 |
| genre | TEXT | 流派 |
| year | INTEGER | 年份 |
| track_number | INTEGER | 音轨号 |
| duration | REAL | 时长（秒） |

**artists表**：存储艺术家信息

| 字段名 | 类型 | 说明 |
|-------|------|------|
| id | INTEGER | 主键，自增 |
| name | TEXT | 艺术家名称，唯一 |

**albums表**：存储专辑信息

| 字段名 | 类型 | 说明 |
|-------|------|------|
| id | INTEGER | 主键，自增 |
| title | TEXT | 专辑标题 |
| artist_id | INTEGER | 艺术家ID，外键 |
| year | INTEGER | 年份 |

**playlists表**：存储播放列表信息

| 字段名 | 类型 | 说明 |
|-------|------|------|
| id | INTEGER | 主键，自增 |
| name | TEXT | 播放列表名称，唯一 |
| created_at | TIMESTAMP | 创建时间 |

**playlist_tracks表**：存储播放列表中的音轨信息

| 字段名 | 类型 | 说明 |
|-------|------|------|
| playlist_id | INTEGER | 播放列表ID，外键 |
| track_id | INTEGER | 音轨ID，外键 |
| position | INTEGER | 位置 |

##### 5.2.1.2 索引

为了提高查询性能，将创建以下索引：

- tracks表：path字段（唯一索引）
- tracks表：artist字段
- tracks表：album字段
- artists表：name字段（唯一索引）
- albums表：artist_id字段
- playlist_tracks表：(playlist_id, position)组合索引

##### 5.2.1.3 数据库初始化

数据库初始化将在应用程序首次启动时执行，创建必要的表和索引。

```rust
pub fn initialize_database(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            title TEXT,
            artist TEXT,
            album TEXT,
            genre TEXT,
            year INTEGER,
            track_number INTEGER,
            duration REAL
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS artists (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            artist_id INTEGER NOT NULL,
            year INTEGER,
            FOREIGN KEY (artist_id) REFERENCES artists (id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id INTEGER,
            track_id INTEGER,
            position INTEGER,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // 创建索引
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks (artist)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks (album)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums (artist_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks (playlist_id, position)", [])?;
    
    Ok(())
}
```

#### 5.2.2 配置数据存储

配置数据将使用TOML格式存储在配置文件中，配置文件路径根据不同操作系统有所不同：

- Windows：`%APPDATA%\RustMusicPlayer\config.toml`
- macOS：`~/Library/Application Support/RustMusicPlayer/config.toml`
- Linux：`~/.config/rust-music-player/config.toml`

配置文件示例：

```toml
# 音频配置
[audio]
volume = 0.5
output_device = "default"
equalizer_enabled = false

# 均衡器预设
[audio.equalizer_presets]
"Flat" = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
"Bass Boost" = [6.0, 4.5, 3.0, 1.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
"Treble Boost" = [0.0, 0.0, 0.0, 0.0, 0.0, 1.5, 3.0, 4.5, 6.0, 7.5]

# UI配置
[ui]
theme = "System"
language = "zh-CN"
show_album_art = true
show_lyrics = true
show_visualizer = true

# 音乐库配置
[library]
scan_on_startup = true

# 音乐目录
music_directories = [
    "/home/user/Music",
    "/media/user/External/Music"
]

# 排除目录
exclude_directories = [
    "/home/user/Music/Temp"
]
```

#### 5.2.3 缓存数据存储

为了提高性能，应用程序将缓存一些频繁访问的数据，如专辑封面、歌词等。缓存数据将存储在以下目录：

- Windows：`%LOCALAPPDATA%\RustMusicPlayer\cache`
- macOS：`~/Library/Caches/RustMusicPlayer`
- Linux：`~/.cache/rust-music-player`

缓存目录结构：

```
cache/
├── album_art/        # 专辑封面缓存
│   ├── <album_id>.jpg
│   └── ...
├── lyrics/           # 歌词缓存
│   ├── <track_id>.lrc
│   └── ...
└── waveforms/        # 波形数据缓存
    ├── <track_id>.dat
    └── ...
```

缓存管理将实现以下功能：

1. **缓存限制**：限制缓存大小，当缓存超过限制时，删除最久未使用的缓存项
2. **缓存验证**：定期验证缓存项是否有效，删除无效的缓存项
3. **缓存清理**：提供清理缓存的功能，允许用户手动清理缓存


## 6. 实现计划

### 6.1 开发环境

#### 6.1.1 开发工具

开发本音乐播放器将使用以下工具：

1. **编程语言**：
   - Rust：主要开发语言，用于后端逻辑和核心功能
   - TypeScript：用于前端开发（Tauri + React）
   - HTML/CSS：用于UI布局和样式

2. **开发环境**：
   - Rust：rustc 1.75.0 或更高版本
   - Node.js：v18.0.0 或更高版本
   - npm：v9.0.0 或更高版本

3. **IDE/编辑器**：
   - Visual Studio Code：主要开发工具
   - 推荐插件：
     - rust-analyzer：Rust语言支持
     - Tauri：Tauri开发支持
     - ESLint：JavaScript/TypeScript代码检查
     - Prettier：代码格式化

4. **构建工具**：
   - Cargo：Rust包管理和构建工具
   - Vite：前端构建工具
   - Tauri CLI：Tauri应用构建工具

5. **版本控制**：
   - Git：版本控制系统
   - GitHub：代码托管平台

#### 6.1.2 依赖库

本项目将使用以下主要依赖库：

1. **Rust依赖**：
   - **tauri**：跨平台GUI框架
   - **symphonia**：音频解码库
   - **rodio**：音频播放库
   - **ffmpeg-next**：FFmpeg绑定，用于支持更多音频格式
   - **tokio**：异步运行时
   - **rusqlite**：SQLite数据库接口
   - **serde**：序列化和反序列化
   - **toml**：TOML格式支持
   - **walkdir**：文件系统遍历
   - **log**：日志记录
   - **env_logger**：日志配置
   - **thiserror**：错误处理
   - **async-trait**：异步trait支持

2. **前端依赖**：
   - **React**：UI库
   - **TailwindCSS**：CSS框架
   - **Redux Toolkit**：状态管理
   - **React Router**：路由管理
   - **Tauri API**：与Rust后端通信
   - **Vite**：构建工具

#### 6.1.3 开发环境设置

1. **安装Rust**：
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **安装Node.js和npm**：
   从官方网站下载并安装：https://nodejs.org/

3. **安装Tauri CLI**：
   ```bash
   cargo install tauri-cli
   ```

4. **安装前端依赖**：
   ```bash
   npm install -g create-vite
   ```

5. **安装系统依赖**（Linux）：
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
   
   # Fedora
   sudo dnf install openssl-devel gtk3-devel webkit2gtk3-devel libappindicator-gtk3-devel librsvg2-devel patchelf
   ```

6. **克隆项目仓库**：
   ```bash
   git clone https://github.com/username/rust-music-player.git
   cd rust-music-player
   ```

7. **安装项目依赖**：
   ```bash
   # 安装Rust依赖
   cargo build
   
   # 安装前端依赖
   cd src-ui
   npm install
   ```

### 6.2 实现步骤

项目实现将分为以下几个阶段：

#### 6.2.1 阶段一：项目初始化和基础架构

**目标**：搭建项目基础架构，实现基本的模块划分和接口定义。

**任务**：
1. 创建Tauri项目
2. 设置项目目录结构
3. 定义核心数据结构和接口
4. 实现基本的配置管理功能
5. 设置日志系统

**预计时间**：2周

#### 6.2.2 阶段二：音频处理模块实现

**目标**：实现音频解码和播放功能，支持基本的音频格式。

**任务**：
1. 实现Symphonia解码器
2. 实现FFmpeg解码器（用于APE等格式）
3. 实现Rodio音频输出
4. 实现音频元数据解析
5. 实现基本的播放控制功能（播放、暂停、停止）

**预计时间**：3周

#### 6.2.3 阶段三：音乐库管理模块实现

**目标**：实现音乐库管理功能，包括扫描、导入、查询等。

**任务**：
1. 实现SQLite数据库初始化和管理
2. 实现音乐文件扫描功能
3. 实现音乐元数据存储和查询
4. 实现播放列表管理功能
5. 实现音乐库搜索功能

**预计时间**：3周

#### 6.2.4 阶段四：UI实现

**目标**：实现用户界面，包括主界面、音乐库界面、播放控制等。

**任务**：
1. 设计和实现主界面布局
2. 实现音乐库界面
3. 实现播放控制界面
4. 实现播放列表界面
5. 实现设置界面
6. 实现主题切换功能

**预计时间**：4周

#### 6.2.5 阶段五：高级功能实现

**目标**：实现高级功能，如音频可视化、歌词显示、均衡器等。

**任务**：
1. 实现音频可视化功能
2. 实现歌词显示和同步功能
3. 实现均衡器功能
4. 实现系统集成功能（通知、媒体键控制等）
5. 实现导入/导出播放列表功能

**预计时间**：3周

#### 6.2.6 阶段六：测试和优化

**目标**：进行全面测试，修复bug，优化性能。

**任务**：
1. 编写单元测试和集成测试
2. 进行性能测试和优化
3. 进行跨平台测试
4. 修复发现的bug
5. 优化用户体验

**预计时间**：2周

#### 6.2.7 阶段七：打包和发布

**目标**：打包应用程序，准备发布。

**任务**：
1. 配置Tauri打包设置
2. 为不同平台（Windows、macOS、Linux）打包应用
3. 编写安装说明和用户文档
4. 准备发布材料（截图、描述等）

**预计时间**：1周

### 6.3 测试计划

#### 6.3.1 测试类型

本项目将进行以下类型的测试：

1. **单元测试**：测试各个模块的独立功能
2. **集成测试**：测试模块之间的交互
3. **系统测试**：测试整个应用程序的功能
4. **性能测试**：测试应用程序的性能和资源使用
5. **跨平台测试**：测试应用程序在不同平台上的兼容性
6. **用户界面测试**：测试用户界面的可用性和响应性

#### 6.3.2 单元测试

单元测试将使用Rust的内置测试框架和mock库进行，主要测试以下模块：

1. **音频解码器**：测试不同格式的音频文件解码
2. **音频输出**：测试音频播放功能
3. **播放控制**：测试播放、暂停、停止等功能
4. **音乐库管理**：测试数据库操作和查询
5. **配置管理**：测试配置的加载和保存

示例单元测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_symphonia_decoder() {
        // 创建测试音频文件
        let test_file = create_test_audio_file();
        
        // 创建解码器
        let decoder = SymphoniaDecoder::new(test_file, Hint::new()).unwrap();
        
        // 测试解码功能
        let result = decoder.next_packet().unwrap();
        assert!(result.is_some());
        
        // 测试seek功能
        let position = decoder.seek(1000).unwrap();
        assert_eq!(position, 1000);
    }
    
    #[test]
    fn test_play_queue() {
        // 创建播放队列
        let mut queue = PlayQueue::new();
        
        // 添加测试音轨
        let track1 = create_test_track(1);
        let track2 = create_test_track(2);
        let track3 = create_test_track(3);
        
        queue.add_track(track1.clone());
        queue.add_track(track2.clone());
        queue.add_track(track3.clone());
        
        // 测试当前音轨
        assert_eq!(queue.current_track().unwrap().id, track1.id);
        
        // 测试下一首
        let next = queue.next(PlayMode::Order).unwrap();
        assert_eq!(next.id, track2.id);
        
        // 测试上一首
        let prev = queue.previous(PlayMode::Order).unwrap();
        assert_eq!(prev.id, track1.id);
        
        // 测试随机播放
        queue.next(PlayMode::Random);
        assert!(queue.current_index.is_some());
    }
}
```

#### 6.3.3 集成测试

集成测试将测试模块之间的交互，主要测试以下场景：

1. **播放控制与音频处理**：测试播放控制模块与音频处理模块的交互
2. **音乐库与播放控制**：测试音乐库模块与播放控制模块的交互
3. **UI与后端**：测试UI与后端模块的交互

示例集成测试：

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;
    
    #[tokio::test]
    async fn test_player_and_library_integration() {
        // 创建测试数据库
        let db_path = create_test_database();
        
        // 创建音乐库服务
        let library_service = MusicLibraryServiceImpl::new(db_path).unwrap();
        
        // 创建播放器
        let player = PlayerImpl::new().unwrap();
        
        // 添加测试音轨到音乐库
        let track = create_test_track(1);
        library_service.add_track(&track).await.unwrap();
        
        // 从音乐库加载音轨到播放器
        let tracks = library_service.get_all_tracks().await.unwrap();
        player.load_tracklist(tracks).await.unwrap();
        
        // 测试播放
        player.play().await.unwrap();
        assert_eq!(player.state().await.unwrap(), PlayerState::Playing);
        
        // 测试暂停
        player.pause().await.unwrap();
        assert_eq!(player.state().await.unwrap(), PlayerState::Paused);
        
        // 测试停止
        player.stop().await.unwrap();
        assert_eq!(player.state().await.unwrap(), PlayerState::Stopped);
    }
}
```

#### 6.3.4 系统测试

系统测试将测试整个应用程序的功能，主要测试以下场景：

1. **应用程序启动**：测试应用程序的启动过程
2. **音乐库扫描**：测试音乐库扫描功能
3. **播放功能**：测试音频播放功能
4. **播放列表管理**：测试播放列表的创建、编辑和删除
5. **设置管理**：测试设置的修改和保存

系统测试将使用手动测试和自动化测试相结合的方式进行。

#### 6.3.5 性能测试

性能测试将测试应用程序的性能和资源使用，主要测试以下方面：

1. **内存使用**：测试应用程序的内存使用情况
2. **CPU使用**：测试应用程序的CPU使用情况
3. **启动时间**：测试应用程序的启动时间
4. **响应时间**：测试用户操作的响应时间
5. **音频解码性能**：测试不同格式音频文件的解码性能

性能测试将使用性能分析工具和基准测试进行。

#### 6.3.6 跨平台测试

跨平台测试将测试应用程序在不同平台上的兼容性，主要测试以下平台：

1. **Windows**：Windows 10/11
2. **macOS**：macOS 11.0+
3. **Linux**：Ubuntu 20.04+, Fedora 35+

跨平台测试将使用虚拟机和实际设备进行。

#### 6.3.7 用户界面测试

用户界面测试将测试用户界面的可用性和响应性，主要测试以下方面：

1. **布局**：测试界面布局在不同屏幕尺寸下的适应性
2. **交互**：测试用户交互的流畅性和直观性
3. **主题**：测试不同主题下的界面显示
4. **可访问性**：测试界面的可访问性，如键盘导航、屏幕阅读器支持等

用户界面测试将使用手动测试和自动化测试相结合的方式进行。


## 7. 附录

### 7.1 术语表

## 8. 许可证

本项目采用 GNU GENERAL PUBLIC LICENSE Version 3 - 详情请参阅 [LICENSE](LICENSE) 文件。

| 术语 | 定义 |
|------|------|
| APE | Monkey's Audio，一种无损音频压缩格式 |
| API | 应用程序编程接口（Application Programming Interface） |
| FLAC | 自由无损音频编解码器（Free Lossless Audio Codec），一种无损音频压缩格式 |
| GUI | 图形用户界面（Graphical User Interface） |
| MP3 | MPEG-1 Audio Layer III，一种有损音频压缩格式 |
| Rodio | Rust音频播放库 |
| SQLite | 一种轻量级的关系型数据库 |
| Symphonia | Rust音频解码库 |
| Tauri | 基于Web技术的跨平台桌面应用开发框架 |
| TOML | Tom's Obvious, Minimal Language，一种配置文件格式 |
| Trait | Rust语言中的特质，类似于其他语言中的接口 |
| WAV | Waveform Audio File Format，一种无压缩音频格式 |

### 7.2 参考文献

1. Rust官方文档. https://www.rust-lang.org/learn
2. 2025年Rust GUI库调研报告. https://www.boringcactus.com/2025/04/13/2025-survey-of-rust-gui-libraries.html
3. Symphonia音频库文档. https://github.com/pdeljanov/Symphonia
4. Rodio音频库文档. https://github.com/RustAudio/rodio
5. Tauri框架文档. https://tauri.app/
6. SQLite官方文档. https://www.sqlite.org/docs.html
7. flac_music项目. https://github.com/wandercn/flac_music
8. music-player项目. https://github.com/tsirysndr/music-player
9. FFmpeg官方文档. https://ffmpeg.org/documentation.html
10. React官方文档. https://reactjs.org/docs/getting-started.html
11. TailwindCSS文档. https://tailwindcss.com/docs
12. Vite文档. https://vitejs.dev/guide/
13. Serde文档. https://serde.rs/
14. Tokio文档. https://tokio.rs/docs/overview/
15. Rusqlite文档. https://docs.rs/rusqlite/latest/rusqlite/
