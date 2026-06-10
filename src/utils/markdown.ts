/**
 * Fast and lightweight custom Markdown Parser
 */
export function parseMarkdown(md: string): string {
  if (!md) return '<p class="text-gray-400 italic">No content yet. Click Edit to start writing!</p>';

  // Escape HTML tags to prevent XSS
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code Blocks (```code```)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="bg-gray-900 text-gray-100 p-4 rounded-lg my-3 overflow-x-auto font-mono text-sm border border-gray-800">${code.trim()}</pre>`;
  });

  // Inline Code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-sm text-rose-600">$1</code>');

  // Headers (# H1 to ###### H6)
  html = html.replace(/^###### (.*?)\r?$/gm, '<h6 class="text-sm font-semibold text-slate-400 mt-4 mb-2">$1</h6>');
  html = html.replace(/^##### (.*?)\r?$/gm, '<h5 class="text-base font-semibold text-slate-300 mt-4 mb-2">$1</h5>');
  html = html.replace(/^#### (.*?)\r?$/gm, '<h4 class="text-lg font-semibold text-slate-200 mt-4 mb-2">$1</h4>');
  html = html.replace(/^### (.*?)\r?$/gm, '<h3 class="text-xl font-semibold text-slate-100 mt-4 mb-2 border-b border-slate-800 pb-1">$1</h3>');
  html = html.replace(/^## (.*?)\r?$/gm, '<h2 class="text-2xl font-bold text-slate-50 mt-5 mb-3 border-b border-slate-800 pb-1">$1</h2>');
  html = html.replace(/^# (.*?)\r?$/gm, '<h1 class="text-3xl font-extrabold text-white mt-6 mb-4">$1</h1>');

  // Blockquotes (> text)
  html = html.replace(/^> (.*?)\r?$/gm, '<blockquote class="border-l-4 border-indigo-500 pl-4 py-1 my-3 bg-indigo-950/40 text-slate-300 italic">$1</blockquote>');

  // Todo Lists (- [ ] or - [x])
  html = html.replace(/^\s*[-*]\s+\[ \]\s+(.*?)\r?$/gm, '<li class="ml-6 list-none text-slate-300 my-1 flex items-start gap-2"><input type="checkbox" class="todo-checkbox mt-1.5 cursor-pointer accent-indigo-500 rounded border-slate-700 bg-slate-800" /> <span>$1</span></li>');
  html = html.replace(/^\s*[-*]\s+\[[xX]\]\s+(.*?)\r?$/gm, '<li class="ml-6 list-none text-slate-500 line-through my-1 flex items-start gap-2"><input type="checkbox" checked class="todo-checkbox mt-1.5 cursor-pointer accent-indigo-500 rounded border-slate-700 bg-slate-800" /> <span>$1</span></li>');

  // Bullet Lists (- or * item)
  html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li class="ml-6 list-disc text-slate-300 my-1">$1</li>');

  // Bold (**text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-100">$1</strong>');

  // Italic (*text*)
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-300">$1</em>');

  // Hashtags (#tag_name) -> highlights beautifully
  html = html.replace(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g, '$1<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-900/40 text-indigo-300 border border-indigo-500/30 cursor-pointer hover:bg-indigo-900/60 transition-colors">#$2</span>');

  // Horizontal Rule (---)
  html = html.replace(/^---$/gm, '<hr class="my-6 border-t border-gray-200" />');

  // Paragraphs (split by double newlines)
  const lines = html.split('\n');
  let paragraphBuffer: string[] = [];
  const processedLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();
    // If it is a block element (H, li, blockquote, pre, hr), commit previous paragraph
    const isBlock = trimmed.startsWith('<h') || 
                    trimmed.startsWith('<li') || 
                    trimmed.startsWith('<span') || 
                    trimmed.startsWith('<block') || 
                    trimmed.startsWith('<pre') || 
                    trimmed.startsWith('<hr') || 
                    trimmed.startsWith('&lt;pre'); // fallback for raw pre

    if (isBlock) {
      if (paragraphBuffer.length > 0) {
        processedLines.push(`<p class="leading-relaxed text-gray-700 my-3">${paragraphBuffer.join('<br />')}</p>`);
        paragraphBuffer = [];
      }
      processedLines.push(line);
    } else if (trimmed === '') {
      if (paragraphBuffer.length > 0) {
        processedLines.push(`<p class="leading-relaxed text-gray-700 my-3">${paragraphBuffer.join('<br />')}</p>`);
        paragraphBuffer = [];
      }
    } else {
      paragraphBuffer.push(line);
    }
  }

  if (paragraphBuffer.length > 0) {
    processedLines.push(`<p class="leading-relaxed text-gray-700 my-3">${paragraphBuffer.join('<br />')}</p>`);
  }

  return processedLines.join('\n');
}

/**
 * Extracts unique hashtags (e.g. #personal, #rust) from a Markdown string
 */
export function extractTags(content: string): string[] {
  const matches = content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
  if (!matches) return [];
  const tags = matches.map(m => m.trim().substring(1)).filter(t => !t.endsWith('/') && t.length > 0);
  return Array.from(new Set(tags));
}
