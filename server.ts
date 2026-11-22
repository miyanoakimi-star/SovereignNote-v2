import express, { Request, Response } from 'express';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const PROHIBITED_GEMINI_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true;
    if (norm.startsWith('fe80')) return true;
    if (norm.startsWith('::ffff:')) {
      return isPrivateIp(norm.slice(7));
    }
    return false;
  }
  return true;
}

async function validateExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('无效的 API 地址格式，请提供完整的 http(s):// URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('仅支持 http 或 https 协议的外部接口地址');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('本地地址请开启预设中的「浏览器直连本地模型」选项，服务端代理不转发内网地址');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('内网或保留 IP 地址请使用浏览器直连模式');
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length || records.some((r) => isPrivateIp(r.address))) {
      throw new Error('目标域名解析到非公网地址，请改用公网接口或浏览器直连模式');
    }
  } catch (err: any) {
    if (err?.message?.includes('非公网地址')) throw err;
    throw new Error(`无法解析目标主机域名: ${hostname}`);
  }

  return parsed;
}

function getServerGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('未检测到服务端 GEMINI_API_KEY，请在 Settings > Secrets 配置或切换至自定义 API 预设');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeGeminiModel(model?: string): string {
  const trimmed = (model || '').trim();
  if (!trimmed || PROHIBITED_GEMINI_MODELS.has(trimmed)) {
    return 'gemini-4-hydrogen';
  }
  return trimmed;
}

function buildOpenAiEndpoint(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

async function callUpstreamCustomOpenAi(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  jsonMode?: boolean;
}): Promise<string> {
  const endpoint = buildOpenAiEndpoint(params.baseUrl);
  const validated = await validateExternalUrl(endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.apiKey && params.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${params.apiKey.trim()}`;
  }

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };
  if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const upstreamRes = await fetch(validated.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });

  const text = await upstreamRes.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`上游模型接口返回非 JSON 响应 (${upstreamRes.status}): ${text.slice(0, 180)}`);
  }

  if (!upstreamRes.ok) {
    const errMsg = data?.error?.message || data?.message || `HTTP ${upstreamRes.status}`;
    throw new Error(`自定义模型接口请求失败: ${errMsg}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('上游模型接口未返回标准文本内容');
  }
  return content;
}

async function callUpstreamCustomGemini(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  systemInstruction?: string;
  contents: string;
  jsonMode?: boolean;
}): Promise<string> {
  const cleanBase = (params.baseUrl || 'https://generativelanguage.googleapis.com').trim().replace(/\/+$/, '');
  const modelId = sanitizeGeminiModel(params.model);
  const endpoint = cleanBase.includes(':generateContent')
    ? cleanBase
    : `${cleanBase}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;

  const validated = await validateExternalUrl(endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.apiKey && params.apiKey.trim()) {
    headers['x-goog-api-key'] = params.apiKey.trim();
  }

  const payload: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: params.contents }] }],
  };
  if (params.systemInstruction) {
    payload.systemInstruction = { parts: [{ text: params.systemInstruction }] };
  }
  if (params.jsonMode) {
    payload.generationConfig = { responseMimeType: 'application/json' };
  }

  const upstreamRes = await fetch(validated.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });

  const text = await upstreamRes.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`自定义 Gemini 接口返回非 JSON 响应 (${upstreamRes.status}): ${text.slice(0, 180)}`);
  }

  if (!upstreamRes.ok) {
    const errMsg = data?.error?.message || `HTTP ${upstreamRes.status}`;
    throw new Error(`自定义 Gemini 接口请求失败: ${errMsg}`);
  }

  const reply = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  if (!reply) {
    throw new Error('自定义 Gemini 接口未返回有效文本');
  }
  return reply;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health endpoint compatible with SovereignNote frontend diagnostics
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ready',
      kernel_state: 'web_express_ready',
      serverGeminiAvailable: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.get('/api/ai/status', (_req: Request, res: Response) => {
    res.json({
      serverGeminiAvailable: Boolean(process.env.GEMINI_API_KEY),
      defaultModel: 'gemini-4-hydrogen',
    });
  });

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const { preset, messages, systemInstruction } = req.body || {};
      if (!preset || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: '请求缺少模型预设或对话消息' });
      }

      const protocol = preset.protocol as 'server-gemini' | 'openai' | 'gemini-custom';

      if (protocol === 'server-gemini') {
        const ai = getServerGeminiClient();
        const model = sanitizeGeminiModel(preset.model);
        const promptTranscript = messages
          .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '')}`)
          .join('\n\n');

        const response = await ai.models.generateContent({
          model,
          contents: promptTranscript,
          config: systemInstruction
            ? { systemInstruction: String(systemInstruction) }
            : undefined,
        });

        return res.json({ text: response.text || '' });
      }

      if (protocol === 'openai') {
        if (!preset.baseUrl || !preset.model) {
          return res.status(400).json({ error: '自定义 OpenAI 接口缺少 Base URL 或模型名称' });
        }
        const openAiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        if (systemInstruction) {
          openAiMessages.push({ role: 'system', content: String(systemInstruction) });
        }
        for (const m of messages) {
          openAiMessages.push({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content || ''),
          });
        }
        const text = await callUpstreamCustomOpenAi({
          baseUrl: String(preset.baseUrl),
          apiKey: preset.apiKey ? String(preset.apiKey) : undefined,
          model: String(preset.model),
          messages: openAiMessages,
        });
        return res.json({ text });
      }

      if (protocol === 'gemini-custom') {
        if (!preset.model) {
          return res.status(400).json({ error: '自定义 Gemini 接口缺少模型名称' });
        }
        const promptTranscript = messages
          .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '')}`)
          .join('\n\n');
        const text = await callUpstreamCustomGemini({
          baseUrl: String(preset.baseUrl || 'https://generativelanguage.googleapis.com'),
          apiKey: preset.apiKey ? String(preset.apiKey) : undefined,
          model: String(preset.model),
          systemInstruction: systemInstruction ? String(systemInstruction) : undefined,
          contents: promptTranscript,
        });
        return res.json({ text });
      }

      return res.status(400).json({ error: '不支持的模型协议类型' });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'AI 请求处理失败',
      });
    }
  });

  app.post('/api/ai/structure', async (req: Request, res: Response) => {
    try {
      const { preset, task, prompt, systemInstruction } = req.body || {};
      if (!preset || !task || !prompt) {
        return res.status(400).json({ error: '缺少结构化生成所需参数' });
      }

      const protocol = preset.protocol as 'server-gemini' | 'openai' | 'gemini-custom';

      if (protocol === 'server-gemini') {
        const ai = getServerGeminiClient();
        const model = sanitizeGeminiModel(preset.model);

        const schema =
          task === 'mindmap'
            ? {
                type: Type.OBJECT,
                properties: {
                  rootLabel: { type: Type.STRING },
                  branches: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        children: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              label: { type: Type.STRING },
                              children: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              }
            : {
                type: Type.OBJECT,
                properties: {
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  events: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        date: { type: Type.STRING },
                        reason: { type: Type.STRING },
                      },
                    },
                  },
                },
              };

        const response = await ai.models.generateContent({
          model,
          contents: String(prompt),
          config: {
            systemInstruction: systemInstruction ? String(systemInstruction) : undefined,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });

        return res.json({ text: response.text || '{}' });
      }

      if (protocol === 'openai') {
        if (!preset.baseUrl || !preset.model) {
          return res.status(400).json({ error: '自定义 OpenAI 接口缺少 Base URL 或模型名称' });
        }
        const text = await callUpstreamCustomOpenAi({
          baseUrl: String(preset.baseUrl),
          apiKey: preset.apiKey ? String(preset.apiKey) : undefined,
          model: String(preset.model),
          messages: [
            ...(systemInstruction ? [{ role: 'system' as const, content: String(systemInstruction) }] : []),
            { role: 'user' as const, content: String(prompt) },
          ],
          jsonMode: true,
        });
        return res.json({ text });
      }

      if (protocol === 'gemini-custom') {
        const text = await callUpstreamCustomGemini({
          baseUrl: String(preset.baseUrl || 'https://generativelanguage.googleapis.com'),
          apiKey: preset.apiKey ? String(preset.apiKey) : undefined,
          model: String(preset.model || 'gemini-4-hydrogen'),
          systemInstruction: systemInstruction ? String(systemInstruction) : undefined,
          contents: String(prompt),
          jsonMode: true,
        });
        return res.json({ text });
      }

      return res.status(400).json({ error: '不支持的模型协议类型' });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'AI 结构化解析失败',
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SovereignNote server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
