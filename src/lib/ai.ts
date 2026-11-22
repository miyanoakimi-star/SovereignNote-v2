import { Capacitor } from '@capacitor/core';
import {
  AiChatMessage,
  AiExtractedSuggestions,
  AiModelPreset,
  MindmapNode,
  Note,
} from '../types';
import { safeStorage } from '../utils/safeStorage';

const PRESETS_STORAGE_KEY = 'sovereign_ai_presets';
const ACTIVE_PRESET_KEY = 'sovereign_ai_active_preset_id';

export const DEFAULT_AI_PRESETS: AiModelPreset[] = [
  {
    id: 'server-gemini-default',
    name: '内置 Gemini (Gemini 4 Hydrogen)',
    protocol: 'server-gemini',
    baseUrl: '',
    apiKey: '',
    model: 'gemini-4-hydrogen',
    systemPrompt:
      '你是 SovereignNote 的知识管理与写作助手，擅长中文润色、续写、摘要、思维导图结构提炼与日程提取。回答保持准确、克制、结构清晰。',
    directBrowser: false,
  },
  {
    id: 'openai-custom-template',
    name: '自定义 OpenAI 兼容接口',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    systemPrompt:
      '你是 SovereignNote 的知识管理与写作助手，擅长中文润色、续写、摘要、思维导图结构提炼与日程提取。',
    directBrowser: false,
  },
  {
    id: 'local-ollama-template',
    name: '本地 Ollama (浏览器直连)',
    protocol: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    model: 'qwen2.5:7b',
    systemPrompt:
      '你是 SovereignNote 的本地离线知识助手，请用简洁准确的中文回答。',
    directBrowser: true,
  },
];

export function loadAiPresets(): AiModelPreset[] {
  try {
    const raw = safeStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_PRESETS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore storage parse failure
  }
  return DEFAULT_AI_PRESETS;
}

export function saveAiPresets(presets: AiModelPreset[]): void {
  safeStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

export function loadActivePresetId(presets: AiModelPreset[]): string {
  const saved = safeStorage.getItem(ACTIVE_PRESET_KEY);
  if (saved && presets.some((p) => p.id === saved)) {
    return saved;
  }
  return presets[0]?.id || 'server-gemini-default';
}

export function saveActivePresetId(id: string): void {
  safeStorage.setItem(ACTIVE_PRESET_KEY, id);
}

function isLocalHostname(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      h.startsWith('192.168.') ||
      h.startsWith('10.') ||
      h.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function buildOpenAiEndpoint(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

async function callDirectBrowser(
  preset: AiModelPreset,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  jsonMode = false
): Promise<string> {
  if (preset.protocol === 'server-gemini') {
    throw new Error('内置 Gemini 引擎需通过 Web 服务端运行，请切换至自定义 API 预设。');
  }

  if (preset.protocol === 'openai') {
    const endpoint = buildOpenAiEndpoint(preset.baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (preset.apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${preset.apiKey.trim()}`;
    }
    const body: Record<string, unknown> = {
      model: preset.model,
      messages,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('接口未返回文本内容');
    return content;
  }

  const cleanBase = (preset.baseUrl || 'https://generativelanguage.googleapis.com')
    .trim()
    .replace(/\/+$/, '');
  const endpoint = cleanBase.includes(':generateContent')
    ? cleanBase
    : `${cleanBase}/v1beta/models/${encodeURIComponent(preset.model)}:generateContent`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (preset.apiKey?.trim()) {
    headers['x-goog-api-key'] = preset.apiKey.trim();
  }
  const systemMsg = messages.find((m) => m.role === 'system')?.content;
  const userTranscript = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  const payload: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: userTranscript }] }],
  };
  if (systemMsg) {
    payload.systemInstruction = { parts: [{ text: systemMsg }] };
  }
  if (jsonMode) {
    payload.generationConfig = { responseMimeType: 'application/json' };
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  const reply = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  if (!reply) throw new Error('接口未返回有效内容');
  return reply;
}

function shouldUseDirectBrowser(preset: AiModelPreset): boolean {
  if (preset.protocol === 'server-gemini') return false;
  if (Capacitor.isNativePlatform()) return true;
  if (preset.directBrowser) return true;
  return Boolean(preset.baseUrl && isLocalHostname(preset.baseUrl));
}

export async function fetchServerAiStatus(): Promise<{
  serverGeminiAvailable: boolean;
  defaultModel: string;
}> {
  try {
    const res = await fetch('/api/ai/status');
    if (!res.ok) return { serverGeminiAvailable: false, defaultModel: 'gemini-4-hydrogen' };
    return await res.json();
  } catch {
    return { serverGeminiAvailable: false, defaultModel: 'gemini-4-hydrogen' };
  }
}

export async function sendAiChat(params: {
  preset: AiModelPreset;
  messages: AiChatMessage[];
  activeNote?: Note | null;
  allNotes?: Note[];
  includeActiveNote?: boolean;
  includeWorkspaceSearch?: boolean;
}): Promise<string> {
  const { preset, messages, activeNote, allNotes = [], includeActiveNote, includeWorkspaceSearch } = params;

  const contextParts: string[] = [];
  if (preset.systemPrompt?.trim()) {
    contextParts.push(preset.systemPrompt.trim());
  }
  if (includeActiveNote && activeNote) {
    contextParts.push(
      `【当前正在编辑的笔记】\n标题: ${activeNote.title || '无标题'}\n内容:\n${(activeNote.content || '').slice(0, 6000)}`
    );
  }
  if (includeWorkspaceSearch && allNotes.length > 0) {
    const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const keywords = lastUserText
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length >= 2);
    const scored = allNotes
      .filter((n) => !n.deleted && n.id !== activeNote?.id)
      .map((n) => {
        const hay = `${n.title} ${n.content}`.toLowerCase();
        const hits = keywords.reduce((acc, k) => (hay.includes(k) ? acc + 1 : acc), 0);
        return { note: n, hits };
      })
      .sort((a, b) => b.hits - a.hits || b.note.updated_at - a.note.updated_at)
      .slice(0, 4);

    if (scored.length > 0) {
      const snippets = scored
        .map(
          ({ note }) =>
            `- 标题《${note.title || '无标题'}》: ${(note.content || '').replace(/\s+/g, ' ').slice(0, 400)}`
        )
        .join('\n');
      contextParts.push(`【相关知识库参考片段】\n${snippets}`);
    }
  }

  const systemInstruction = contextParts.join('\n\n');
  const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  if (shouldUseDirectBrowser(preset)) {
    const directMessages = systemInstruction
      ? [{ role: 'system' as const, content: systemInstruction }, ...apiMessages]
      : apiMessages;
    return await callDirectBrowser(preset, directMessages, false);
  }

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset,
      messages: apiMessages,
      systemInstruction,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `请求失败 (${res.status})`);
  }
  return data.text || '';
}

export type EditorAiAction = 'polish' | 'continue' | 'summarize' | 'fix' | 'translate';

export async function runEditorAiAction(params: {
  preset: AiModelPreset;
  action: EditorAiAction;
  text: string;
  noteTitle: string;
}): Promise<string> {
  const { preset, action, text, noteTitle } = params;
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('请先输入或选中需要处理的笔记内容');
  }

  const instructionMap: Record<EditorAiAction, string> = {
    polish:
      '请润色以下笔记内容，使其表达更流畅、结构更清晰、保持原意和 Markdown 格式，直接输出润色后的内容，不要附加多余解释。',
    continue:
      '请基于以下笔记标题与已有内容自然续写后续段落，保持相同的写作风格、语言与 Markdown 格式，直接输出续写部分，不要重复原文。',
    summarize:
      '请为以下笔记提炼结构化核心摘要（包含关键要点列表，使用简洁 Markdown），直接输出摘要内容。',
    fix:
      '请检查并修正以下文本中的错别字、语法语病、标点与 Markdown 格式错误，直接输出修正后的文本。',
    translate:
      '如果文本主要为中文请翻译为地道自然的英文，如果主要为英文或其他语言请翻译为地道自然的中文，保持 Markdown 格式并直接输出译文。',
  };

  const prompt = `笔记标题：${noteTitle || '无标题'}\n\n待处理内容：\n${trimmed.slice(0, 8000)}`;

  return await sendAiChat({
    preset: { ...preset, systemPrompt: instructionMap[action] },
    messages: [
      {
        id: 'action-1',
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      },
    ],
  });
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

async function requestStructuredJson(params: {
  preset: AiModelPreset;
  task: 'mindmap' | 'extract';
  prompt: string;
  systemInstruction: string;
}): Promise<any> {
  const { preset, task, prompt, systemInstruction } = params;

  let rawText = '';
  if (shouldUseDirectBrowser(preset)) {
    rawText = await callDirectBrowser(
      preset,
      [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      true
    );
  } else {
    const res = await fetch('/api/ai/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset, task, prompt, systemInstruction }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `结构化生成失败 (${res.status})`);
    }
    rawText = data.text || '{}';
  }

  try {
    return JSON.parse(stripJsonFence(rawText));
  } catch {
    throw new Error('模型返回的 JSON 格式解析失败，请重试或切换支持 JSON 输出的模型');
  }
}

export async function generateMindmapFromNote(params: {
  preset: AiModelPreset;
  title: string;
  content: string;
}): Promise<MindmapNode[]> {
  const { preset, title, content } = params;
  if (!title.trim() && !content.trim()) {
    throw new Error('当前笔记为空，无法生成思维导图');
  }

  const systemInstruction =
    '你是一个思维导图架构师。请严格输出纯 JSON 对象，不要包含任何解释文字。结构为：{"rootLabel":"中心主题","branches":[{"label":"一级分支","children":[{"label":"二级节点","children":["三级要点"]}]}]}。最多 6 个一级分支，每个分支 2-4 个子节点，节点文字简明扼要（2-14 字）。';

  const prompt = `请将以下笔记内容梳理成结构化的思维导图 JSON：\n\n标题：${title || '未命名笔记'}\n正文：\n${(content || '').slice(0, 7000)}`;

  const parsed = await requestStructuredJson({
    preset,
    task: 'mindmap',
    prompt,
    systemInstruction,
  });

  const centerX = 460;
  const centerY = 300;
  const nodes: MindmapNode[] = [
    {
      id: 'root',
      label: String(parsed?.rootLabel || title || '中心主题').slice(0, 40),
      parentId: null,
      x: centerX,
      y: centerY,
    },
  ];

  const branches = Array.isArray(parsed?.branches) ? parsed.branches.slice(0, 8) : [];
  const leftBranches: any[] = [];
  const rightBranches: any[] = [];
  branches.forEach((b: any, idx: number) => {
    if (idx % 2 === 0) rightBranches.push(b);
    else leftBranches.push(b);
  });

  const placeSide = (sideBranches: any[], direction: 'left' | 'right') => {
    const dirSign = direction === 'right' ? 1 : -1;
    const total = sideBranches.length;
    const verticalSpacing = 120;
    const startY = centerY - ((total - 1) * verticalSpacing) / 2;

    sideBranches.forEach((branch, bIdx) => {
      const branchId = `b_${direction}_${bIdx}_${Math.random().toString(36).slice(2, 6)}`;
      const branchX = centerX + dirSign * 220;
      const branchY = startY + bIdx * verticalSpacing;
      nodes.push({
        id: branchId,
        label: String(branch?.label || `分支 ${bIdx + 1}`).slice(0, 32),
        parentId: 'root',
        direction,
        x: branchX,
        y: branchY,
      });

      const children = Array.isArray(branch?.children) ? branch.children.slice(0, 5) : [];
      const childStartY = branchY - ((children.length - 1) * 46) / 2;
      children.forEach((child: any, cIdx: number) => {
        const childLabel = typeof child === 'string' ? child : child?.label || `要点 ${cIdx + 1}`;
        const childId = `c_${branchId}_${cIdx}`;
        const childX = branchX + dirSign * 200;
        const childY = childStartY + cIdx * 46;
        nodes.push({
          id: childId,
          label: String(childLabel).slice(0, 32),
          parentId: branchId,
          direction,
          x: childX,
          y: childY,
        });

        const subChildren = typeof child === 'object' && Array.isArray(child?.children) ? child.children.slice(0, 3) : [];
        const subStartY = childY - ((subChildren.length - 1) * 34) / 2;
        subChildren.forEach((sub: any, sIdx: number) => {
          const subLabel = typeof sub === 'string' ? sub : sub?.label || String(sub || '');
          if (!subLabel.trim()) return;
          nodes.push({
            id: `s_${childId}_${sIdx}`,
            label: subLabel.trim().slice(0, 28),
            parentId: childId,
            direction,
            x: childX + dirSign * 180,
            y: subStartY + sIdx * 34,
          });
        });
      });
    });
  };

  placeSide(rightBranches, 'right');
  placeSide(leftBranches, 'left');

  return nodes;
}

export async function extractTagsAndEventsFromNote(params: {
  preset: AiModelPreset;
  title: string;
  content: string;
  todayDate: string;
}): Promise<AiExtractedSuggestions> {
  const { preset, title, content, todayDate } = params;
  if (!title.trim() && !content.trim()) {
    throw new Error('当前笔记为空，无法提取标签与日程');
  }

  const systemInstruction =
    '你是知识整理与日程分析专家。请从笔记中提取：1) 最多 5 个层级标签（用 / 分隔，例如 "工作/项目" 或 "个人/阅读"，不要带 # 前缀）；2) 最多 5 条具体待办或日程事件（含 YYYY-MM-DD 日期，相对日期如“明天/下周”请结合给定今天日期换算）。严格输出 JSON：{"tags":["..."],"events":[{"title":"...","date":"YYYY-MM-DD","reason":"提取依据"}]}。';

  const prompt = `今天日期：${todayDate}\n笔记标题：${title || '无标题'}\n笔记正文：\n${(content || '').slice(0, 7000)}`;

  const parsed = await requestStructuredJson({
    preset,
    task: 'extract',
    prompt,
    systemInstruction,
  });

  const tags: string[] = Array.isArray(parsed?.tags)
    ? Array.from(
        new Set(
          parsed.tags
            .map((t: any) => String(t || '').trim().replace(/^#+/, '').replace(/\/+$/, ''))
            .filter(Boolean)
        )
      )
    : [];

  const events = Array.isArray(parsed?.events)
    ? parsed.events
        .map((e: any) => ({
          title: String(e?.title || '').trim(),
          date: String(e?.date || '').trim(),
          reason: e?.reason ? String(e.reason).trim() : undefined,
        }))
        .filter((e: { title: string; date: string }) => e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    : [];

  return { tags, events };
}

export async function testAiPresetConnection(preset: AiModelPreset): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const reply = await sendAiChat({
      preset: { ...preset, systemPrompt: 'You are a health check responder.' },
      messages: [
        {
          id: 'ping',
          role: 'user',
          content: 'Reply with OK only.',
          timestamp: Date.now(),
        },
      ],
    });
    return {
      ok: true,
      message: `连通成功：${reply.trim().slice(0, 40) || 'OK'}`,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || '连接测试失败',
      latencyMs: Date.now() - start,
    };
  }
}
