import { useState, useMemo } from 'react';
import { CalendarEvent, NavState, Note, SettingsTab } from '../types';
import {
  Bot,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Hash,
  Info,
  Plus,
  Rocket,
  Sliders,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';

interface PartitionBarProps {
  navState: NavState;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  searchQuery: string;
  handleCreateNote: (
    initialTitle?: string,
    initialContent?: string,
    folder?: string,
    extraFields?: Partial<Note>
  ) => void;
  handleDeleteNote: (id: string) => void;
  updateNote: (id: string, title: string, content: string, extraFields?: Partial<Note>) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  selectedFolder: string | null;
  setSelectedFolder: (folder: string | null) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
  customEvents: CalendarEvent[];
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  handleImportNotesFromFiles: (files: FileList) => void;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  independentTags: string[];
  setIndependentTags: (tags: string[]) => void;
  noteTagsMap: Record<string, string[]>;
  setNoteTagsMap: (map: Record<string, string[]>) => void;
  activeSettingsTab: SettingsTab;
  setActiveSettingsTab: (tab: SettingsTab) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: Record<string, TreeNode>;
  count: number;
}

export default function PartitionBar({
  navState,
  isOpen,
  setIsOpen,
  notes,
  activeNoteId,
  setActiveNoteId,
  searchQuery,
  handleCreateNote,
  handleDeleteNote,
  updateNote,
  selectedTag,
  setSelectedTag,
  selectedFolder,
  setSelectedFolder,
  fontSizeLevel,
  customEvents,
  independentTags,
  setIndependentTags,
  noteTagsMap,
  setNoteTagsMap,
  activeSettingsTab,
  setActiveSettingsTab,
}: PartitionBarProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>({});
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Record<string, boolean>>({});

  // Inline inputs instead of blocking window.prompt / window.confirm
  const [inlineAction, setInlineAction] = useState<
    | null
    | { type: 'new-folder' | 'batch-folder' | 'batch-tag' | 'new-tag' | 'import-tags' | 'note-tag'; noteId?: string }
  >(null);
  const [inlineValue, setInlineValue] = useState('');
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);

  const getDynamicFontSizeStyle = (level: number, baseSize: number) => {
    const factors = [0.85, 1.0, 1.15, 1.3, 1.45];
    const factor = factors[level - 1] || 1.0;
    return { fontSize: `${baseSize * factor}px`, lineHeight: `${baseSize * factor * 1.35}px` };
  };

  const nonDeletedNotes = useMemo(() => notes.filter((n) => !n.deleted), [notes]);

  const { tagTree, allUniqueTags } = useMemo(() => {
    const root: TreeNode = { name: 'Root', fullPath: '', children: {}, count: 0 };
    const uniqueTagsSet = new Set<string>(independentTags);
    const tagCountMap = new Map<string, number>();

    for (const note of nonDeletedNotes) {
      const noteUniqueTags = new Set<string>();
      const content = note.content || '';
      const matches = content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
      if (matches) {
        matches.forEach((m) => {
          const t = m.trim().substring(1);
          if (!t.endsWith('/') && t.length > 0) {
            noteUniqueTags.add(t);
            uniqueTagsSet.add(t);
          }
        });
      }

      const indTags = noteTagsMap[note.id] || [];
      indTags.forEach((t) => {
        if (t.length > 0) {
          noteUniqueTags.add(t);
          uniqueTagsSet.add(t);
        }
      });

      const prefixPaths = new Set<string>();
      for (const tag of noteUniqueTags) {
        const parts = tag.split('/');
        let acc = '';
        for (const p of parts) {
          acc = acc ? `${acc}/${p}` : p;
          prefixPaths.add(acc);
        }
      }

      for (const prefix of prefixPaths) {
        tagCountMap.set(prefix, (tagCountMap.get(prefix) || 0) + 1);
      }
    }

    for (const fullTag of Array.from(uniqueTagsSet)) {
      const parts = fullTag.split('/');
      const cappedParts = parts.slice(0, 6);
      let current = root;
      let pathAccumulator = '';

      for (let i = 0; i < cappedParts.length; i++) {
        const part = cappedParts[i];
        pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            fullPath: pathAccumulator,
            children: {},
            count: tagCountMap.get(pathAccumulator) || 0,
          };
        }
        current = current.children[part];
      }
    }

    return { tagTree: root, allUniqueTags: Array.from(uniqueTagsSet) };
  }, [nonDeletedNotes, independentTags, noteTagsMap]);

  const exportTags = () => {
    const tagList = allUniqueTags.map((t) => `#${t}`);
    import('../utils/export').then(({ universalExport }) => {
      universalExport(
        tagList.join('\n'),
        `sovereign_tags_catalog_${new Date().toISOString().slice(0, 10)}.txt`,
        'text/plain'
      );
    });
  };

  const handleSubmitInlineAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineAction) return;
    const raw = inlineValue.trim();

    if (inlineAction.type === 'new-folder') {
      if (raw) {
        handleCreateNote(
          `${raw} - 新笔记`,
          `# ${raw}\n\n这是在 [${raw}] 文件夹中的笔记。`,
          raw
        );
        setSelectedFolder(raw);
      }
    } else if (inlineAction.type === 'batch-folder') {
      const selectedList = filteredNotes.filter((n) => selectedNoteIds[n.id]);
      const cleanFolder = raw || undefined;
      selectedList.forEach((n) => updateNote(n.id, n.title, n.content, { folder: cleanFolder }));
      setSelectedNoteIds({});
      setIsBatchMode(false);
    } else if (inlineAction.type === 'batch-tag' && raw) {
      const cleanTag = raw.replace(/^#+/, '');
      const selectedList = filteredNotes.filter((n) => selectedNoteIds[n.id]);
      if (!independentTags.includes(cleanTag)) {
        setIndependentTags([...independentTags, cleanTag]);
      }
      const updatedMap = { ...noteTagsMap };
      selectedList.forEach((n) => {
        const cur = updatedMap[n.id] || [];
        if (!cur.includes(cleanTag)) updatedMap[n.id] = [...cur, cleanTag];
      });
      setNoteTagsMap(updatedMap);
      setSelectedNoteIds({});
      setIsBatchMode(false);
    } else if (inlineAction.type === 'note-tag' && inlineAction.noteId && raw) {
      const cleanTag = raw.replace(/^#+/, '');
      if (!independentTags.includes(cleanTag)) {
        setIndependentTags([...independentTags, cleanTag]);
      }
      const cur = noteTagsMap[inlineAction.noteId] || [];
      if (!cur.includes(cleanTag)) {
        setNoteTagsMap({ ...noteTagsMap, [inlineAction.noteId]: [...cur, cleanTag] });
      }
    } else if (inlineAction.type === 'new-tag' && raw) {
      const cleanTag = raw.replace(/^#+/, '');
      if (!independentTags.includes(cleanTag)) {
        setIndependentTags([...independentTags, cleanTag]);
      }
      if (activeNoteId) {
        const cur = noteTagsMap[activeNoteId] || [];
        if (!cur.includes(cleanTag)) {
          setNoteTagsMap({ ...noteTagsMap, [activeNoteId]: [...cur, cleanTag] });
        }
      }
    } else if (inlineAction.type === 'import-tags' && raw) {
      const matches = raw.match(/#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
      if (matches) {
        const cleanList = matches.map((m) => m.trim().substring(1));
        setIndependentTags(Array.from(new Set([...independentTags, ...cleanList])));
      }
    }

    setInlineAction(null);
    setInlineValue('');
  };

  const renderTagNodes = (node: TreeNode, depth = 0) => {
    return Object.values(node.children)
      .sort((a, b) => b.count - a.count)
      .map((child) => {
        const isCollapsed = !!collapsedPaths[child.fullPath];
        const hasChildren = Object.keys(child.children).length > 0;
        const isSelected = selectedTag === child.fullPath;

        return (
          <div key={child.fullPath} className="space-y-0.5">
            <div
              className={`group flex items-center justify-between py-1.5 px-2.5 rounded-lg text-xs transition-colors ${
                isSelected
                  ? 'bg-indigo-600/15 text-indigo-500 font-semibold'
                  : 'sn-text hover:bg-indigo-500/10'
              }`}
              style={{ paddingLeft: `${Math.min(depth * 14 + 10, 96)}px` }}
              onClick={() => setSelectedTag(isSelected ? null : child.fullPath)}
            >
              <div className="flex items-center space-x-2 truncate cursor-pointer select-none">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedPaths((prev) => ({ ...prev, [child.fullPath]: !isCollapsed }));
                    }}
                    className="sn-muted hover:sn-text p-0.5 rounded shrink-0"
                  >
                    {isCollapsed ? (
                      <Folder className="w-3.5 h-3.5" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                  </button>
                ) : (
                  <Hash className="w-3 h-3 sn-muted shrink-0" />
                )}
                <span className="truncate font-medium" style={getDynamicFontSizeStyle(fontSizeLevel, 12)}>
                  {child.name}
                </span>
              </div>
              <span
                className="text-[11px] sn-muted font-mono tabular-nums shrink-0"
                style={getDynamicFontSizeStyle(fontSizeLevel, 10)}
              >
                {child.count}
              </span>
            </div>
            {!isCollapsed && hasChildren && (
              <div className="border-l sn-border ml-3.5">{renderTagNodes(child, depth + 1)}</div>
            )}
          </div>
        );
      });
  };

  const allFolders = useMemo(() => {
    const foldersSet = new Set<string>();
    nonDeletedNotes.forEach((n) => {
      if (n.folder) foldersSet.add(n.folder);
    });
    return Array.from(foldersSet);
  }, [nonDeletedNotes]);

  const filteredNotes = useMemo(() => {
    return nonDeletedNotes
      .filter((note) => {
        const matchesSearch =
          note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          note.content.toLowerCase().includes(searchQuery.toLowerCase());

        let matchesTag = true;
        if (selectedTag) {
          const noteTagsSet = new Set<string>();
          const content = note.content || '';
          const matches = content.match(/(^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
          if (matches) {
            matches.forEach((m) => {
              const t = m.trim().substring(1);
              if (!t.endsWith('/') && t.length > 0) noteTagsSet.add(t);
            });
          }
          (noteTagsMap[note.id] || []).forEach((t) => noteTagsSet.add(t));
          matchesTag = Array.from(noteTagsSet).some(
            (t) => t === selectedTag || t.startsWith(`${selectedTag}/`)
          );
        }

        let matchesFolder = true;
        if (selectedFolder) {
          matchesFolder = note.folder === selectedFolder;
        }

        return matchesSearch && matchesTag && matchesFolder;
      })
      .sort((a, b) => b.updated_at - a.updated_at);
  }, [nonDeletedNotes, searchQuery, selectedTag, selectedFolder, noteTagsMap]);

  if (!isOpen) return null;

  return (
    <div className="w-80 shrink-0 sn-panel border-r sn-border flex flex-col overflow-hidden select-none">
      {/* SECTION HEADER */}
      <div className="h-14 px-4 border-b sn-border flex items-center justify-between shrink-0 sn-panel">
        <h2 className="text-sm font-bold sn-text flex items-center gap-2">
          {navState === 'notes' && <FileText className="w-4 h-4 text-indigo-500" />}
          {navState === 'tags' && <Tag className="w-4 h-4 text-pink-500" />}
          {navState === 'calendar' && <Calendar className="w-4 h-4 text-emerald-500" />}
          {navState === 'settings' && <Sliders className="w-4 h-4 text-sky-500" />}
          {navState === 'about' && <Info className="w-4 h-4 text-sky-500" />}
          {navState === 'tools' && <Rocket className="w-4 h-4 text-amber-500" />}
          <span>
            {navState === 'notes'
              ? '笔记列表'
              : navState === 'tags'
              ? '多级标签目录'
              : navState === 'calendar'
              ? '日程列表'
              : navState === 'settings'
              ? '系统设置'
              : navState === 'about'
              ? '关于与版本'
              : '系统工具'}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="sn-muted hover:sn-text p-1 rounded"
          aria-label="收起列表"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Inline input form when triggered */}
      {inlineAction && (
        <form
          onSubmit={handleSubmitInlineAction}
          className="p-3 sn-surface border-b sn-border space-y-2 text-xs"
        >
          <div className="font-semibold sn-text">
            {inlineAction.type === 'new-folder'
              ? '新建文件夹名称'
              : inlineAction.type === 'batch-folder'
              ? '批量归入文件夹（留空移至未分类）'
              : inlineAction.type === 'batch-tag'
              ? '批量附加标签（如 工作/汇报）'
              : inlineAction.type === 'note-tag'
              ? '为笔记添加标签'
              : inlineAction.type === 'new-tag'
              ? '新建多级标签（如 阅读/书单）'
              : '批量导入标签（以 # 开头，空格分隔）'}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              autoFocus
              value={inlineValue}
              onChange={(e) => setInlineValue(e.target.value)}
              placeholder="输入内容..."
              className="flex-1 h-7 px-2 sn-input border rounded text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-2.5 h-7 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold"
            >
              确定
            </button>
            <button
              type="button"
              onClick={() => setInlineAction(null)}
              className="px-2 h-7 sn-muted hover:sn-text"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {navState === 'notes' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 shrink-0 space-y-3 border-b sn-border">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCreateNote(undefined, undefined, selectedFolder || undefined)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-500 border border-indigo-500/30 font-semibold text-xs transition-colors"
                style={getDynamicFontSizeStyle(fontSizeLevel, 12)}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>笔记</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCreateNote('白板', '[]', selectedFolder || undefined, { type: 'whiteboard' })
                }
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 border border-emerald-500/30 font-semibold text-xs transition-colors"
                style={getDynamicFontSizeStyle(fontSizeLevel, 12)}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>白板</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCreateNote('导图', '', selectedFolder || undefined, { type: 'mindmap' })
                }
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 border border-rose-500/30 font-semibold text-xs transition-colors"
                style={getDynamicFontSizeStyle(fontSizeLevel, 12)}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>导图</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsBatchMode(!isBatchMode);
                  setSelectedNoteIds({});
                  setConfirmBatchDelete(false);
                }}
                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                  isBatchMode
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : 'sn-surface sn-border-strong sn-muted hover:sn-text'
                }`}
                style={getDynamicFontSizeStyle(fontSizeLevel, 11)}
              >
                {isBatchMode ? '退出批量' : '批量操作'}
              </button>
              <span className="text-xs sn-muted font-mono tabular-nums">
                {filteredNotes.length} 篇
              </span>
            </div>

            {isBatchMode && (
              <div className="p-2.5 sn-surface border sn-border rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs sn-muted">
                  <span>
                    已选{' '}
                    <strong className="text-indigo-500 tabular-nums">
                      {Object.values(selectedNoteIds).filter(Boolean).length}
                    </strong>{' '}
                    篇
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        filteredNotes.forEach((n) => (next[n.id] = true));
                        setSelectedNoteIds(next);
                      }}
                      className="text-indigo-500 hover:underline font-medium"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedNoteIds({})}
                      className="sn-muted hover:underline"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (!filteredNotes.some((n) => selectedNoteIds[n.id])) return;
                      setInlineAction({ type: 'batch-folder' });
                      setInlineValue('');
                    }}
                    className="py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded"
                  >
                    归档
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!filteredNotes.some((n) => selectedNoteIds[n.id])) return;
                      setInlineAction({ type: 'batch-tag' });
                      setInlineValue('');
                    }}
                    className="py-1 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded"
                  >
                    贴签
                  </button>
                  {!confirmBatchDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!filteredNotes.some((n) => selectedNoteIds[n.id])) return;
                        setConfirmBatchDelete(true);
                      }}
                      className="py-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded"
                    >
                      删除
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        filteredNotes
                          .filter((n) => selectedNoteIds[n.id])
                          .forEach((n) => handleDeleteNote(n.id));
                        setSelectedNoteIds({});
                        setIsBatchMode(false);
                        setConfirmBatchDelete(false);
                      }}
                      className="py-1 bg-rose-700 text-white font-bold rounded"
                    >
                      确认删
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedTag && !isBatchMode && (
              <div className="text-xs bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 px-2.5 py-1.5 rounded-lg flex items-center justify-between">
                <span className="truncate">
                  标签筛选: <strong>#{selectedTag}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="hover:text-rose-500 font-bold pl-2 shrink-0"
                >
                  清除
                </button>
              </div>
            )}

            {/* Folders */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold sn-muted">文件夹</span>
                <button
                  type="button"
                  onClick={() => {
                    setInlineAction({ type: 'new-folder' });
                    setInlineValue('');
                  }}
                  className="text-[11px] text-indigo-500 hover:underline font-semibold"
                >
                  + 新建
                </button>
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    selectedFolder === null
                      ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                      : 'sn-surface sn-muted sn-border hover:sn-text'
                  }`}
                >
                  全部 ({nonDeletedNotes.length})
                </button>
                {allFolders.map((folderName) => {
                  const count = nonDeletedNotes.filter((n) => n.folder === folderName).length;
                  return (
                    <button
                      key={folderName}
                      type="button"
                      onClick={() =>
                        setSelectedFolder(folderName === selectedFolder ? null : folderName)
                      }
                      className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                        selectedFolder === folderName
                          ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                          : 'sn-surface sn-muted sn-border hover:sn-text'
                      }`}
                    >
                      <span className="truncate max-w-[85px]">{folderName}</span>
                      <span className="font-mono tabular-nums opacity-75">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto divide-y sn-border">
            {filteredNotes.length === 0 ? (
              <div className="p-10 text-center sn-muted text-xs flex flex-col items-center justify-center space-y-2">
                <FileText className="w-8 h-8 opacity-30" />
                <p>无匹配笔记</p>
              </div>
            ) : (
              filteredNotes.map((note) => {
                const summaryText = note.content
                  .replace(/#[a-zA-Z0-9_\u4e00-\u9fa5/]+/g, '')
                  .replace(/[#*`>-]/g, '')
                  .trim()
                  .slice(0, 48);

                const noteTagsMatches = note.content.match(/(?:^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5/]+)/g);
                const inlineNoteTags = noteTagsMatches
                  ? noteTagsMatches.map((m) => m.trim().substring(1))
                  : [];
                const combinedTags = Array.from(
                  new Set([...inlineNoteTags, ...(noteTagsMap[note.id] || [])])
                );

                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      if (isBatchMode) {
                        setSelectedNoteIds((prev) => ({ ...prev, [note.id]: !prev[note.id] }));
                      } else {
                        setActiveNoteId(note.id);
                      }
                    }}
                    className={`p-3.5 cursor-pointer border-l-2 transition-colors group ${
                      note.id === activeNoteId
                        ? 'sn-surface border-indigo-500 sn-text'
                        : 'border-transparent sn-text-secondary hover:bg-indigo-500/5'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-1.5 truncate flex-1">
                        {isBatchMode && (
                          <input
                            type="checkbox"
                            checked={!!selectedNoteIds[note.id]}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedNoteIds((prev) => ({
                                ...prev,
                                [note.id]: e.target.checked,
                              }));
                            }}
                            className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
                          />
                        )}
                        <h4
                          className="font-bold truncate sn-text"
                          style={getDynamicFontSizeStyle(fontSizeLevel, 12)}
                        >
                          {note.title || '无标题'}
                        </h4>
                      </div>
                      {confirmDeleteNoteId === note.id ? (
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              handleDeleteNote(note.id);
                              setConfirmDeleteNoteId(null);
                            }}
                            className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                          >
                            确认删
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteNoteId(null)}
                            className="px-1.5 py-0.5 rounded sn-elevated sn-muted hover:sn-text text-[10px]"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteNoteId(note.id);
                          }}
                          className="sn-muted hover:text-rose-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="删除笔记"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p
                      className="sn-muted mt-1 line-clamp-2 leading-relaxed"
                      style={getDynamicFontSizeStyle(fontSizeLevel, 11)}
                    >
                      {summaryText || '点击编辑笔记内容...'}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {combinedTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] text-indigo-500 font-medium truncate max-w-[90px]"
                          title={`#${tag}`}
                        >
                          #{tag.substring(tag.lastIndexOf('/') + 1)}
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInlineAction({ type: 'note-tag', noteId: note.id });
                          setInlineValue('');
                        }}
                        className="text-[10px] sn-muted hover:text-indigo-500 font-medium"
                      >
                        + 贴签
                      </button>
                    </div>

                    <div
                      className="flex items-center justify-between sn-muted mt-2 font-mono tabular-nums"
                      style={getDynamicFontSizeStyle(fontSizeLevel, 10)}
                    >
                      <span>
                        {new Date(note.updated_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      {note.folder && <span className="truncate max-w-[90px]">{note.folder}</span>}
                      <span>{note.content.length} 字</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAGS DIRECTORY */}
      {navState === 'tags' && (
        <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3">
          <div className="flex items-center gap-2 justify-between shrink-0">
            <span className="text-[11px] font-semibold sn-muted">多级标签（最多6级）</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setInlineAction({ type: 'new-tag' });
                  setInlineValue('');
                }}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold"
              >
                + 新增
              </button>
              <button
                type="button"
                onClick={() => {
                  setInlineAction({ type: 'import-tags' });
                  setInlineValue('');
                }}
                className="px-2 py-1 sn-surface border sn-border-strong text-indigo-500 rounded text-[11px] font-semibold flex items-center gap-1"
              >
                <Upload className="w-3 h-3" /> 导入
              </button>
              <button
                type="button"
                onClick={exportTags}
                className="px-2 py-1 sn-surface border sn-border-strong text-indigo-500 rounded text-[11px] font-semibold flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> 导出
              </button>
            </div>
          </div>

          <div className="flex-1 sn-surface rounded-xl border sn-border p-2 overflow-y-auto space-y-1">
            {Object.keys(tagTree.children).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center sn-muted space-y-2">
                <Tag className="w-8 h-8 opacity-20" />
                <p className="text-xs font-semibold">暂无标签</p>
                <p className="text-[11px] opacity-75">在笔记中输入 #工作/开发 即可自动构建多级目录</p>
              </div>
            ) : (
              renderTagNodes(tagTree)
            )}
          </div>
        </div>
      )}

      {/* CALENDAR EVENTS SIDE LIST */}
      {navState === 'calendar' && (
        <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3">
          <div className="flex items-center justify-between shrink-0 sn-muted text-xs">
            <span className="font-bold sn-text">日程计划总览</span>
            <span className="font-mono tabular-nums">{customEvents.length} 项</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            {customEvents.length === 0 ? (
              <p className="text-xs sn-muted text-center py-8">暂无日程，点击日历日期可新增。</p>
            ) : (
              customEvents.map((evt) => {
                const matchedNote = notes.find((n) => n.id === evt.noteId && !n.deleted);
                return (
                  <div
                    key={evt.id}
                    className="sn-surface p-3 rounded-lg border sn-border space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-xs sn-text">{evt.title}</h4>
                        <p className="text-[11px] sn-muted font-mono tabular-nums mt-0.5">
                          {evt.date}
                        </p>
                      </div>
                      {evt.noteId && (
                        <span className="text-[11px] text-indigo-500 font-medium shrink-0">
                          已关联笔记
                        </span>
                      )}
                    </div>

                    {evt.noteId && matchedNote ? (
                      <button
                        type="button"
                        onClick={() => setActiveNoteId(matchedNote.id)}
                        className="w-full text-left px-2.5 py-1.5 sn-elevated border sn-border hover:border-indigo-500 rounded text-[11px] text-indigo-500 flex items-center justify-between truncate"
                      >
                        <span className="truncate">打开：{matchedNote.title}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 ml-1" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const title = `关于 ${evt.title} 的日程笔记`;
                          const content = `# ${evt.title}\n\n时间: ${evt.date}\n\n#${evt.date}\n\n记录日程要点...`;
                          handleCreateNote(title, content);
                        }}
                        className="text-[11px] py-1 px-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 rounded border border-indigo-500/20 font-semibold"
                      >
                        + 创建关联笔记
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SETTINGS CATEGORIES */}
      {navState === 'settings' && (
        <div className="flex-1 flex flex-col p-3 overflow-y-auto space-y-1.5">
          <div className="px-2 py-2 text-[11px] font-bold sn-muted uppercase tracking-wider border-b sn-border mb-1">
            设置分类
          </div>
          {(
            [
              { id: 'ai', label: 'AI 模型与自定义接口', icon: Bot, desc: '多模型预设切换与 API 配置' },
              { id: 'general', label: '通用与设备适配', icon: Sliders, desc: '真机预设、端口探测、缓存管理' },
              { id: 'appearance', label: '外观主题', icon: Sliders, desc: '日间 / 夜间高对比度视觉切换' },
              { id: 'editor', label: '编辑器与排版', icon: FileText, desc: '全局五级无障碍字号' },
              { id: 'calendar', label: '日历模块', icon: Calendar, desc: '农历干支与笔记双向联动' },
              { id: 'sync', label: '同步与备份中心', icon: HardDrive, desc: 'LWW · WebDAV · FTP · 日志' },
              { id: 'about', label: '关于与架构', icon: Info, desc: '离线自治与数据主权原则' },
            ] as const
          ).map((cat) => {
            const IconComp = cat.icon;
            const isSelected = activeSettingsTab === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveSettingsTab(cat.id)}
                className={`w-full text-left p-3 rounded-xl transition-colors cursor-pointer flex items-start gap-3 border ${
                  isSelected
                    ? 'bg-indigo-600/15 border-indigo-500/40 sn-text'
                    : 'border-transparent sn-muted hover:sn-surface hover:sn-text'
                }`}
              >
                <IconComp
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    isSelected ? 'text-indigo-500' : 'sn-muted'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-bold ${
                      isSelected ? 'text-indigo-500' : 'sn-text'
                    }`}
                  >
                    {cat.label}
                  </div>
                  <div className="text-[11px] sn-muted truncate mt-0.5">{cat.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
