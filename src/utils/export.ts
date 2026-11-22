import { emitToast } from '../components/UiFeedback';

export const universalExport = async (data: string, filename: string, mimeType: string = 'application/json') => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!isMobile && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Sovereign File', accept: { [mimeType]: ['.json', '.txt', '.md'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      emitToast('success', '导出成功：已保存至选择的路径');
      return;
    } catch (err: any) {
      if (err.name !== 'AbortError') throw err;
      return;
    }
  }

  showMobileExportHub(data, filename, mimeType);
};

function showMobileExportHub(data: string, filename: string, mimeType: string) {
  const existingModal = document.getElementById('sovereign-export-modal');
  if (existingModal) {
    document.body.removeChild(existingModal);
  }

  const modal = document.createElement('div');
  modal.id = 'sovereign-export-modal';
  modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]';

  const card = document.createElement('div');
  card.className = 'sn-panel border sn-border rounded-2xl max-w-sm w-full p-6 sn-text shadow-2xl space-y-4 font-sans';

  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-start gap-3 border-b sn-border pb-3.5';

  const iconBadge = document.createElement('div');
  iconBadge.className = 'w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-sm font-bold shrink-0';
  iconBadge.textContent = '导出';

  const titleMeta = document.createElement('div');
  titleMeta.className = 'min-w-0 flex-1';

  const titleEl = document.createElement('h3');
  titleEl.className = 'text-sm font-bold sn-text leading-snug';
  titleEl.textContent = '多端数据备份与导出助手';

  const fileEl = document.createElement('p');
  fileEl.className = 'text-[10px] sn-muted truncate mt-0.5';
  fileEl.title = filename;
  fileEl.textContent = filename;

  titleMeta.appendChild(titleEl);
  titleMeta.appendChild(fileEl);
  titleRow.appendChild(iconBadge);
  titleRow.appendChild(titleMeta);
  card.appendChild(titleRow);

  const notice = document.createElement('div');
  notice.className = 'text-[11px] sn-text-secondary leading-relaxed sn-surface p-3 rounded-xl border sn-border space-y-1.5';
  notice.innerHTML = `
    <p><span class="font-bold text-indigo-400">设备兼容说明：</span></p>
    <p class="sn-muted text-[10.5px]">部分移动端沙盒环境会限制浏览器直接写入本地文件系统。以下通道可确保备份数据完整保存：</p>
  `;
  card.appendChild(notice);

  const buttonStack = document.createElement('div');
  buttonStack.className = 'space-y-2.5';

  const nav = navigator as any;
  const canShare = !!nav.share;

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = `w-full h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 ${
    canShare
      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/15'
      : 'sn-surface sn-muted border sn-border cursor-not-allowed'
  }`;
  shareBtn.textContent = '系统分享备份 (支持文件/文本)';

  const textContainer = document.createElement('div');
  textContainer.className = 'space-y-1.5 hidden sn-surface p-2.5 rounded-xl border sn-border';

  const textLabel = document.createElement('label');
  textLabel.className = 'text-[10px] text-amber-500 font-bold font-mono block';
  textLabel.textContent = '剪贴板受阻，请手动全选下方文本复制：';

  const manualArea = document.createElement('textarea');
  manualArea.className = 'w-full h-24 sn-input border sn-border rounded-lg p-2 text-[10px] sn-text font-mono focus:outline-none focus:border-indigo-500';
  manualArea.readOnly = true;
  manualArea.value = data;

  textContainer.appendChild(textLabel);
  textContainer.appendChild(manualArea);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'w-full h-11 sn-elevated hover:opacity-90 sn-text border sn-border-strong rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95';
  copyBtn.textContent = '一键复制备份数据到剪贴板';

  const triggerCopy = async () => {
    try {
      if (nav.clipboard && nav.clipboard.writeText) {
        await nav.clipboard.writeText(data);
      } else {
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

      copyBtn.textContent = '复制成功！已写入系统剪贴板';
      emitToast('success', '备份数据已复制到剪贴板，可粘贴保存为文本文件');
      setTimeout(() => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      }, 500);
    } catch (err) {
      console.warn('Clipboard write failure, fallback to text display', err);
      textContainer.style.display = 'block';
      copyBtn.style.display = 'none';
    }
  };

  if (canShare) {
    shareBtn.onclick = async () => {
      try {
        shareBtn.textContent = '正在呼起系统分享...';

        const file = new File([data], filename, { type: mimeType });
        if (nav.canShare && nav.canShare({ files: [file] })) {
          try {
            await nav.share({
              files: [file],
              title: 'SovereignNote 数据备份',
              text: '这是我的 SovereignNote 离线笔记本备份文件，请安全妥善保存。',
            });
            shareBtn.textContent = '分享成功';
            setTimeout(() => {
              if (document.body.contains(modal)) document.body.removeChild(modal);
            }, 600);
            return;
          } catch (fileErr: any) {
            if (fileErr.name === 'AbortError') {
              shareBtn.textContent = '系统分享备份 (支持文件/文本)';
              return;
            }
          }
        }

        const textBackup = data.length < 50000 ? data : JSON.stringify(JSON.parse(data));
        await nav.share({
          text: textBackup,
          title: filename,
        });

        shareBtn.textContent = '分享成功';
        setTimeout(() => {
          if (document.body.contains(modal)) document.body.removeChild(modal);
        }, 600);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          shareBtn.textContent = '系统分享备份 (支持文件/文本)';
          return;
        }
        shareBtn.textContent = '分享不可用，已切换复制';
        emitToast('info', '系统分享未完成，已自动切换至剪贴板复制');
        triggerCopy();
      }
    };
  } else {
    shareBtn.onclick = () => {
      emitToast('info', '当前环境不支持系统分享，请使用下方剪贴板复制或下载');
    };
  }

  copyBtn.onclick = triggerCopy;

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'w-full h-11 sn-surface hover:opacity-90 sn-text-secondary rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-95 border sn-border';
  downloadBtn.textContent = '触发标准文件下载 (PC 适用)';
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

      downloadBtn.textContent = '已触发浏览器下载流';
      setTimeout(() => {
        downloadBtn.textContent = '触发标准文件下载 (PC 适用)';
      }, 2500);
    } catch (err) {
      console.error('Download failure:', err);
      emitToast('error', '触发文件下载失败，请改用复制备份');
    }
  };

  buttonStack.appendChild(shareBtn);
  buttonStack.appendChild(copyBtn);
  buttonStack.appendChild(downloadBtn);
  card.appendChild(buttonStack);
  card.appendChild(textContainer);

  const webdavNotice = document.createElement('div');
  webdavNotice.className = 'text-[10px] sn-muted text-center leading-relaxed';
  webdavNotice.textContent = '提示：在设置中配置 WebDAV 或 FTP 中继，可自动完成多端备份。';
  card.appendChild(webdavNotice);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'w-full h-10 bg-transparent hover:opacity-80 sn-muted hover:sn-text rounded-xl text-xs font-bold transition mt-1';
  closeBtn.textContent = '关闭';
  closeBtn.onclick = () => {
    if (document.body.contains(modal)) document.body.removeChild(modal);
  };
  card.appendChild(closeBtn);

  modal.appendChild(card);
  document.body.appendChild(modal);
}
