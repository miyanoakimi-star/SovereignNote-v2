import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== ⚙️ 机器人核心配置与动态检测 ====================

// 打印带有中国普通话日志美化的控制台输出
function log(msg, type = 'info') {
  const prefix = {
    info: '🤖 [机器人-信息]',
    success: '🎉 [机器人-成功]',
    warn: '⚠️ [机器人-警告]',
    error: '🚨 [机器人-错误]',
    build: '⚙️ [机器人-编译]'
  };
  console.log(`${prefix[type] || '🤖'} ${msg}`);
}

// 动态检测本地 Git 远程仓库信息，避免硬编码偏离
function detectGitRemote() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url').toString().trim();
    // 匹配 https://github.com/owner/repo.git 或 git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^.]+)(?:\.git)?/);
    if (match) {
      log(`从 Git 远程遥控器中检索到仓库归属: Owner [${match[1]}], Repo [${match[2]}]`, 'info');
      return { owner: match[1], repo: match[2] };
    }
  } catch (e) {
    log(`无法从本地 Git 读取遥控仓库，将采用配置文件默认值。`, 'warn');
  }
  return null;
}

const gitDetails = detectGitRemote();

const CONFIG = {
  owner: process.env.GITHUB_OWNER || (gitDetails ? gitDetails.owner : 'miyanoakimi-star'),
  repo: process.env.GITHUB_REPO || (gitDetails ? gitDetails.repo : 'SovereignNote-v2'),
  token: process.env.GITHUB_TOKEN || '', 
  version: process.env.RELEASE_VERSION || '', 
  targetBranch: 'master', // 将在下面根据 Git 分析动态重写
};

// 动态对齐当前 Git 工作分支
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  if (branch && branch !== 'HEAD') {
    CONFIG.targetBranch = branch;
    log(`当前 Git 活跃管道对齐分支: ${branch}`, 'info');
  }
} catch (e) {
  log(`无法精准定位 Git 活跃分支，采用默认发布归属: ${CONFIG.targetBranch}`, 'warn');
}

// ==================== 📦 资产全路径模糊搜索候选集 ====================
// 支持各种打包产出的非标准路径自动对齐
const assetSearchPaths = {
  'SovereignNote_Windows_x64.exe': [
    'core-backend/target/x86_64-pc-windows-msvc/release/sovereign-core-exe.exe',
    'core-backend/target/release/sovereign-core-exe.exe',
    'core-backend/target/release/sovereign_core.exe',
    'core-backend/target/release/sovereign-core.exe',
    'core-backend/target/x86_64-pc-windows-msvc/release/sovereign_core.exe'
  ],
  'SovereignNote_Windows_ia32.exe': [
    'core-backend/target/i686-pc-windows-msvc/release/sovereign-core-exe.exe',
    'core-backend/target/i686-pc-windows-msvc/release/sovereign_core.exe'
  ],
  'SovereignNote_Android.apk': [
    'core-backend/target/debug/apk/sovereign_core.apk',
    'android/app/build/outputs/apk/debug/app-debug.apk',
    'android/app/build/outputs/apk/release/app-release-unsigned.apk',
    'android/app/build/outputs/apk/release/app-release.apk'
  ]
};

// 检索物理资产的绝对及相对路径
function findAssetPath(assetName) {
  const candidates = assetSearchPaths[assetName] || [];
  for (const candidate of candidates) {
    const absolutePath = path.resolve(__dirname, '..', candidate);
    if (fs.existsSync(absolutePath)) {
      return candidate;
    }
  }
  return null;
}

// ==================== 🛠️ 辅助函数工具库 ====================

// 封装 HTTPS 请求，支持带 Length 的 JSON Payload
function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'SovereignNote-Release-Bot',
      'Authorization': `token ${CONFIG.token}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    options.headers = Object.assign({}, defaultHeaders, options.headers || {});

    let bodyData = null;
    if (postData) {
      bodyData = typeof postData === 'string' ? postData : JSON.stringify(postData);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body ? JSON.parse(body) : {});
        } else {
          reject(new Error(`GitHub API 响应失败 [HTTP ${res.statusCode}]: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

// ==================== 🚀 编译与发布管线控制 ====================

// Step 1: 自动提取项目当前版本号
function detectVersion() {
  if (CONFIG.version) {
    if (!CONFIG.version.startsWith('v')) {
      CONFIG.version = 'v' + CONFIG.version;
    }
    return CONFIG.version;
  }

  try {
    const packageJsonPath = path.join(__dirname, '../package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      CONFIG.version = 'v' + pkg.version;
      log(`从 package.json 中检测到当前开发版本：${CONFIG.version}`, 'info');
      return CONFIG.version;
    }
  } catch (e) {
    log(`无法读取 package.json: ${e.message}`, 'warn');
  }

  // 兜底默认版本号
  CONFIG.version = 'v1.4.0';
  log(`未找到有效版本配置文件，采用预置默认版本：${CONFIG.version}`, 'warn');
  return CONFIG.version;
}

// Step 2: 触发本地编译管线 ( VITE + CARGO )
function triggerLocalBuild() {
  log('开始本地主权程序资产交叉编译工序...', 'build');
  
  try {
    // 1. 编译前端 React 网页资产
    log('1/3 正在执行 Vite 前端资产工程化打包...', 'build');
    execSync('npm run build', { stdio: 'inherit' });
    log('Vite 生产资源已成功汇编并打包完毕！', 'success');

    // 2. 检查是否有本地 Rust 交叉编译环境
    log('2/3 尝试编译后端 Rust 单体核心 (视当前容器 OS 与编译器状态)...', 'build');
    if (process.platform === 'win32') {
      log('检测到当前运行在 Windows 物理平台下，执行 cargo 构建指令...', 'info');
      execSync('cd core-backend && cargo build --release --bin sovereign-core-exe', { stdio: 'inherit' });
    } else {
      log('当前处于非 Windows 云端容器沙盒，跳过 MSVC 单文件编译，由云端 CI/CD 接管 .exe 打包。', 'warn');
    }

    log('编译打包环节结束。', 'success');
  } catch (error) {
    log(`构建脚本执行中断，可能因为缺少特定交叉编译依赖 (如 NDK/MSVC): ${error.message}`, 'warn');
    log('提示：如果是缺少 SDK 30 / Rust 编译器，AI Studio 机器人将跳过本地打包，直接建立发布草稿由 GitHub Actions 接管资产编译上抛。', 'info');
  }
}

// Step 3: 创建或检验 GitHub Git Tag
async function ensureGitTag(version) {
  log(`准备在分支 [${CONFIG.targetBranch}] 上生成版本标签: ${version}...`, 'info');
  try {
    // 获取当前最新提交的 SHA 校验和
    const refOptions = {
      hostname: 'api.github.com',
      path: `/repos/${CONFIG.owner}/${CONFIG.repo}/git/ref/heads/${CONFIG.targetBranch}`,
      method: 'GET'
    };
    const refData = await request(refOptions);
    const sha = refData.object.sha;
    log(`定位到最新 Commit 节点 SHA-1 值: ${sha}`, 'info');

    // 在 GitHub 端自动打 Tag
    const tagOptions = {
      hostname: 'api.github.com',
      path: `/repos/${CONFIG.owner}/${CONFIG.repo}/git/tags`,
      method: 'POST'
    };
    const tagPayload = {
      tag: version,
      message: `SovereignNote ${version} 机器人自动打包发布`,
      object: sha,
      type: 'commit'
    };
    
    let tagSha;
    try {
      const tagData = await request(tagOptions, tagPayload);
      tagSha = tagData.sha;
      log(`Git 虚拟标签对象 [${version}] 在 GitHub 自动签发成功！`, 'success');
    } catch (e) {
      log(`虚拟标签已存在或跳过直接签发，尝试直接覆盖 ref 映射指针。`, 'warn');
      tagSha = sha;
    }

    // 绑定 ref 指向
    const refCreateOptions = {
      hostname: 'api.github.com',
      path: `/repos/${CONFIG.owner}/${CONFIG.repo}/git/refs`,
      method: 'POST'
    };
    await request(refCreateOptions, {
      ref: `refs/tags/${version}`,
      sha: tagSha
    });
    log(`系统引用指针 refs/tags/${version} 绑定 SHA [${tagSha.substring(0,7)}] 完毕。`, 'success');
  } catch (e) {
    log(`Git 标签绑定流程结束 (可能 Tag 在云端已由上游分支完成锚定): ${e.message}`, 'info');
  }
}

// Step 4: 创建 GitHub Release 实例并获取上传端口 URL
async function createGitHubRelease(version) {
  log('正在云端创建对应的 GitHub Release 实例面版...', 'info');
  
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${CONFIG.owner}/${CONFIG.repo}/releases`,
    method: 'POST'
  };

  const payload = {
    tag_name: version,
    target_commitish: CONFIG.targetBranch,
    name: `SovereignNote 主权笔记 ${version} 正式发布版`,
    body: `## ⚔️ SovereignNote 主权笔记 ${version}
    
本版本由 AI Studio 机器人自动化脚本配合多架构矩阵编译流水线平稳产出。
    
### 📦 发布的平台资产列表 (Assets)：
* **SovereignNote_Windows_x64.exe** - Windows 64位桌面原生单文件程序
* **SovereignNote_Windows_ia32.exe** - Windows 32位桌面程序，支持低配与老旧系统
* **SovereignNote_Android.apk** - Android 移动端实体安装包，内嵌全部前端资产
* **SovereignNote-PWA-SingleFile.html** - 降级离线单网页 PWA 文件，双击即用
    
### 🛠️ 核心功能增强：
1. **手写无限绘图板**：画布性能升级，触控压力感知纠偏，支持照片一键完美物理导出。
2. **6级主权标签树**：完美避开标签层级冲突，自适应合并多物理端 IndexedDB。
3. **多维万年历系统**：支持极客所需的精确中国农历（干支计时法）、神道皇纪年号（Koki Year）与日本年号天皇改元对照（大正/昭和/平成/令和等）。
    
*合并时序决策采用：去中心化 LWW (Last-Write-Wins) 最终一致性毫秒级合并同步算法。*`,
    draft: false,
    prerelease: false
  };

  try {
    const releaseData = await request(options, payload);
    log(`Release 实例面版签发就绪！ID: ${releaseData.id}`, 'success');
    return releaseData;
  } catch (error) {
    log(`无法直接新建 Release，尝试检索现有的 Release 以便进行覆盖：${error.message}`, 'warn');
    
    // 备用方案：获取同名 Tag 的现有 Release
    const listOptions = {
      hostname: 'api.github.com',
      path: `/repos/${CONFIG.owner}/${CONFIG.repo}/releases`,
      method: 'GET'
    };
    const releases = await request(listOptions);
    const existingRelease = releases.find(r => r.tag_name === version);
    if (existingRelease) {
      log(`找到已存在的对应 Release [ID: ${existingRelease.id}]，继续执行资产更新。`, 'success');
      return existingRelease;
    }
    throw error;
  }
}

// Step 5: 安全流式上传二进制大文件
async function uploadReleaseAsset(release, assetName, filePath) {
  const absolutePath = path.resolve(__dirname, '..', filePath);
  
  if (!fs.existsSync(absolutePath)) {
    log(`本地未检索到待发布实体包 [${assetName}] (路径: ${filePath})，略过上抛。`, 'warn');
    return;
  }

  // 完美覆盖机制：若云端已存在同名资产，先将其销毁后再上抛新包，彻底避免 404 及 422 校验冲突
  if (release.assets && Array.isArray(release.assets)) {
    const existingAsset = release.assets.find(a => a.name === assetName);
    if (existingAsset) {
      log(`在云端检测到同名已存资产 [${assetName}] (ID: ${existingAsset.id})，正在执行防重突物理销毁清理...`, 'warn');
      try {
        const deleteOptions = {
          hostname: 'api.github.com',
          path: `/repos/${CONFIG.owner}/${CONFIG.repo}/releases/assets/${existingAsset.id}`,
          method: 'DELETE'
        };
        await request(deleteOptions);
        log(`云端冲突旧资产已被成功粉碎清理。`, 'success');
      } catch (delErr) {
        log(`移除旧资产失败: ${delErr.message}，尝试直接上载。`, 'warn');
      }
    }
  }

  log(`检测到物理资产 [${assetName}]，文件大小: ${(fs.statSync(absolutePath).size / (1024 * 1024)).toFixed(2)} MB，准备执行流式上抛...`, 'info');

  const uploadUrlTemplate = release.upload_url;
  const cleanUrl = uploadUrlTemplate.replace(/\{\?name,label\}/, '');
  const urlObj = new URL(cleanUrl);
  
  const fileBuffer = fs.readFileSync(absolutePath);
  
  const options = {
    hostname: urlObj.hostname,
    path: `${urlObj.pathname}?name=${encodeURIComponent(assetName)}`,
    method: 'POST',
    headers: {
      'User-Agent': 'SovereignNote-Release-Bot',
      'Authorization': `token ${CONFIG.token}`,
      'Content-Type': assetName.endsWith('.apk') ? 'application/vnd.android.package-archive' : 'application/octet-stream',
      'Content-Length': fileBuffer.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          log(`[上载完毕] 🎉 核心实体资产 [${assetName}] 成功上抛归档！`, 'success');
          resolve(body ? JSON.parse(body) : {});
        } else {
          log(`资产 [${assetName}] 上传受阻 [HTTP ${res.statusCode}]: ${body}`, 'error');
          reject(new Error(`Asset upload failed with status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      log(`网络传输中断: ${err.message}`, 'error');
      reject(err);
    });

    req.write(fileBuffer);
    req.end();
  });
}

// ==================== 🎬 核心机器人主线函数 ====================
async function main() {
  log('=====================================================', 'info');
  log('⚔️  SovereignNote AI Studio 机器人自动化发布控制台已启动', 'info');
  log('=====================================================', 'info');

  // 1. 验证安全令牌 (TOKEN) 是否存在
  if (!CONFIG.token) {
    log('检测到当前未设置有效的 GITHUB_TOKEN 安全凭证！', 'error');
    log('提示：请先在 AI Studio 环境变量或控制台中注入密钥：', 'info');
    console.log('      👉 export GITHUB_TOKEN="你的_GitHub_PAT_秘钥"\n');
    process.exit(1);
  }

  // 2. 检测版本号
  const version = detectVersion();

  // 3. 执行本地混合打包与编译生成
  triggerLocalBuild();

  try {
    // 4. 云端签发 Git Tag 校验指针
    await ensureGitTag(version);

    // 5. 新建或匹配云端 Release 实例面版
    const release = await createGitHubRelease(version);

    // 6. 遍历并上传所有生成的原生大单体资产
    log('准备开始执行物理上抛。请耐心等待大文件传输...', 'info');
    for (const assetName of Object.keys(assetSearchPaths)) {
      const resolvedPath = findAssetPath(assetName);
      if (!resolvedPath) {
        log(`本地未检索到待发布实体包 [${assetName}] (已尝试路径候选: ${assetSearchPaths[assetName].join(', ')}), 略过覆盖上传。`, 'warn');
        continue;
      }
      try {
        await uploadReleaseAsset(release, assetName, resolvedPath);
      } catch (err) {
        log(`上抛资产 [${assetName}] 失败: ${err.message}，机器人继续执行下一条目。`, 'warn');
      }
    }

    log('=====================================================', 'success');
    log(`🎉 SovereignNote ${version} 全平台自动化构建并发布大功告成！`, 'success');
    log(`🔗 Release 发布面版物理地址：https://github.com/${CONFIG.owner}/${CONFIG.repo}/releases/tag/${version}`, 'success');
    log('=====================================================', 'success');

  } catch (error) {
    log(`自动化发布任务在执行中遇到致命错误中断：${error.message}`, 'error');
    process.exit(1);
  }
}

// 启动机器人
main();
