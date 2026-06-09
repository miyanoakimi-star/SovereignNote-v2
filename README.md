# SovereignNote 

> 一款深度贯彻主权自治、完全零依赖云服务的跨平台极客笔记系统。内建全终端屏幕自适应与强大的 Markdown / 白板 / 导图 生产力套件。

---

## 🚀 当前版本及更新日志

### 当前版本：`v2.0.1`
**版本名称**：`SovereignNote v2.0.1 标签构架重构与缓存管理优化`

#### 🎉 SovereignNote v2.0.1 核心更新内容

- **🏷️ 全局标签关联重构**: 重写了基于内容的标签自动归纳算法与多层树级统计模型，修复了部分情况下标签批量导出不全的问题。
- **🗑️ 硬件级缓存安全销毁**: 「系统设置」面板已新增专门的本地沙盒前端数据库清空选项，以便于随时在物理终端上彻底焚毁并重置离线的应用级缓存。
- **🐛 细节体验改善**: 其他一系列关于底层渲染堆栈稳定性的小型体验修复。

---

## 💻 本地运行

在本地运行和部署您的 SovereignNote 应用。

### 前提条件
- **Node.js** (推荐 v18+)
- **Rust/Cargo**（构建和运行核心后端服务所需）

### 运行步骤
1. **安装前端依赖**：
   ```bash
   npm install
   ```
2. **设置环境变量**：
   在根目录下创建 `.env.local` 文件，并设置您的 Gemini API Key：
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
3. **运行开发环境**：
   ```bash
   npm run dev
   ```

---

## 🌐 AI Studio
- **在 AI Studio 中查看应用**：[SovereignNote in AI Studio](https://ai.studio/apps/934e2615-a7a3-47eb-8558-167075455ba5)
