# Changelog

## v2.4.2 (Latest)

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
