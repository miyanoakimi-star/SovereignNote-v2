# Changelog

## v3.2.2 (Latest)

### 🚀 双核自愈架构与多端生态强化 (Dual-Core Self-Healing & Ecosystem Guard)
本次更新带来了针对底层核心存储、异步网络模型及跨平台环境路由的重大修复，实现全场景无卡顿无闪退运行：

- **自愈式数据存储与启动看门狗 (Self-Healing Storage Guard)**:
  彻底修复了 Windows 版本在特定环境下由于数据库文件被占用或底层 DDL 锁冲突导致的闪退问题。当检测到主数据库路径故障时，启动看门狗将自动触发智能自愈与灾备归档。
- **高性能离散状态机 (`ftp_kernel`)**:
  将 FTP 框架重构为由单所有权驱动的 Actor 状态机。彻底剪除多重异步闭包引起的可变借用多重捕获阻碍。内嵌 200ms 退避抖动（Jitter Buffer），强化在弱网与老旧 Android 设备上的通道稳定性。
- **跨平台多端 API 盾牌 (Capacitor Base URL Shield)**:
  优化 Capacitor 混合环境下的内置 API 底网路由。自动区分原生移动端与 Web 渲染层，保障 Android 真机的连通状态。
- **环境级本地日志归档 (Companion Native Journaling)**:
  自动捕获 Windows 与跨端后台在生命周期内的 Panic、SQL 事务断链等致命异常，并同步物理归档至主执行文件同级目录下的 `sovereign_backend.log` 文本中，大幅降低诊断成本。

## v3.0.0

### 🚀 终极同步架构升级与状态持久化 (Major Sync & State Upgrade)
本次更新为 SovereignNote 带来了全新的里程碑——**完整配置与状态协同同步系统**。

- **全维度标签同步架构 (Universal Tag Sync)**:
  解决了遗留的重大缺陷：原先仅同步纯文本笔记，标签系统遗留为纯本地存储。在新 V3 后端同步引擎中，本地运行状态（包括 `independentTags`, `noteTagsMap`, `customEvents` 等配置维度）已经融入了 LWW (Last-Write-Wins) 内核！
  从此在多重设备上，无论你在哪一面修改了全局分类标签或者日程规划，该状态将会打包进底层通信链路内被精准合并！

- **时光机备份包含全景应用状态**:
  Zip 终极快照不仅能备份核心 SQLite / `notes.json` 数据，所有的用户独立标签也会随着内置影子状态被连带打包！这使得我们现在不仅有 "无感数据漫游"，更拥有了 "带全局标签体和时间轴完整复原" 的无损系统还原级体验！

## v2.4.2

### 🚀 Kernel v2.1 工业级同步引擎升级
本次更新重构了底层的调度通信核心，由原来的 "脆弱型同步管道" 蜕变为 **事件驱动 + 自愈网络状态机 + 多协议一致性内核**。

- **三链路内核状态机 (Kernel State Machine)**:
  实现了对 `FTP / WebDAV / LWW` 等同步驱动的全维度托管。通过 `KernelRequest` 队列调度以及内部生命周期接管，完全解决了旧版本中请求缺乏“确定性执行语义”导致成功与否漂移不定的问题。
  
- **Event Sourcing (事件溯源)**:
  全面引入基于 `KernelEvent` 抽象模型的事件流追踪。每次状态变更、连接重置或合并策略下发都将具备强时间序列绑定，日志彻底升级为全链路事件（取代传统的纯文本追加式记录）。彻底化解曾经的 "碎片化日志" 或 "前端解析只认最后一条" 的情况。

- **防溃散三层执行模型 & JSON Gate 拦截**:
  通过定义坚固的 `Transport (HTTP/LAN) -> Kernel (State) -> Executor (Drivers)` 隔离边界，实现 `safeParseResponse` 网关拦截协议。强制检验返回体语义，系统从此彻底杜绝了因 Web 代理异常抛出 HTML 进而诱发的致命 `Unexpected token < in JSON at position 0` 崩溃故障！

- **自愈链路 (Self-Healing Link System)**:
  内置 Circuit Breaker (熔断器) 和 `warmup_links() / 链路预热` 侦测行为。通过智能的故障触发器实现核心网络协议层的静默自重置 (TCP Socket Re-init & DNS Flush)，修复了原先必须依赖 LWW 反复探活来连带找回 FTP 通道的底层缺陷。

### 🐛 缺陷修复及体验优化
- **FTP 假成功阻断拦截**: 升级 LIST probe 及被动模式的 CWD 前置侦测，精准辨识物理通道成功与数据通道成功的偏差。
- 大幅提高了 SQLite 同步存储表与 SSE (Server-Sent Events) 单向信道的大并发处理能力，单轨日志数据不丢失。
- 收敛 `core-backend` 相关多余的未用依赖与 Warning 信息。
