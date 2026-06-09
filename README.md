# SovereignNote 

> 一款深度贯彻主权自治、完全零依赖云服务的跨平台极客笔记系统。内建全终端屏幕自适应与强大的 Markdown / 白板 / 导图 生产力套件。

---

## 🚀 当前版本及更新日志

### 当前版本：`v2.0.0`
**版本名称**：`SovereignNote v2.0.0 极客高精白板与精细管理版`

#### 🎉 SovereignNote v2.0.0 核心更新内容

- **🎨 强大的白板撤销逻辑 (Undo)**: 完美融合多阶历史状态回退栈，全面捕获绘制笔触。支持 `Ctrl + Z` (Mac 下 `Cmd + Z`) 键盘快捷键随时无缝回滚或撤销历史笔迹。
- **📏 高分设备物理坐标对齐**: 重新设计白板画布的缩放捕捉模型，智能计算 CSS 触控边界与 Canvas 硬件底层分辨率的物理精度，完美平息多分屏或高分 Retina 屏下的笔迹偏移。
- **⚙️ 精细化设置管理**: 对本地同步及界面偏好进行了页级微调分离，操作链路更加纯净、直观。
- **⚡ 高效稳健编译**: 清理冗余配置，全面保障秒级打包和高可靠的热编译。

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
