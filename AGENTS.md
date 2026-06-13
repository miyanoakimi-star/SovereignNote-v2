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
