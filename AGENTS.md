# SovereignNote 核心架构总则与 AI 协作指南

本指南定义了 **SovereignNote (主权笔记)** 系统的核心架构规范、多端协同融合标准（LWW）以及后续 AI 助手在迭代本项目时的开发红线。所有 AI 代码生成模型在读取此代码库时均应严格遵循以下总则。

---

## 📖 项目哲学：数据主权自治 (Sovereign-by-Design)

SovereignNote 是一款离线优先、安全自治、无任何商业中心云服务商锁定的分布式笔记与联动日程管理系统。它通过一套“本地核心内核 + 边缘轻量视图”的对等端架构运行：
1. **离线高可靠工作**：本地基于轻量核心 Rust 开发的后台内核，保障数据秒级读写、SQLite 关系存储与离线抗灾。
2. **多协议网络中继**：开放 WebDAV、FTP、本地局域网点对点（P2P/SSE）等多样化中继同步，不锁死任何单一存储介质。
3. **最终一致性共识**：基于无重叠时间偏序的 **LWW-Element-Set (最后写入赢)** 冲突判定，实现跨手机、跨桌面、跨云端多源合并。

---

## 🏗️ 核心双层架构与通信边界

### 1. 边缘视图层 (Frontend WebView / React)
- **技术栈**：React 18 + TS + Vite + Tailwind CSS + Lucide Icons。
- **运行特征**：部署在独立容器中，而在移动端（Android WebView）中直接呈现并由端侧打包。
- **本地直连**：
  - 前端通过配置的 `apiBaseUrl` 直接与本地后台核心（Rust 内核，运行在 `8787` 端口或指定端口）通信。
  - **Android 调试安全要求**：直接发起 `http://127.0.0.1:8787/api/health` 端口健康请求时，务必记录详细异常，**严禁使用空捕捉（`catch(e) {}`）**而导致丢弃失败根因。

### 2. 核心内核层 (Backend Rust Core)
- **技术栈**：Axum Web Framework + Tokio Async Engine + SQLite DB + Mutex Core Kernel。
- **健康度与锁管理红线**：
  - **API 接口健康检测** (`health`）绝不能在锁争抢中死锁。必须在获取互斥锁（`state.kernel.lock()`）时加入超时设计（`tokio::time::timeout`），确保在后台服务或数据库阻塞时依然能返回 `"status": "busy"` 或 `"kernel_state": "lock_timeout"`，及时让前台获取连接状态。
  ```rust
  async fn health_check(State(state): State<AppState>) -> Json<Value> {
      println!("[HEALTH] request received");
      match tokio::time::timeout(Duration::from_secs(1), state.kernel.lock()).await {
          Ok(kernel) => {
              println!("[HEALTH] lock acquired");
              Json(json!({
                  "status": "ready",
                  "kernel_state": format!("{:?}", kernel.state)
              }))
          }
          Err(_) => {
              println!("[HEALTH] lock timeout");
              Json(json!({
                  "status": "busy",
                  "kernel_state": "lock_timeout"
              }))
          }
      }
  }
  ```

---

## 🔗 核心 API 路由与三层探针架构

### 1. 全套 API 路由矩阵 (API Routing Matrix)

SovereignNote 的 Rust Core (运行在 8787 端口或中继) 提供了以下标准路由，双端协同工作时应严格遵守路由定义：

#### A. 兼容已有旧端点 (Legacy Compatibility Endpoints)
- `GET /notes` -> 读取全部笔记 (旧)
- `POST /notes/sync` -> 笔记同步 (旧)
- `POST /notes/sync/force` -> 强制全量覆盖同步
- `POST /notes/sync/test` -> 测试 LWW 原型连接
- `POST /sync/ftp` -> 推送全部笔记至指定的 FTP 远程中继
- `POST /sync/ftp/pull` -> 从指定 FTP 远程中继拉取历史并覆盖本地
- `POST /sync/ftp/sync` -> 触发本地与 FTP 之间的双向合并同步
- `POST /sync/ftp/test` -> 联通性双向探测与中继可用性测试

#### B. 稳定高可用 LWW + SSE 架构端点 (New Stable LWW & Real-time Endpoints)
- `GET /notes/get` -> 本地全量安全读取
- `POST /notes/update` -> 本地单篇笔记更新 + SSE 广播触发
- `GET /sync/pull` -> 本地最新 LWW 一致性数据包拉取
- `POST /sync/push` -> 客户端 LWW 差分合并推送并落盘
- `GET /events` -> 基于 Server-Sent Events (SSE) 的实时长连接事件总线，用于多端实时联动

#### C. 同步日志与核心系统探针 (Logs & Probe Systems)
- `GET /sync/logs` -> 查询本地同步调试日志排错流
- `DELETE /sync/logs` -> 清空同步日志
- `POST /sync/logs/add` -> 写入单条系统/合并动作日志
- `GET /health` -> 具有 1 秒超时死锁保护的健康监控插口
- `POST /probe` -> 注册三层探针链路状态事件
- `GET /probe/list` -> 查询多端调试探针链路数据
- `/backup/*` -> 本地包结构一键打包归档与灾备数据库导入导出路由

### 2. 三层探针调试系统 (Three-Layer Sync Probe System)

为解决移动端 (Android WebView)、本地内核 (Rust Node) 和远程中继 (FTP/WebDAV Server) 之间复杂长链路下的“静默排错难”痛点，系统架构内建了**三层探针调试 network**：

```
[ 层级 1: Frontend UI ]  ---(探针探测)--->  [ 层级 2: Rust Kernel ]  ---(外挂探测)--->  [ 层级 3: Remote Relay (FTP/WebDAV) ]
       (React 视图层)                           (SQLite 与数据一致)                       (网络中继与无状态存储)
```

- **第一层：Web 视图层 (Frontend)**：主动记录用户操作流、网络发起点、存储读写意图，将前端行为显式推入探针事件中。
- **第二层：本地内核层 (Local Kernel)**：记录核心 SQLite 处理、锁获取、LWW 合并事件，捕获网络层真实异常（如 Failed to Fetch）并记在 `health-log-viewer`。
- **第三层：中继层 (Remote Relay)**：记录 FTP/WebDAV 实际握手、文件创建、目录授权与时间校准偏差。
- **行为红线**：修改同步代码或新增子功能时，**必须**同步埋点并向上报送探针事件（使用 `/probe`），以便多端排查时可在日志控制面板一键追溯全链路调用树。

### 3. 移动端 (Android) 与遗留系统兼容架构 (Capacitor Native)

为了确保 Android 5.1.1 (如诺基亚 N1)、Android 6/7 以及 Android 13/15 全版本兼容性，基于 Capacitor 的客户端在脱离 PC 及 Rust Core 的独立环境中，通过 **Capacitor Native Plugin (Java)** 和前端 `mergeNotesLWW()` 实现对等的网络中继同步能力。

#### A. FTP/WebDAV 的无后端设计 (No-Rust, No-Localhost for Android FTP)
- **WebDAV**: 天然兼容 HTTP/HTTPS/XML，Android 5+ WebView 即可完美支持，通过前端网络层直接调度。
- **FTP 的强约束**: **坚决禁止使用基于 Node Runtime 的库 (如 `basic-ftp`)**。WebView 缺少 Node 核心模块 (net, tls, stream)，强行 polyfill 代码在低级别 Android (如 5.1.1) 会导致极度不稳定甚至完全无法运行。
- **Android FTP 实现方案**: 必须通过 Capacitor Plugin (`FTPPlugin`) 桥接 Android Java 层的 `Apache Commons Net FTPClient`，该方案不仅兼容 Android 4.x，环境隔离更好且极具稳定性。前端应暴露诸如 `await FTPPlugin.testConnection()`, `await FTPPlugin.pull()`, `await FTPPlugin.push()`, `await FTPPlugin.sync()` 的异步接口。

#### B. 数据融合与 LWW 算法重用
无论底层使用何种协议层 (WebDAV/FTP/REST)，拉取到远程数据后，**不必（且不能）重写冲突算法**，直接复用前端逻辑中的 `mergeNotesLWW(localNotes, remoteNotes)` 进行合并。
1. 以 FTP 为例：下拉获取包含 `updated_at`、`deleted`、`id` 规范属性的 `notes.json` 文件。
2. 在前端执行 `mergeNotesLWW(localNotes, remoteNotes)` 得到最终无状态偏序解。
3. 执行上传，将新的全量 `notes.json` 推送到对应中继，完成一次端侧闭环同步。
4. 这极大保障了多途径操作的平级性：“PC 开启时走局域网无状态 LWW 同步”、“PC 离线时在 Android 端直连 FTP 同步”，任意路线均达到相同的最新状态解。

---

## 🔄 冲突解决共识：LWW-Element-Set 算法规范

系统所有的标签、配置、笔记版本冲突，均通过 Client 侧与 Rust Core 双端统一执行 LWW-Register 合并。

1. **结构定义**：实体中必须包含带有时区意识的微秒级时间戳属性 `updated_at`/`timestamp` 与逻辑标记 `deleted`。
2. **合并算子**：
   - 当遇到相同 UUID 的知识节点或标签时，比较 `updated_at`；
   - 具有较大事件时间戳的版本成为唯一可见态：
     - 若其中一方是墓碑记录（`deleted: true`）且其 `updated_at` 最新，则全局认定已删除；
     - 若两端更新时间一致，则以主端（Server/Rust Core 存储）为平局裁决基准。
3. **原子级控制**：前台发生编辑时，应使用防抖逻辑，将原子化改动自动推演至内核 SQLite，防止瞬时多次写入造成锁超载。

---

## 🤖 AI 协作与代码编写守则 (For AI Assistants)

在进行后续功能开发或重构时，任何 AI 助手必须恪守以下开发约束，否则将被视为有害代码。

### 🚨 绝对开发红线 (Strict Constraints)

1. **不要破坏纯净的健康监控通道**：
   - 保持 `/api/health` 异常记录在控制台，帮助排查 Android Webview 端至本地的端口解析（`127.0.0.1:8787`）和网络层拦截风险。
   - 保留 Android 精简一键直测按钮及其控制日志区域（`android-health-log-viewer`），用于网络边界安全探测。

2. **禁止将 API Keys / 敏感信息硬编码或暴露在客户端**：
   - 严格禁止添加 VITE_ 前缀的远程中继账户密码或私人 API Key，所有的同步鉴权流都要包裹在本地 Core API 请求背后代理流出。

3. **零污染 UI 原则：反系统拟态堆砌 (Anti-AI-Slop)**：
   - 不要生成无意义的技术名词或虚构的 telemetry 诊断面板（除非用户明确指定）。
   - 让极简和数据纯粹性成为卡片配色的第一直觉。页面应当保留优雅的、主权明确的卡片布局。

4. **绝对禁止修改开发服务器端口映射**：
   - Web App 的主开发监听由容器网关代理，因此 `package.json` 中的 dev 脚本必须允许在 **0.0.0.0:3000** 外部入网通信，绝对不能由于适配 Android WebView 调试而将前端服务锁定在非 3000 端口！

### 🛠️ 代码结构与模块化规范
- **类型安全优先**：前端修改应维持 `src/types.ts` 等类型的统一声明。所有 API 请求请通过 `src/lib/api.ts` 的封装客户端，保持请求拦截与鉴权逻辑一致性。
- **React UI 结构化**：在对 `src/components/MainArea.tsx` 或 `src/App.tsx` 的编辑中，优先采取非侵入式功能钩子或逻辑组件拆分，避免将万行逻辑无脑堆叠至 App 单一节点导致生成超时截断。
- **修改确认机制**：AI 助手在每次编辑完 Rust 代码或前端后，必须运行本地校验工具 `compile_applet` 完成应用构建分析，验证其在 Rust 上的 Axum 编排和 React JSX 渲染均不存在硬性类型或语法错误。

---

*“主权属于用户，离线即是自由。” —— SovereignNote 核心架构专家组*
