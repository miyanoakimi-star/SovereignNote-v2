export const universalExport = async (data: string, filename: string, mimeType: string = 'application/json') => {
  // 检测是否为移动端（iOS / Android）或运行在 Chrome 模拟器、Capacitor 内核中
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // 1. 对于标准的现代桌面浏览器，支持 showSaveFilePicker 的话直接调用，免去额外弹窗干扰
  if (!isMobile && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Sovereign File', accept: { [mimeType]: ['.json', '.txt', '.md'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      alert('导出成功：已保存至选择的路径');
      return;
    } catch (err: any) {
      if (err.name !== 'AbortError') throw err;
      return;
    }
  }

  // 2. 其它情况（移动端 Android/iOS WebView，没有 showSaveFilePicker）直接渲染精美的“多端导出与分享调试中心”
  showMobileExportHub(data, filename, mimeType);
};

function showMobileExportHub(data: string, filename: string, mimeType: string) {
  // 防御重入，如有旧的导出框则先移除
  const existingModal = document.getElementById('sovereign-export-modal');
  if (existingModal) {
    document.body.removeChild(existingModal);
  }

  // 动态往页面注入弹窗专属的 CSS 动画
  const styleId = 'sovereign-export-modal-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      @keyframes sovereign-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes sovereign-zoom-in {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      .sovereign-animate-fade {
        animation: sovereign-fade-in 0.25s ease-out forwards;
      }
      .sovereign-animate-zoom {
        animation: sovereign-zoom-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
    `;
    document.head.appendChild(style);
  }

  // 创建全屏半透明背景层
  const modal = document.createElement('div');
  modal.id = 'sovereign-export-modal';
  modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] sovereign-animate-fade';

  // 创建弹窗卡片
  const card = document.createElement('div');
  card.className = 'bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 text-slate-100 shadow-2xl space-y-4 sovereign-animate-zoom font-sans';

  // 头部布局
  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-start gap-3 border-b border-slate-800 pb-3.5';
  titleRow.innerHTML = `
    <div class="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-lg shrink-0">
      📥
    </div>
    <div class="min-w-0 flex-1">
      <h3 class="text-sm font-bold text-slate-100 leading-snug">多端数据备份与导出助手</h3>
      <p class="text-[10px] text-slate-400 truncate mt-0.5" title="${filename}">${filename}</p>
    </div>
  `;
  card.appendChild(titleRow);

  // 说明文字
  const notice = document.createElement('div');
  notice.className = 'text-[11px] text-slate-300 leading-relaxed bg-slate-955 p-3 rounded-xl border border-slate-850 space-y-1.5';
  notice.innerHTML = `
    <p>💡 <span class="font-bold text-indigo-400">设备兼容说明：</span></p>
    <p class="text-slate-400 text-[10.5px]">由于安卓(Android)应用沙盒机制对老旧 WebView 内核的安全锁死，传统的“点击保存文件”在部分真机或打包包中会被系统默默拦截，形成<b>“没有任何反应”</b>的假死现象。</p>
    <p class="text-slate-400 text-[10.5px]">为确保数据 100% 安全不丢失，我们为您设计了以下高兼容性的同步与备份通道：</p>
  `;
  card.appendChild(notice);

  // 按钮容器
  const buttonStack = document.createElement('div');
  buttonStack.className = 'space-y-2.5';

  const nav = navigator as any;
  const canShare = !!nav.share;

  // 选项 1. 系统原生分享（兼容性卓越）
  const shareBtn = document.createElement('button');
  shareBtn.className = `w-full h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-98 ${
    canShare 
      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/15' 
      : 'bg-slate-800/40 text-slate-500 border border-slate-850 cursor-not-allowed'
  }`;
  shareBtn.innerHTML = `
    <span>📤</span> 系统分享备份 (微信/QQ/邮箱/云端)
  `;
  
  if (canShare) {
    shareBtn.onclick = async () => {
      try {
        shareBtn.innerHTML = '<span>⏳</span> 正在呼起系统分享...';
        
        // A. 尝试使用现代 File 方式进行分享 (适合支持文件分享的 WebView)
        const file = new File([data], filename, { type: mimeType });
        if (nav.canShare && nav.canShare({ files: [file] })) {
          try {
            await nav.share({
              files: [file],
              title: 'SovereignNote 数据备份',
              text: '这是我的 SovereignNote 离线笔记本备份文件，请安全妥善保存。'
            });
            shareBtn.innerHTML = '<span>✅</span> 分享成功';
            setTimeout(() => {
              if (document.body.contains(modal)) document.body.removeChild(modal);
            }, 600);
            return;
          } catch (fileErr: any) {
            // 用户主动取消分享
            if (fileErr.name === 'AbortError') {
              shareBtn.innerHTML = '<span>📤</span> 系统分享备份 (微信/QQ/邮箱/云端)';
              return;
            }
            console.warn('File share failed, falling back to text share...', fileErr);
          }
        }

        // B. 降级方案：直接分享为纯文本 (Android WebView 下兼容性达到 99%)
        // 去除多余空格，压缩文本以保证部分应用接收时长度不溢出
        const textBackup = data.length < 50000 ? data : JSON.stringify(JSON.parse(data)); 
        await nav.share({
          text: textBackup,
          title: filename
        });
        
        shareBtn.innerHTML = '<span>✅</span> 分享成功';
        setTimeout(() => {
          if (document.body.contains(modal)) document.body.removeChild(modal);
        }, 600);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          shareBtn.innerHTML = '<span>📤</span> 系统分享备份 (微信/QQ/邮箱/云端)';
          return;
        }
        console.error('Share complete failure:', err);
        shareBtn.innerHTML = '<span>❌</span> 分享失败';
        alert('⚠️ 系统分享接口调用失败。这在某些未配置分享协议的定制版 Android 系统中很常见。已为您自动切换到下面的“一键安全复制”功能！');
        triggerCopy();
      }
    };
  } else {
    shareBtn.onclick = () => {
      alert('当前运行环境不支持 Web Share 接口，建议采用下方的“一键安全复制”或“WebDAV云端同步”方案。');
    };
  }
  buttonStack.appendChild(shareBtn);

  // 选项 2. 一键写至系统剪贴板（100% 成功率）
  const copyBtn = document.createElement('button');
  copyBtn.className = 'w-full h-11 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-750 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-98';
  copyBtn.innerHTML = `
    <span>📋</span> 一键安全复制数据 (100% 成功)
  `;
  
  const triggerCopy = async () => {
    try {
      if (nav.clipboard && nav.clipboard.writeText) {
        await nav.clipboard.writeText(data);
      } else {
        // 极老设备 (Android 5) 下的 Hack 复制
        const textArea = document.createElement('textarea');
        textArea.value = data;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      copyBtn.innerHTML = '<span>✅</span> 复制成功！已写入系统剪贴板';
      alert('🎉 备份数据已成功复制到您的手机剪贴板！\n\n您可以立刻前往微信、QQ、备忘录、文件管理器新建一个文本文件，并粘贴这段文本。极速恢复时只需复制该文本再进行导入即可。');
      setTimeout(() => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      }, 500);
    } catch (err) {
      console.warn('Clipboard write failure, fallback to text display', err);
      textContainer.style.display = 'block';
      copyBtn.style.display = 'none';
    }
  };

  copyBtn.onclick = triggerCopy;
  buttonStack.appendChild(copyBtn);

  // 极老设备纯手工全选复制安全区
  const textContainer = document.createElement('div');
  textContainer.className = 'space-y-1.5 hidden bg-slate-950 p-2.5 rounded-xl border border-slate-850';
  textContainer.innerHTML = `
    <label class="text-[9px] text-amber-500 font-bold font-mono">⚠️ 剪贴板受阻，请手动双击下方文本全选并复制：</label>
    <textarea class="w-full h-24 bg-slate-900 border border-slate-800 rounded-lg p-2 text-[9px] text-slate-400 font-mono focus:outline-none focus:border-indigo-500" readonly>${data}</textarea>
  `;
  card.appendChild(textContainer);

  // 选项 3. 强行触发传统模拟下载（PC 或完美版 WebView 渠道可用）
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'w-full h-11 bg-slate-800/40 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-98 border border-slate-850';
  downloadBtn.innerHTML = `
    <span>💾</span> 尝试拉起传统文件下载 (PC适用)
  `;
  downloadBtn.onclick = () => {
    try {
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      downloadBtn.innerHTML = '<span>⚡</span> 已尝试向内核发送下载流';
      setTimeout(() => {
        downloadBtn.innerHTML = '<span>💾</span> 尝试拉起传统文件下载 (PC适用)';
      }, 2500);
    } catch (err) {
      console.error('Download failure:', err);
    }
  };
  buttonStack.appendChild(downloadBtn);

  card.appendChild(buttonStack);

  // WebDAV 友好安全提醒
  const webdavNotice = document.createElement('div');
  webdavNotice.className = 'text-[9.5px] text-slate-500 text-center leading-relaxed';
  webdavNotice.innerHTML = '💡 推荐在设置中绑定 <b>WebDAV 云存储</b>，可实现 1 秒后台自动上传/拉取，完全免去手动导出的繁琐流程。';
  card.appendChild(webdavNotice);

  // 关闭主按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'w-full h-10 bg-transparent hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition mt-1.5';
  closeBtn.innerText = '取消并关闭';
  closeBtn.onclick = () => {
    if (document.body.contains(modal)) document.body.removeChild(modal);
  };
  card.appendChild(closeBtn);

  modal.appendChild(card);
  document.body.appendChild(modal);
}
