export const universalExport = async (data: string, filename: string, mimeType: string = 'application/json') => {
  try {
    // 1. Modern API: showSaveFilePicker
    if ('showSaveFilePicker' in window) {
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

    // 2. Share API (Mobile bypass for PWA / Android Sandbox)
    const file = new File([data], filename, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'SovereignNote Export',
          text: '导出文件'
        });
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') console.warn('Share API failed:', err);
      }
    }

    // 3. Traditional Blob/URL Download
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);

  } catch (err) {
    // 4. Ultimate Clipboard Fallback 剪贴板强行脱壳防丢单机制
    console.warn('All file APIs failed, falling back to clipboard.', err);
    try {
      await navigator.clipboard.writeText(data);
      alert('⚠️ 设备拦截了文件下载。已将全部数据复制到剪贴板！请前往文件管理器新建文本文档并粘贴。');
    } catch (cbErr) {
      alert('导出彻底失败，剪贴板亦不可用。');
    }
  }
};
