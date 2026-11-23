import React, { useMemo, useRef, useState } from 'react';
import {
  Bold,
  Bot,
  ChevronRight,
  CheckSquare,
  Code,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FileDown,
  Image,
  Italic,
  Layout,
  Link,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Quote,
  Search,
  Send,
  Sparkles,
  Table,
  Trash2,
  X,
} from 'lucide-react';
import { AiCustomCommand, AiModelPreset, NavState, Note } from '../types';
import { parseMarkdown } from '../utils/markdown';
import { universalExport } from '../utils/export';
import {
  EditorAiAction,
  runCustomNoteAiInstruction,
  runEditorAiAction,
} from '../lib/ai';
import Whiteboard from './Whiteboard';
import Mindmap from './Mindmap';

interface NoteEditorProps {
  activeNote: Note | null;
  notes: Note[];
  updateActiveNote: (title: string, content: string, extraFields?: Partial<Note>) => void;
  fontSizeLevel: number;
  isPartitionOpen: boolean;
  setIsPartitionOpen: (open: boolean) => void;
  setActiveNoteId: (id: string | null) => void;
  setNavState: (state: NavState) => void;
  noteTagsMap: Record<string, string[]>;
  setNoteTagsMap: (map: Record<string, string[]>) => void;
  independentTags: string[];
  setIndependentTags: (tags: string[]) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activePreset: AiModelPreset | undefined;
  isAiDrawerOpen: boolean;
  setIsAiDrawerOpen: (open: boolean) => void;
  customCommands: AiCustomCommand[];
  onUpsertCustomCommand: (cmd: AiCustomCommand) => void;
  onDeleteCustomCommand: (id: string) => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export default function NoteEditor({
  activeNote,
  notes,
  updateActiveNote,
  fontSizeLevel,
  isPartitionOpen,
  setIsPartitionOpen,
  setActiveNoteId,
  setNavState,
  noteTagsMap,
  setNoteTagsMap,
  independentTags,
  setIndependentTags,
  searchQuery,
  setSearchQuery,
  activePreset,
  isAiDrawerOpen,
  setIsAiDrawerOpen,
  customCommands,
  onUpsertCustomCommand,
  onDeleteCustomCommand,
  notify,
}: NoteEditorProps) {
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = useState(false);

  // Inline tag & date popover states (replaces blocking window.prompt)
  const [inlinePromptType, setInlinePromptType] = useState<'tag' | 'date' | 'folder' | null>(null);
  const [inlinePromptVal, setInlinePromptVal] = useState('');

  // Inline AI writing actions & custom command states
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [aiActionLoading, setAiActionLoading] = useState<string | null>(null);
  const [capturedSelectionRange, setCapturedSelectionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [adHocPrompt, setAdHocPrompt] = useState('');
  const [isSavingAdHoc, setIsSavingAdHoc] = useState(false);
  const [adHocSaveName, setAdHocSaveName] = useState('');
  const [menuEditingCmd, setMenuEditingCmd] = useState<{
    id: string;
    name: string;
    prompt: string;
  } | null>(null);
  const [aiPreviewResult, setAiPreviewResult] = useState<{
    label: string;
    text: string;
    selectionRange: { start: number; end: number } | null;
  } | null>(null);

  const undoStack = useRef<{ title: string; content: string }[]>([]);
  const redoStack = useRef<{ title: string; content: string }[]>([]);
  const lastSavedState = useRef<{ id: string; title: string; content: string } | null>(null);
  const lastNoteIdRef = useRef<string | null>(null);

  if (activeNote && lastNoteIdRef.current !== activeNote.id) {
    lastNoteIdRef.current = activeNote.id;
    undoStack.current = [];
    redoStack.current = [];
    lastSavedState.current = {
      id: activeNote.id,
      title: activeNote.title,
      content: activeNote.content,
    };
  } else if (!activeNote && lastNoteIdRef.current !== null) {
    lastNoteIdRef.current = null;
    undoStack.current = [];
    redoStack.current = [];
    lastSavedState.current = null;
  }

  const handleNoteChange = (newTitle: string, newContent: string, extraFields?: Partial<Note>) => {
    if (!activeNote || !lastSavedState.current) return;
    const prevTitle = lastSavedState.current.title;
    const prevContent = lastSavedState.current.content;

    if (prevTitle !== newTitle || prevContent !== newContent) {
      const lastUndo = undoStack.current[undoStack.current.length - 1];
      if (!lastUndo || lastUndo.title !== prevTitle || lastUndo.content !== prevContent) {
        if (undoStack.current.length >= 100) undoStack.current.shift();
        undoStack.current.push({ title: prevTitle, content: prevContent });
        redoStack.current = [];
      }
      lastSavedState.current = { id: activeNote.id, title: newTitle, content: newContent };
    }
    updateActiveNote(newTitle, newContent, extraFields);
  };

  const handleUndo = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (undoStack.current.length > 0 && activeNote && lastSavedState.current) {
      const popped = undoStack.current.pop()!;
      redoStack.current.push({
        title: lastSavedState.current.title,
        content: lastSavedState.current.content,
      });
      lastSavedState.current = {
        id: activeNote.id,
        title: popped.title,
        content: popped.content,
      };
      updateActiveNote(popped.title, popped.content, {});
    }
  };

  const handleRedo = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (redoStack.current.length > 0 && activeNote && lastSavedState.current) {
      const popped = redoStack.current.pop()!;
      undoStack.current.push({
        title: lastSavedState.current.title,
        content: lastSavedState.current.content,
      });
      lastSavedState.current = {
        id: activeNote.id,
        title: popped.title,
        content: popped.content,
      };
      updateActiveNote(popped.title, popped.content, {});
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) handleRedo(e);
      else handleUndo(e);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      handleRedo(e);
    }
  };

  const headerSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const valid = notes.filter((n) => !n.deleted);
    if (!q) return valid;
    return valid.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  const activeNoteStats = useMemo(() => {
    if (!activeNote) return { words: 0, chars: 0 };
    let text = '';
    if (activeNote.type === 'whiteboard') {
      text = activeNote.title || '';
    } else if (activeNote.type === 'mindmap') {
      const nodeText = activeNote.mindmapData?.nodes?.map((n) => n.label).join(' ') || '';
      text = nodeText || activeNote.content || '';
    } else {
      text = activeNote.content || '';
    }
    const cjkMatches =
      text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g) || [];
    const nonCjkText = text.replace(
      /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g,
      ' '
    );
    const latinWords = nonCjkText.trim()
      ? nonCjkText.trim().split(/\s+/).filter(Boolean)
      : [];
    return {
      words: cjkMatches.length + latinWords.length,
      chars: text.replace(/\s/g, '').length,
    };
  }, [activeNote]);

  const allFolders = useMemo(() => {
    const foldersSet = new Set<string>();
    notes
      .filter((n) => !n.deleted)
      .forEach((n) => {
        if (n.folder) foldersSet.add(n.folder);
      });
    return Array.from(foldersSet);
  }, [notes]);

  const fontSizePx = useMemo(() => {
    switch (fontSizeLevel) {
      case 1:
        return 12;
      case 3:
        return 16;
      case 4:
        return 18;
      case 5:
        return 20;
      case 2:
      default:
        return 14;
    }
  }, [fontSizeLevel]);

  const handleFormat = (type: string) => {
    if (!activeNote) return;
    const textarea = document.getElementById('note-editor-textarea') as HTMLTextAreaElement | null;

    if (!textarea) {
      if (type === 'tag') {
        setInlinePromptType('tag');
        setInlinePromptVal('');
      } else if (type === 'calendar') {
        setInlinePromptType('date');
        setInlinePromptVal(new Date().toISOString().slice(0, 10));
      }
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = activeNote.content;
    const selected = text.substring(start, end);

    let replacement = '';
    switch (type) {
      case 'bold':
        replacement = `**${selected || '加粗文本'}**`;
        break;
      case 'italic':
        replacement = `*${selected || '斜体文本'}*`;
        break;
      case 'code':
        replacement = `\`${selected || '代码'}\``;
        break;
      case 'h1':
        replacement = `\n# ${selected || '一级标题'}\n`;
        break;
      case 'h2':
        replacement = `\n## ${selected || '二级标题'}\n`;
        break;
      case 'h3':
        replacement = `\n### ${selected || '三级标题'}\n`;
        break;
      case 'ul':
        replacement = `\n- ${selected || '列表项目'}`;
        break;
      case 'ol':
        replacement = `\n1. ${selected || '列表项目'}`;
        break;
      case 'task':
        replacement = `\n- [ ] ${selected || '待办任务'}`;
        break;
      case 'quote':
        replacement = `\n> ${selected || '引用内容'}`;
        break;
      case 'hr':
        replacement = `\n---\n`;
        break;
      case 'table':
        replacement = `\n| 表头1 | 表头2 |\n| ---- | ---- |\n| 单元格1 | 单元格2 |\n`;
        break;
      case 'link':
        replacement = `[${selected || '链接文本'}](https://example.com)`;
        break;
      case 'image':
        replacement = `![${selected || '图片描述'}](https://example.com/image.png)`;
        break;
      case 'tag':
        setInlinePromptType('tag');
        setInlinePromptVal('');
        return;
      case 'calendar':
        setInlinePromptType('date');
        setInlinePromptVal(new Date().toISOString().slice(0, 10));
        return;
    }

    const updatedContent = text.substring(0, start) + replacement + text.substring(end);
    handleNoteChange(activeNote.title, updatedContent, {});
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    }, 40);
  };

  const handleSubmitInlinePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNote) return;
    const val = inlinePromptVal.trim();
    if (!val) {
      setInlinePromptType(null);
      return;
    }

    if (inlinePromptType === 'tag') {
      const cleanTag = val.replace(/^#+/, '').replace(/\/+$/, '');
      if (cleanTag) {
        const currentTags = noteTagsMap[activeNote.id] || [];
        if (!currentTags.includes(cleanTag)) {
          setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: [...currentTags, cleanTag] });
        }
        if (!independentTags.includes(cleanTag)) {
          setIndependentTags([...independentTags, cleanTag]);
        }
        notify('success', `已添加标签 #${cleanTag}`);
      }
    } else if (inlinePromptType === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        notify('error', '日期格式需为 YYYY-MM-DD');
        return;
      }
      const currentTags = noteTagsMap[activeNote.id] || [];
      const tagForDate = `#${val}`;
      if (!currentTags.includes(tagForDate)) {
        setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: [...currentTags, tagForDate] });
      }
      notify('success', `已关联日程日期 ${val}`);
    } else if (inlinePromptType === 'folder') {
      handleNoteChange(activeNote.title, activeNote.content, { folder: val });
      notify('success', `已移动至文件夹「${val}」`);
    }

    setInlinePromptType(null);
    setInlinePromptVal('');
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeNote) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains('todo-checkbox')) {
      const checkboxes = Array.from(e.currentTarget.querySelectorAll('.todo-checkbox'));
      const index = checkboxes.indexOf(target);
      if (index !== -1) {
        let count = 0;
        const updatedContent = activeNote.content.replace(
          /([-*]\s+\[)([ xX])(\])/g,
          (match, prefix, state, suffix) => {
            if (count === index) {
              count++;
              return `${prefix}${state === ' ' ? 'x' : ' '}${suffix}`;
            }
            count++;
            return match;
          }
        );
        handleNoteChange(activeNote.title, updatedContent, {});
      }
    }
  };

  const triggerNoteDownload = (format: 'md' | 'txt' | 'html' | 'json') => {
    if (!activeNote) return;
    let mime = 'text/plain';
    let ext = 'txt';
    let fileContents = '';

    if (format === 'md') {
      mime = 'text/markdown';
      ext = 'md';
      fileContents = activeNote.content;
    } else if (format === 'txt') {
      mime = 'text/plain';
      ext = 'txt';
      fileContents =
        `标题: ${activeNote.title}\n\n` +
        activeNote.content.replace(/#[a-zA-Z0-9_\u4e00-\u9fa5/]+/g, '').replace(/[#*`>-]/g, '').trim();
    } else if (format === 'html') {
      mime = 'text/html';
      ext = 'html';
      const parsedHTML = parseMarkdown(activeNote.content);
      fileContents = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${activeNote.title}</title></head><body><h1>${activeNote.title}</h1>${parsedHTML}</body></html>`;
    } else if (format === 'json') {
      mime = 'application/json';
      ext = 'json';
      fileContents = JSON.stringify(activeNote, null, 2);
    }

    universalExport(fileContents, `${(activeNote.title || 'note').replace(/\s+/g, '_')}.${ext}`, mime);
    setIsExportMenuOpen(false);
  };

  const handleExportAllMarkdown = () => {
    const activeNotes = notes.filter((n) => !n.deleted);
    notify('info', `正在导出 ${activeNotes.length} 篇 Markdown 笔记`);
    activeNotes.forEach((n, idx) => {
      setTimeout(() => {
        universalExport(n.content, `${(n.title || 'note').replace(/\s+/g, '_')}.md`, 'text/markdown');
      }, idx * 150);
    });
    setIsExportMenuOpen(false);
  };

  const actionLabelMap: Record<EditorAiAction, string> = {
    polish: 'AI 润色结果',
    continue: 'AI 续写建议',
    summarize: 'AI 摘要提炼',
    fix: 'AI 校对修正',
    translate: 'AI 翻译结果',
  };

  const resolveSelectionForAi = () => {
    if (!activeNote) return { selectionRange: null, targetText: '' };
    if (
      capturedSelectionRange &&
      capturedSelectionRange.end > capturedSelectionRange.start &&
      capturedSelectionRange.end <= activeNote.content.length
    ) {
      return {
        selectionRange: capturedSelectionRange,
        targetText: activeNote.content.slice(
          capturedSelectionRange.start,
          capturedSelectionRange.end
        ),
      };
    }
    const textarea = document.getElementById('note-editor-textarea') as HTMLTextAreaElement | null;
    const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd;
    const selectionRange = hasSelection
      ? { start: textarea!.selectionStart, end: textarea!.selectionEnd }
      : null;
    const targetText = selectionRange
      ? activeNote.content.slice(selectionRange.start, selectionRange.end)
      : activeNote.content;
    return { selectionRange, targetText };
  };

  const handleTriggerAiAction = async (action: EditorAiAction) => {
    if (!activeNote) return;
    if (!activePreset) {
      notify('error', '请先配置或选择一个 AI 模型预设');
      return;
    }
    setIsAiMenuOpen(false);

    const { selectionRange, targetText } = resolveSelectionForAi();
    if (!targetText.trim()) {
      notify('info', '当前笔记内容为空，请先输入文字后再使用 AI 处理');
      return;
    }

    setAiActionLoading(action);
    try {
      const output = await runEditorAiAction({
        preset: activePreset,
        action,
        text: targetText,
        noteTitle: activeNote.title,
      });
      setAiPreviewResult({ label: actionLabelMap[action], text: output, selectionRange });
    } catch (err: any) {
      notify('error', err?.message || 'AI 写作处理失败');
    } finally {
      setAiActionLoading(null);
    }
  };

  const handleRunCustomInstruction = async (instruction: string, label?: string) => {
    if (!activeNote) return;
    if (!activePreset) {
      notify('error', '请先配置或选择一个 AI 模型预设');
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      notify('info', '请输入要执行的自定义指令');
      return;
    }

    const { selectionRange, targetText } = resolveSelectionForAi();
    if (!targetText.trim()) {
      notify('info', '当前笔记内容为空，请先输入文字后再执行指令');
      return;
    }

    setIsAiMenuOpen(false);
    setAiActionLoading(label || 'custom');
    try {
      const output = await runCustomNoteAiInstruction({
        preset: activePreset,
        instruction: trimmed,
        text: targetText,
        noteTitle: activeNote.title,
      });
      const previewLabel = label
        ? `自定义命令：${label}`
        : `临时指令：${trimmed.slice(0, 18)}${trimmed.length > 18 ? '...' : ''}`;
      setAiPreviewResult({ label: previewLabel, text: output, selectionRange });
    } catch (err: any) {
      notify('error', err?.message || '自定义指令执行失败');
    } finally {
      setAiActionLoading(null);
    }
  };

  const handleSaveMenuCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuEditingCmd) return;
    const name = menuEditingCmd.name.trim();
    const prompt = menuEditingCmd.prompt.trim();
    if (!name || !prompt) {
      notify('error', '请填写命令名称与指令内容');
      return;
    }
    onUpsertCustomCommand({
      id: menuEditingCmd.id || `cmd_${Date.now()}`,
      name,
      prompt,
      updatedAt: Date.now(),
    });
    setMenuEditingCmd(null);
    notify('success', `已保存常用命令「${name}」`);
  };

  const applyAiPreview = (mode: 'replaceSelection' | 'replaceAll' | 'append') => {
    if (!activeNote || !aiPreviewResult) return;
    const { text, selectionRange } = aiPreviewResult;
    if (mode === 'replaceSelection' && selectionRange) {
      const updated =
        activeNote.content.slice(0, selectionRange.start) +
        text +
        activeNote.content.slice(selectionRange.end);
      handleNoteChange(activeNote.title, updated, {});
    } else if (mode === 'replaceAll') {
      handleNoteChange(activeNote.title, text, {});
    } else {
      const sep = activeNote.content.trim() ? '\n\n' : '';
      handleNoteChange(activeNote.title, `${activeNote.content}${sep}${text}`, {});
    }
    setAiPreviewResult(null);
    notify('success', '已应用 AI 生成内容（支持 Ctrl+Z 撤销）');
  };

  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center sn-canvas sn-muted flex-col border-l sn-border select-none space-y-4">
        <div className="flex flex-col items-center justify-center text-center px-6">
          <Layout className="w-11 h-11 mb-3 opacity-50 text-indigo-500" />
          <p className="text-sm font-semibold sn-text">零星几点 筑成知识汪洋</p>
          <p className="text-xs sn-muted mt-1">
            从左侧列表选择一篇笔记，或点击新建开始创作与 AI 协作。
          </p>
        </div>
        {!isPartitionOpen && (
          <button
            type="button"
            onClick={() => setIsPartitionOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4" /> 展开笔记面板
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col sn-canvas overflow-hidden border-l sn-border min-w-0">
      {/* EDITOR HEADER */}
      <div className="h-14 px-4 lg:px-6 border-b sn-border flex items-center justify-between gap-3 sn-panel shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isPartitionOpen && (
            <button
              type="button"
              onClick={() => setIsPartitionOpen(true)}
              className="text-indigo-500 hover:bg-indigo-500/10 p-1.5 rounded-lg flex items-center gap-1 text-xs font-semibold border border-indigo-500/20 shrink-0"
              title="展开笔记列表"
            >
              <ChevronRight className="w-4 h-4" />
              <span className="hidden sm:inline">展开</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsToolbarOpen(!isToolbarOpen)}
            className="sn-muted hover:text-indigo-500 p-1.5 hover:bg-indigo-500/10 rounded shrink-0"
            title="切换快捷标记工具"
          >
            {isToolbarOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={activeNote.title}
            onChange={(e) => handleNoteChange(e.target.value, activeNote.content)}
            placeholder="输入标题..."
            className="bg-transparent text-sm lg:text-base font-bold sn-text border-none focus:outline-none focus:ring-0 min-w-[90px] flex-1 max-w-xs truncate"
          />

          <span
            className="text-xs font-mono tabular-nums sn-muted shrink-0 whitespace-nowrap"
            title={`非空白字符数: ${activeNoteStats.chars}`}
          >
            {activeNoteStats.words} 词
          </span>

          <select
            value={activeNote.folder || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '___create_new___') {
                setInlinePromptType('folder');
                setInlinePromptVal('');
              } else {
                handleNoteChange(activeNote.title, activeNote.content, { folder: val || undefined });
              }
            }}
            aria-label="选择笔记文件夹"
            className="h-7 px-2 text-xs sn-input border rounded-lg outline-none cursor-pointer shrink-0 max-w-[110px]"
          >
            <option value="">未分类</option>
            {allFolders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value="___create_new___">+ 新建文件夹</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0">
          {/* Persistent Header Search Bar */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 sn-muted absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsHeaderSearchOpen(true);
              }}
              onFocus={() => setIsHeaderSearchOpen(true)}
              onBlur={() => setTimeout(() => setIsHeaderSearchOpen(false), 160)}
              placeholder="搜索标题或正文..."
              aria-label="搜索笔记"
              className="w-32 sm:w-44 lg:w-52 h-8 pl-8 pr-7 text-xs sn-input border rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 sn-muted hover:sn-text"
                title="清除搜索"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isHeaderSearchOpen && searchQuery.trim() !== '' && (
              <div className="absolute right-0 top-10 w-72 max-h-64 overflow-y-auto sn-elevated border sn-border-strong rounded-xl shadow-xl p-1.5 z-50 space-y-0.5">
                <div className="px-2 py-1 text-[11px] font-semibold sn-muted flex items-center justify-between border-b sn-border mb-1">
                  <span>匹配笔记 ({headerSearchResults.length})</span>
                </div>
                {headerSearchResults.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs sn-muted">未找到匹配笔记</div>
                ) : (
                  headerSearchResults.slice(0, 12).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setActiveNoteId(n.id);
                        setNavState('notes');
                        setIsHeaderSearchOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                        n.id === activeNote.id
                          ? 'bg-indigo-600/15 text-indigo-500 font-semibold'
                          : 'sn-text hover:bg-indigo-500/10'
                      }`}
                    >
                      <span className="font-semibold truncate">{n.title || '无标题笔记'}</span>
                      <span className="text-[11px] sn-muted truncate">
                        {(n.content || '').replace(/\s+/g, ' ').slice(0, 60) || '空白内容'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {activeNote.type !== 'whiteboard' && activeNote.type !== 'mindmap' && (
            <div className="flex rounded-lg sn-surface border sn-border p-0.5 font-medium">
              <button
                type="button"
                onClick={() => setEditorMode('edit')}
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                  editorMode === 'edit' ? 'bg-indigo-600 text-white' : 'sn-muted hover:sn-text'
                }`}
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('split')}
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                  editorMode === 'split' ? 'bg-indigo-600 text-white' : 'sn-muted hover:sn-text'
                }`}
              >
                双屏
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('preview')}
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                  editorMode === 'preview' ? 'bg-indigo-600 text-white' : 'sn-muted hover:sn-text'
                }`}
              >
                预览
              </button>
            </div>
          )}

          {/* Inline AI Actions & Custom Commands Dropdown */}
          {activeNote.type !== 'whiteboard' && activeNote.type !== 'mindmap' && (
            <div className="relative">
              <button
                type="button"
                disabled={aiActionLoading !== null}
                onMouseDown={() => {
                  const textarea = document.getElementById(
                    'note-editor-textarea'
                  ) as HTMLTextAreaElement | null;
                  if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
                    setCapturedSelectionRange({
                      start: textarea.selectionStart,
                      end: textarea.selectionEnd,
                    });
                  } else {
                    setCapturedSelectionRange(null);
                  }
                }}
                onClick={() => setIsAiMenuOpen(!isAiMenuOpen)}
                className="h-8 px-2.5 rounded-lg border sn-border-strong sn-surface hover:border-indigo-500 sn-text text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {aiActionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                )}
                <span>AI 写作</span>
              </button>
              {isAiMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-80 sm:w-96 sn-elevated border sn-border-strong rounded-xl shadow-2xl p-3 z-40 space-y-3 select-text">
                  {/* Header & Target Scope */}
                  <div className="flex items-center justify-between text-[11px] sn-muted border-b sn-border pb-2">
                    <span>
                      作用范围：
                      <strong className="sn-text font-semibold">
                        {capturedSelectionRange
                          ? `已选中 ${capturedSelectionRange.end - capturedSelectionRange.start} 字`
                          : '整篇笔记'}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAiMenuOpen(false)}
                      className="sn-muted hover:sn-text p-0.5 rounded"
                      aria-label="关闭 AI 菜单"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Ad-hoc Free Custom Instruction */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold sn-text">临时自由指令</div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={adHocPrompt}
                        onChange={(e) => setAdHocPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleRunCustomInstruction(adHocPrompt);
                          }
                        }}
                        placeholder="输入任意 AI 处理要求（回车立即执行）..."
                        className="flex-1 min-w-0 h-8 px-2.5 sn-input border rounded-lg text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRunCustomInstruction(adHocPrompt)}
                        disabled={!adHocPrompt.trim()}
                        className="h-8 px-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0"
                      >
                        <Send className="w-3 h-3" />
                        <span>执行</span>
                      </button>
                    </div>

                    {adHocPrompt.trim() && !isSavingAdHoc && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSavingAdHoc(true);
                          setAdHocSaveName(adHocPrompt.trim().slice(0, 12));
                        }}
                        className="text-[11px] text-indigo-500 hover:underline font-medium"
                      >
                        + 将当前指令存为常用命令
                      </button>
                    )}

                    {isSavingAdHoc && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          value={adHocSaveName}
                          onChange={(e) => setAdHocSaveName(e.target.value)}
                          placeholder="输入常用命令名称..."
                          className="flex-1 h-7 px-2 sn-input border rounded text-xs focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const name = adHocSaveName.trim();
                            const prompt = adHocPrompt.trim();
                            if (!name || !prompt) {
                              notify('error', '请输入命令名称和指令内容');
                              return;
                            }
                            onUpsertCustomCommand({
                              id: `cmd_${Date.now()}`,
                              name,
                              prompt,
                              updatedAt: Date.now(),
                            });
                            setIsSavingAdHoc(false);
                            setAdHocSaveName('');
                            notify('success', `已将「${name}」存为常用 AI 命令`);
                          }}
                          className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsSavingAdHoc(false)}
                          className="h-7 px-2 sn-muted hover:sn-text text-[11px]"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Saved Custom Commands List + Inline CRUD */}
                  <div className="space-y-1.5 border-t sn-border pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold sn-text">常用自定义命令</span>
                      <button
                        type="button"
                        onClick={() =>
                          setMenuEditingCmd(
                            menuEditingCmd
                              ? null
                              : { id: '', name: '', prompt: adHocPrompt.trim() }
                          )
                        }
                        className="text-[11px] text-indigo-500 hover:underline font-semibold flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{menuEditingCmd ? '收起' : '新增命令'}</span>
                      </button>
                    </div>

                    {menuEditingCmd && (
                      <form
                        onSubmit={handleSaveMenuCommand}
                        className="p-2.5 sn-surface border sn-border rounded-lg space-y-2"
                      >
                        <input
                          type="text"
                          value={menuEditingCmd.name}
                          onChange={(e) =>
                            setMenuEditingCmd({ ...menuEditingCmd, name: e.target.value })
                          }
                          placeholder="命令名称（如：提炼周报要点）"
                          className="w-full h-7 px-2 sn-input border rounded text-xs focus:outline-none focus:border-indigo-500"
                        />
                        <textarea
                          rows={2}
                          value={menuEditingCmd.prompt}
                          onChange={(e) =>
                            setMenuEditingCmd({ ...menuEditingCmd, prompt: e.target.value })
                          }
                          placeholder="输入指令 Prompt..."
                          className="w-full p-2 sn-input border rounded text-xs focus:outline-none focus:border-indigo-500 resize-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMenuEditingCmd(null)}
                            className="px-2 py-1 text-[11px] sn-muted hover:sn-text"
                          >
                            取消
                          </button>
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold"
                          >
                            保存
                          </button>
                        </div>
                      </form>
                    )}

                    {customCommands.length === 0 ? (
                      <div className="text-[11px] sn-muted py-1.5">
                        暂无保存的自定义命令，可点击上方「+ 新增命令」创建。
                      </div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
                        {customCommands.map((cmd) => (
                          <div
                            key={cmd.id}
                            className="flex items-center justify-between gap-1.5 rounded-lg hover:bg-indigo-500/10 px-2 py-1 group"
                          >
                            <button
                              type="button"
                              onClick={() => handleRunCustomInstruction(cmd.prompt, cmd.name)}
                              className="flex-1 min-w-0 text-left text-xs sn-text truncate py-0.5"
                              title={cmd.prompt}
                            >
                              {cmd.name}
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-75 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() =>
                                  setMenuEditingCmd({
                                    id: cmd.id,
                                    name: cmd.name,
                                    prompt: cmd.prompt,
                                  })
                                }
                                className="p-1 sn-muted hover:text-indigo-500 rounded"
                                title="编辑命令"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteCustomCommand(cmd.id);
                                  notify('info', `已删除命令「${cmd.name}」`);
                                }}
                                className="p-1 sn-muted hover:text-rose-500 rounded"
                                title="删除命令"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Built-in Quick Actions */}
                  <div className="space-y-1.5 border-t sn-border pt-2.5">
                    <div className="text-[11px] font-semibold sn-muted">基础写作工具</div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => handleTriggerAiAction('polish')}
                        className="py-1.5 px-2 rounded-md text-xs sn-surface border sn-border hover:border-indigo-500 sn-text truncate"
                      >
                        润色优化
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerAiAction('continue')}
                        className="py-1.5 px-2 rounded-md text-xs sn-surface border sn-border hover:border-indigo-500 sn-text truncate"
                      >
                        智能续写
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerAiAction('summarize')}
                        className="py-1.5 px-2 rounded-md text-xs sn-surface border sn-border hover:border-indigo-500 sn-text truncate"
                      >
                        核心摘要
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerAiAction('fix')}
                        className="py-1.5 px-2 rounded-md text-xs sn-surface border sn-border hover:border-indigo-500 sn-text truncate"
                      >
                        纠错整理
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerAiAction('translate')}
                        className="py-1.5 px-2 rounded-md text-xs sn-surface border sn-border hover:border-indigo-500 sn-text truncate"
                      >
                        中英互译
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Assistant Sidebar Toggle */}
          <button
            type="button"
            onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
            className={`h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              isAiDrawerOpen
                ? 'bg-indigo-600 text-white'
                : 'border sn-border-strong sn-surface sn-text hover:border-indigo-500'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI 助手</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">导出</span>
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-44 sn-elevated border sn-border-strong rounded-xl shadow-xl p-1.5 z-40 space-y-0.5">
                <button
                  type="button"
                  onClick={() => triggerNoteDownload('md')}
                  className="w-full text-left py-1.5 px-2.5 rounded-lg text-xs sn-text hover:bg-indigo-600 hover:text-white"
                >
                  Markdown (.md)
                </button>
                <button
                  type="button"
                  onClick={() => triggerNoteDownload('txt')}
                  className="w-full text-left py-1.5 px-2.5 rounded-lg text-xs sn-text hover:bg-indigo-600 hover:text-white"
                >
                  纯文本 (.txt)
                </button>
                <button
                  type="button"
                  onClick={() => triggerNoteDownload('html')}
                  className="w-full text-left py-1.5 px-2.5 rounded-lg text-xs sn-text hover:bg-indigo-600 hover:text-white"
                >
                  网页文档 (.html)
                </button>
                <button
                  type="button"
                  onClick={() => triggerNoteDownload('json')}
                  className="w-full text-left py-1.5 px-2.5 rounded-lg text-xs sn-text hover:bg-indigo-600 hover:text-white"
                >
                  结构数据 (.json)
                </button>
                <div className="h-px sn-border border-t my-1" />
                <button
                  type="button"
                  onClick={handleExportAllMarkdown}
                  className="w-full text-left py-1.5 px-2.5 rounded-lg text-xs text-indigo-500 font-semibold hover:bg-indigo-600 hover:text-white"
                >
                  批量导出全部 .md
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MARKDOWN TOOLBAR */}
      {isToolbarOpen && editorMode !== 'preview' && activeNote.type !== 'whiteboard' && activeNote.type !== 'mindmap' && (
        <div className="h-10 px-4 lg:px-6 border-b sn-border sn-panel flex items-center justify-between shrink-0 sn-muted text-xs select-none overflow-x-auto gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-0.5 border-r sn-border pr-2">
              {(['h1', 'h2', 'h3'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  className="hover:text-indigo-500 font-semibold px-1.5 py-0.5 rounded hover:bg-indigo-500/10 uppercase"
                  onClick={() => handleFormat(h)}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 border-r sn-border pr-2">
              <button type="button" onClick={() => handleFormat('bold')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="加粗">
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('italic')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="斜体">
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('code')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="行内代码">
                <Code className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-0.5 border-r sn-border pr-2">
              <button type="button" onClick={() => handleFormat('ul')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="无序列表">
                <List className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('ol')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="有序列表">
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('task')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="待办清单">
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('quote')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="引用">
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('table')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="表格">
                <Table className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => handleFormat('link')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="链接">
                <Link className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('image')} className="p-1 rounded hover:text-indigo-500 hover:bg-indigo-500/10" title="图片">
                <Image className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => handleFormat('hr')} className="px-1.5 py-0.5 rounded hover:text-indigo-500 hover:bg-indigo-500/10 font-mono" title="分割线">
                —
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setInlinePromptType('tag');
                setInlinePromptVal('');
              }}
              className="hover:text-indigo-500 font-medium whitespace-nowrap"
            >
              + 添加标签
            </button>
            <button
              type="button"
              onClick={() => {
                setInlinePromptType('date');
                setInlinePromptVal(new Date().toISOString().slice(0, 10));
              }}
              className="hover:text-emerald-500 font-medium whitespace-nowrap"
            >
              + 联动日期
            </button>
          </div>
        </div>
      )}

      {/* INLINE TAG / DATE / FOLDER INPUT BAR */}
      {inlinePromptType && (
        <form
          onSubmit={handleSubmitInlinePrompt}
          className="px-4 lg:px-6 py-2 sn-surface border-b sn-border flex items-center gap-2 text-xs"
        >
          <span className="font-semibold sn-text shrink-0">
            {inlinePromptType === 'tag'
              ? '新增层级标签：'
              : inlinePromptType === 'date'
              ? '联动日期 (YYYY-MM-DD)：'
              : '新建文件夹名称：'}
          </span>
          <input
            type="text"
            autoFocus
            value={inlinePromptVal}
            onChange={(e) => setInlinePromptVal(e.target.value)}
            placeholder={
              inlinePromptType === 'tag'
                ? '例如：工作/研发/React'
                : inlinePromptType === 'date'
                ? '2026-11-22'
                : '输入文件夹名称'
            }
            className="flex-1 max-w-xs h-7 px-2.5 text-xs sn-input border rounded-md focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="h-7 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-md"
          >
            确定
          </button>
          <button
            type="button"
            onClick={() => setInlinePromptType(null)}
            className="h-7 px-2.5 sn-muted hover:sn-text rounded-md"
          >
            取消
          </button>
        </form>
      )}

      {/* METADATA & TAGS BAR (clean unboxed text) */}
      <div className="px-4 lg:px-6 py-2 sn-panel border-b sn-border flex flex-wrap items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="sn-muted font-medium">标签：</span>
          {(noteTagsMap[activeNote.id] || []).length === 0 ? (
            <span className="sn-muted opacity-75">暂无独立标签</span>
          ) : (
            (noteTagsMap[activeNote.id] || []).map((tag) => {
              const display = tag.startsWith('#') ? tag : `#${tag}`;
              return (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-indigo-500 font-medium"
                >
                  <span>{display}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (noteTagsMap[activeNote.id] || []).filter((t) => t !== tag);
                      setNoteTagsMap({ ...noteTagsMap, [activeNote.id]: updated });
                    }}
                    className="sn-muted hover:text-rose-500 px-0.5 cursor-pointer"
                    title="移除标签"
                  >
                    ×
                  </button>
                </span>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setInlinePromptType('tag');
              setInlinePromptVal('');
            }}
            className="sn-muted hover:text-indigo-500 font-medium whitespace-nowrap"
          >
            + 贴标签
          </button>
          <button
            type="button"
            onClick={() => {
              setInlinePromptType('date');
              setInlinePromptVal(new Date().toISOString().slice(0, 10));
            }}
            className="sn-muted hover:text-emerald-500 font-medium whitespace-nowrap"
          >
            + 联动日期
          </button>
        </div>
      </div>

      {/* INLINE AI WRITING PREVIEW PANEL */}
      {aiPreviewResult && (
        <div className="px-4 lg:px-6 py-3 sn-surface border-b sn-border space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-indigo-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {aiPreviewResult.label}
            </span>
            <div className="flex items-center gap-2 text-xs">
              {aiPreviewResult.selectionRange && (
                <button
                  type="button"
                  onClick={() => applyAiPreview('replaceSelection')}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium"
                >
                  替换选中文本
                </button>
              )}
              <button
                type="button"
                onClick={() => applyAiPreview('replaceAll')}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium"
              >
                替换全文
              </button>
              <button
                type="button"
                onClick={() => applyAiPreview('append')}
                className="px-2.5 py-1 border sn-border-strong sn-text rounded-md font-medium hover:bg-indigo-500/10"
              >
                追加到末尾
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(aiPreviewResult.text);
                  notify('success', '已复制 AI 结果');
                }}
                className="px-2 py-1 sn-muted hover:sn-text flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> 复制
              </button>
              <button
                type="button"
                onClick={() => setAiPreviewResult(null)}
                className="p-1 sn-muted hover:sn-text"
                title="关闭预览"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto p-3 sn-elevated border sn-border rounded-lg text-xs sn-text leading-relaxed whitespace-pre-wrap">
            {aiPreviewResult.text}
          </div>
        </div>
      )}

      {/* WORKSPACE CANVAS */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {activeNote.type === 'whiteboard' ? (
          <Whiteboard
            key={activeNote.id}
            paths={activeNote.content ? JSON.parse(activeNote.content) : []}
            onChange={(paths) => handleNoteChange(activeNote.title, JSON.stringify(paths))}
          />
        ) : activeNote.type === 'mindmap' ? (
          <Mindmap
            data={activeNote.mindmapData}
            onChange={(data) => handleNoteChange(activeNote.title, activeNote.content, { mindmapData: data })}
            title={activeNote.title}
          />
        ) : (
          <>
            {(editorMode === 'edit' || editorMode === 'split') && (
              <div className="flex-1 h-full sn-canvas flex min-w-0">
                <textarea
                  id="note-editor-textarea"
                  value={activeNote.content}
                  onChange={(e) => handleNoteChange(activeNote.title, e.target.value, {})}
                  onKeyDown={handleEditorKeyDown}
                  className="w-full h-full p-6 outline-none border-none focus:ring-0 resize-none bg-transparent sn-text font-mono leading-relaxed"
                  placeholder="在此编写 Markdown..."
                  style={{ fontSize: `${fontSizePx}px` }}
                />
              </div>
            )}

            {editorMode === 'split' && <div className="w-px sn-border border-l shrink-0" />}

            {(editorMode === 'preview' || editorMode === 'split') && (
              <div
                className="flex-1 h-full overflow-y-auto p-8 sn-panel min-w-0"
                onClick={handlePreviewClick}
              >
                <div
                  className="max-w-none font-sans leading-relaxed"
                  style={{ fontSize: `${fontSizePx}px` }}
                  dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* CLEAN EDITOR STATUS BAR */}
      <div className="h-7 px-4 lg:px-6 border-t sn-border sn-panel flex items-center justify-between text-xs sn-muted font-mono tabular-nums shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span>词数 {activeNoteStats.words}</span>
          <span aria-hidden="true">·</span>
          <span>字符 {activeNoteStats.chars}</span>
          {searchQuery.trim() !== '' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-indigo-500">匹配 {headerSearchResults.length} 篇</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>
            {activeNote.type === 'whiteboard'
              ? '白板'
              : activeNote.type === 'mindmap'
              ? '导图'
              : 'Markdown'}
          </span>
          <span aria-hidden="true">·</span>
          <span>更新于 {new Date(activeNote.updated_at).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
