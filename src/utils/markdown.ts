/**
 * Fast and lightweight custom Markdown Parser
 */
export function parseMarkdown(md: string): string {
  if (!md) {
    return '<p class="sn-md-p italic opacity-70">暂无内容，点击编辑开始书写。</p>';
  }

  // Escape HTML tags to prevent XSS
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code Blocks (```code```)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="sn-md-pre">${code.trim()}</pre>`;
  });

  // Inline Code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="sn-md-code">$1</code>');

  // Headers (# H1 to ###### H6)
  html = html.replace(/^###### (.*?)\r?$/gm, '<h6 class="sn-md-h6 text-xs">$1</h6>');
  html = html.replace(/^##### (.*?)\r?$/gm, '<h5 class="sn-md-h5 text-sm">$1</h5>');
  html = html.replace(/^#### (.*?)\r?$/gm, '<h4 class="sn-md-h4 text-base">$1</h4>');
  html = html.replace(/^### (.*?)\r?$/gm, '<h3 class="sn-md-h3">$1</h3>');
  html = html.replace(/^## (.*?)\r?$/gm, '<h2 class="sn-md-h2">$1</h2>');
  html = html.replace(/^# (.*?)\r?$/gm, '<h1 class="sn-md-h1">$1</h1>');

  // Blockquotes (> text)
  html = html.replace(/^&gt; (.*?)\r?$/gm, '<blockquote class="sn-md-quote">$1</blockquote>');

  // Todo Lists (- [ ] or - [x])
  html = html.replace(
    /^\s*[-*]\s+\[ \]\s+(.*?)\r?$/gm,
    '<li class="sn-md-li ml-2 list-none flex items-start gap-2"><input type="checkbox" class="todo-checkbox mt-1 cursor-pointer accent-indigo-500 rounded" /> <span>$1</span></li>'
  );
  html = html.replace(
    /^\s*[-*]\s+\[[xX]\]\s+(.*?)\r?$/gm,
    '<li class="sn-md-li ml-2 list-none line-through opacity-60 flex items-start gap-2"><input type="checkbox" checked class="todo-checkbox mt-1 cursor-pointer accent-indigo-500 rounded" /> <span>$1</span></li>'
  );

  // Bullet Lists (- or * item)
  html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li class="sn-md-li list-disc">$1</li>');

  // Bold (**text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="sn-md-strong">$1</strong>');

  // Italic (*text*)
  html = html.replace(/\*([^*]+)\*/g, '<em class="sn-md-em">$1</em>');

  // Hashtags (#tag_name) -> clean unboxed inline typography
  html = html.replace(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g, '$1<span class="sn-md-tag">#$2</span>');

  // Horizontal Rule (---)
  html = html.replace(/^---$/gm, '<hr class="sn-md-hr" />');

  const lines = html.split('\n');
  let paragraphBuffer: string[] = [];
  const processedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isBlock =
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('<hr');

    if (isBlock) {
      if (paragraphBuffer.length > 0) {
        processedLines.push(`<p class="sn-md-p">${paragraphBuffer.join('<br />')}</p>`);
        paragraphBuffer = [];
      }
      processedLines.push(line);
    } else if (trimmed === '') {
      if (paragraphBuffer.length > 0) {
        processedLines.push(`<p class="sn-md-p">${paragraphBuffer.join('<br />')}</p>`);
        paragraphBuffer = [];
      }
    } else {
      paragraphBuffer.push(line);
    }
  }

  if (paragraphBuffer.length > 0) {
    processedLines.push(`<p class="sn-md-p">${paragraphBuffer.join('<br />')}</p>`);
  }

  return processedLines.join('\n');
}

/**
 * Extracts unique hashtags (e.g. #personal, #rust) from a Markdown string
 */
export function extractTags(content: string): string[] {
  const matches = content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
  if (!matches) return [];
  const tags = matches.map((m) => m.trim().substring(1)).filter((t) => !t.endsWith('/') && t.length > 0);
  return Array.from(new Set(tags));
}
