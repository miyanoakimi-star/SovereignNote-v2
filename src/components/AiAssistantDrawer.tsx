import { useState } from 'react';
import {
  Bot,
  Calendar as CalendarIcon,
  Check,
  Copy,
  GitBranch,
  Loader2,
  Plus,
  Send,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  AiChatMessage,
  AiExtractedSuggestions,
  AiModelPreset,
  CalendarEvent,
  MindmapNode,
  Note,
} from '../types';
import {
  extractTagsAndEventsFromNote,
  generateMindmapFromNote,
  sendAiChat,
} from '../lib/ai';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  presets: AiModelPreset[];
  activePresetId: string;
  onSelectPreset: (id: string) => void;
  onOpenAiSettings: () => void;
  activeNote: Note | null;
  notes: Note[];
  onInsertIntoActiveNote: (text: string) => void;
  onCreateMindmapNote: (title: string, nodes: MindmapNode[]) => void;
  onUpdateActiveMindmap: (nodes: MindmapNode[]) => void;
  noteTagsMap: Record<string, string[]>;
  setNoteTagsMap: (map: Record<string, string[]>) => void;
  independentTags: string[];
  setIndependentTags: (tags: string[]) => void;
  customEvents: CalendarEvent[];
  setCustomEvents: (events: CalendarEvent[]) => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export default function AiAssistantDrawer({
  isOpen,
  onClose,
  presets,
  activePresetId,
  onSelectPreset,
  onOpenAiSettings,
  activeNote,
  notes,
  onInsertIntoActiveNote,
  onCreateMindmapNote,
  onUpdateActiveMindmap,
  noteTagsMap,
  setNoteTagsMap,
  independentTags,
  setIndependentTags,
  customEvents,
  setCustomEvents,
  notify,
}: AiAssistantDrawerProps) {
  const [tab, setTab] = useState<'chat' | 'mindmap' | 'extract'>('chat');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [includeActiveNote, setIncludeActiveNote] = useState(true);
  const [includeWorkspaceSearch, setIncludeWorkspaceSearch] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isGeneratingMindmap, setIsGeneratingMindmap] = useState(false);
  const [generatedNodes, setGeneratedNodes] = useState<MindmapNode[] | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<AiExtractedSuggestions | null>(null);

  if (!isOpen) return null;

  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0];

  const handleSendChat = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    if (!activePreset) {
      notify('error', '请先在系统设置中配置至少一个 AI 模型预设');
      return;
    }

    const userMsg: AiChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const reply = await sendAiChat({
        preset: activePreset,
        messages: nextMessages,
        activeNote,
        allNotes: notes,
        includeActiveNote,
        includeWorkspaceSearch,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      notify('error', err?.message || 'AI 对话请求失败');
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateMindmap = async () => {
    if (!activeNote) {
      notify('info', '请先打开或选择一篇笔记');
      return;
    }
    if (!activePreset) {
      notify('error', '未找到可用的 AI 模型预设');
      return;
    }
    setIsGeneratingMindmap(true);
    try {
      const nodes = await generateMindmapFromNote({
        preset: activePreset,
        title: activeNote.title,
        content: activeNote.content,
      });
      setGeneratedNodes(nodes);
      notify('success', `已提炼 ${nodes.length} 个思维导图节点`);
    } catch (err: any) {
      notify('error', err?.message || '思维导图生成失败');
    } finally {
      setIsGeneratingMindmap(false);
    }
  };

  const handleExtract = async () => {
    if (!activeNote) {
      notify('info', '请先打开或选择一篇笔记');
      return;
    }
    if (!activePreset) {
      notify('error', '未找到可用的 AI 模型预设');
      return;
    }
    setIsExtracting(true);
    try {
      const todayDate = new Date().toISOString().slice(0, 10);
      const res = await extractTagsAndEventsFromNote({
        preset: activePreset,
        title: activeNote.title,
        content: activeNote.content,
        todayDate,
      });
      setSuggestions(res);
      notify(
        'success',
        `提取完成：${res.tags.length} 个建议标签，${res.events.length} 条建议日程`
      );
    } catch (err: any) {
      notify('error', err?.message || '提取标签与日程失败');
    } finally {
      setIsExtracting(false);
    }
  };

  const applySingleTag = (tag: string) => {
    if (!activeNote) return;
    const clean = tag.replace(/^#+/, '').trim();
    if (!clean) return;
    const current = noteTagsMap[activeNote.id] || [];
    if (!current.includes(clean)) {
      setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: [...current, clean] });
    }
    if (!independentTags.includes(clean)) {
      setIndependentTags([...independentTags, clean]);
    }
    notify('success', `已添加标签 #${clean}`);
  };

  const applyAllTags = () => {
    if (!activeNote || !suggestions?.tags.length) return;
    const current = new Set(noteTagsMap[activeNote.id] || []);
    const indSet = new Set(independentTags);
    suggestions.tags.forEach((t) => {
      const clean = t.replace(/^#+/, '').trim();
      if (clean) {
        current.add(clean);
        indSet.add(clean);
      }
    });
    setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: Array.from(current) });
    setIndependentTags(Array.from(indSet));
    notify('success', `已写入 ${suggestions.tags.length} 个标签到当前笔记`);
  };

  const applySingleEvent = (evt: { title: string; date: string }) => {
    const exists = customEvents.some(
      (e) => e.date === evt.date && e.title === evt.title
    );
    if (exists) {
      notify('info', '该日程已存在于日历中');
      return;
    }
    setCustomEvents([
      ...customEvents,
      {
        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: evt.title,
        date: evt.date,
        noteId: activeNote?.id || null,
      },
    ]);
    notify('success', `已添加日程：${evt.date} ${evt.title}`);
  };

  const applyAllEvents = () => {
    if (!suggestions?.events.length) return;
    const next = [...customEvents];
    let added = 0;
    for (const evt of suggestions.events) {
      if (!next.some((e) => e.date === evt.date && e.title === evt.title)) {
        next.push({
          id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: evt.title,
          date: evt.date,
          noteId: activeNote?.id || null,
        });
        added++;
      }
    }
    setCustomEvents(next);
    notify('success', added > 0 ? `已添加 ${added} 条日程到日历` : '所有建议日程均已存在');
  };

  return (
    <aside className="w-80 lg:w-96 shrink-0 sn-panel border-l sn-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-14 px-4 border-b sn-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-sm font-semibold sn-text whitespace-nowrap">AI 助手</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenAiSettings}
            className="p-1.5 rounded-lg sn-muted hover:sn-text hover:bg-indigo-500/10 transition-colors"
            title="管理 AI 模型预设"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg sn-muted hover:sn-text hover:bg-indigo-500/10 transition-colors"
            title="关闭 AI 侧栏"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* One-click Preset Switcher */}
      <div className="px-4 py-2.5 border-b sn-border flex items-center gap-2 shrink-0">
        <select
          value={activePreset?.id || ''}
          onChange={(e) => onSelectPreset(e.target.value)}
          aria-label="选择 AI 模型预设"
          className="flex-1 min-w-0 h-8 px-2.5 text-xs sn-input border rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.model || '未指定模型'})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenAiSettings}
          className="h-8 px-2.5 text-xs font-medium rounded-lg border sn-border-strong sn-muted hover:sn-text whitespace-nowrap shrink-0"
        >
          预设
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-2.5 pb-2 border-b sn-border shrink-0">
        <div className="grid grid-cols-3 gap-1 p-1 sn-surface rounded-lg border sn-border">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'chat' ? 'bg-indigo-600 text-white' : 'sn-muted hover:sn-text'
            }`}
          >
            对话问答
          </button>
          <button
            type="button"
            onClick={() => setTab('mindmap')}
            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'mindmap' ? 'bg-indigo-600 text-white' : 'sn-muted hover:sn-text'
            }`}
          >
            生成导图
          </button>
          <button
            type="button"
            onClick={() => setTab('extract')}
            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'extract' ? 'bg-indigo-600 text-white' : 'sn-muted hover:sn-text'
            }`}
          >
            标签日程
          </button>
        </div>
      </div>

      {/* Tab Body */}
      {tab === 'chat' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b sn-border flex items-center justify-between gap-2 text-xs sn-muted shrink-0">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeActiveNote}
                  onChange={(e) => setIncludeActiveNote(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <span>关联当前笔记</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeWorkspaceSearch}
                  onChange={(e) => setIncludeWorkspaceSearch(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <span>检索全部笔记</span>
              </label>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="sn-muted hover:text-rose-500 p-1 rounded"
                title="清空对话"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Sparkles className="w-6 h-6 text-indigo-500 mx-auto opacity-80" />
                <p className="text-xs font-medium sn-text">基于当前笔记或知识库提问</p>
                <p className="text-xs sn-muted leading-relaxed">
                  可要求提炼要点、拆解任务、补充示例或审校逻辑，回答可直接插入正文。
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1.5 ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'sn-surface border sn-border sn-text'
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 text-[11px] sn-muted">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setCopiedId(msg.id);
                          setTimeout(() => setCopiedId(null), 1500);
                        }}
                        className="hover:sn-text flex items-center gap-1"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === msg.id ? '已复制' : '复制'}</span>
                      </button>
                      {activeNote && activeNote.type !== 'whiteboard' && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertIntoActiveNote(msg.content);
                            notify('success', '已插入当前笔记末尾');
                          }}
                          className="hover:text-indigo-500 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>插入笔记</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {isSending && (
              <div className="flex items-center gap-2 text-xs sn-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                <span>正在生成回复...</span>
              </div>
            )}
          </div>

          <div className="p-3 border-t sn-border shrink-0 space-y-2">
            <div className="flex gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="输入问题，Enter 发送 / Shift+Enter 换行..."
                className="flex-1 px-3 py-2 text-xs sn-input border rounded-lg resize-none focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                disabled={isSending || !input.trim()}
                onClick={handleSendChat}
                className="px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center shrink-0 transition-colors"
                title="发送"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'mindmap' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="sn-surface border sn-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-semibold sn-text">笔记一键转思维导图</h3>
            </div>
            <p className="text-xs sn-muted leading-relaxed">
              分析当前激活笔记的标题与正文结构，自动提炼中心主题与多级分支节点，可直接创建为导图笔记。
            </p>
            <button
              type="button"
              disabled={isGeneratingMindmap || !activeNote}
              onClick={handleGenerateMindmap}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {isGeneratingMindmap ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在梳理导图结构...</span>
                </>
              ) : (
                <>
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>根据当前笔记生成思维导图</span>
                </>
              )}
            </button>
          </div>

          {generatedNodes && (
            <div className="sn-surface border sn-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold sn-text">结构预览</span>
                <span className="sn-muted tabular-nums">{generatedNodes.length} 个节点</span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 text-xs pr-1">
                {generatedNodes.map((n) => (
                  <div
                    key={n.id}
                    className={`py-1 px-2 rounded ${
                      n.parentId === null
                        ? 'font-semibold text-indigo-500 bg-indigo-500/10'
                        : 'sn-text-secondary pl-4'
                    }`}
                  >
                    {n.parentId === null ? n.label : `• ${n.label}`}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const baseTitle = activeNote?.title || '思维导图';
                    onCreateMindmapNote(`${baseTitle}（导图）`, generatedNodes);
                    notify('success', '已生成并打开新思维导图笔记');
                  }}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  新建导图笔记并打开
                </button>
                {activeNote?.type === 'mindmap' && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateActiveMindmap(generatedNodes);
                      notify('success', '已覆盖更新当前思维导图画布');
                    }}
                    className="w-full py-2 px-3 border sn-border-strong sn-text text-xs font-semibold rounded-lg hover:bg-indigo-500/10 transition-colors"
                  >
                    应用到当前导图笔记
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'extract' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="sn-surface border sn-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-semibold sn-text">智能提取标签与日程建议</h3>
            </div>
            <p className="text-xs sn-muted leading-relaxed">
              自动识别笔记主题生成层级标签，并提取文中的时间节点与待办事项为日历事件。
            </p>
            <button
              type="button"
              disabled={isExtracting || !activeNote}
              onClick={handleExtract}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在分析笔记内容...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>开始智能提取</span>
                </>
              )}
            </button>
          </div>

          {suggestions && (
            <div className="space-y-4">
              {/* Tags */}
              <div className="sn-surface border sn-border rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold sn-text flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-500" />
                    建议标签 ({suggestions.tags.length})
                  </span>
                  {suggestions.tags.length > 0 && (
                    <button
                      type="button"
                      onClick={applyAllTags}
                      className="text-[11px] font-semibold text-indigo-500 hover:underline"
                    >
                      全部写入笔记
                    </button>
                  )}
                </div>
                {suggestions.tags.length === 0 ? (
                  <p className="text-xs sn-muted">未提取到新增标签建议</p>
                ) : (
                  <div className="space-y-1.5">
                    {suggestions.tags.map((tag) => (
                      <div
                        key={tag}
                        className="flex items-center justify-between py-1.5 px-2.5 rounded-lg sn-elevated border sn-border text-xs"
                      >
                        <span className="sn-text font-medium truncate">#{tag}</span>
                        <button
                          type="button"
                          onClick={() => applySingleTag(tag)}
                          className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-400 shrink-0 ml-2"
                        >
                          + 添加
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Events */}
              <div className="sn-surface border sn-border rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold sn-text flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-emerald-500" />
                    建议日程 ({suggestions.events.length})
                  </span>
                  {suggestions.events.length > 0 && (
                    <button
                      type="button"
                      onClick={applyAllEvents}
                      className="text-[11px] font-semibold text-emerald-500 hover:underline"
                    >
                      全部加入日历
                    </button>
                  )}
                </div>
                {suggestions.events.length === 0 ? (
                  <p className="text-xs sn-muted">未识别到明确的日期或日程计划</p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.events.map((evt, idx) => (
                      <div
                        key={`${evt.date}-${idx}`}
                        className="p-2.5 rounded-lg sn-elevated border sn-border space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold sn-text truncate">{evt.title}</span>
                          <button
                            type="button"
                            onClick={() => applySingleEvent(evt)}
                            className="text-[11px] font-semibold text-emerald-500 hover:text-emerald-400 shrink-0"
                          >
                            + 日历
                          </button>
                        </div>
                        <div className="text-[11px] sn-muted tabular-nums font-mono">
                          {evt.date}
                          {evt.reason ? ` · ${evt.reason}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
