import { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import {
  AiCustomCommand,
  AiModelPreset,
  CalendarEvent,
  FtpConfig,
  MindmapNode,
  NavState,
  Note,
  SettingsTab,
  WebDavConfig,
} from '../types';
import { parseMarkdown } from '../utils/markdown';
import {
  loadActivePresetId,
  loadAiPresets,
  loadCustomAiCommands,
  resetCustomAiCommands,
  saveActivePresetId,
  saveAiPresets,
  saveCustomAiCommands,
} from '../lib/ai';
import NoteEditor from './NoteEditor';
import AiAssistantDrawer from './AiAssistantDrawer';
import CalendarView from './CalendarView';
import SettingsView from './SettingsView';
import ToolsView from './ToolsView';
import { ToastBanner, ToastNotice } from './UiFeedback';

interface MainAreaProps {
  navState: NavState;
  activeNote: Note | null;
  updateActiveNote: (title: string, content: string, extraFields?: Partial<Note>) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
  customEvents: CalendarEvent[];
  setCustomEvents: (events: CalendarEvent[]) => void;
  webdavConfig: WebDavConfig;
  setWebdavConfig: (cfg: WebDavConfig) => void;
  ftpConfig?: FtpConfig;
  setFtpConfig?: (cfg: FtpConfig) => void;
  uiScale?: number;
  setUiScale?: (scale: number) => void;
  customFestivals: Record<string, string>;
  setCustomFestivals: (festivals: Record<string, string>) => void;
  notes: Note[];
  setNotes?: (notes: Note[]) => void;
  handleCreateNote: (
    initialTitle?: string,
    initialContent?: string,
    folder?: string,
    extraFields?: Partial<Note>
  ) => void;
  setActiveNoteId: (id: string | null) => void;
  setNavState: (state: NavState) => void;
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  isPartitionOpen: boolean;
  setIsPartitionOpen: (open: boolean) => void;
  themeMode: 'day' | 'night';
  setThemeMode: (mode: 'day' | 'night') => void;
  deviceProfile: string;
  applyDevicePreset: (profile: string) => void;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  independentTags: string[];
  setIndependentTags: (tags: string[]) => void;
  noteTagsMap: Record<string, string[]>;
  setNoteTagsMap: (map: Record<string, string[]>) => void;
  activeSettingsTab: SettingsTab;
  setActiveSettingsTab: (tab: SettingsTab) => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
}

const RELEASE_VERSION = 'v3.2.2';
const RELEASE_CHANGELOG =
  '## SovereignNote 核心更新\n\n- **自定义 AI 助手与多模型预设**: 支持笔记润色、续写、摘要、纠错翻译、侧栏上下文对话、一键生成思维导图以及自动提取标签与日程。\n- **日夜主题对比度优化**: 全面采用语义化色彩变量，确保日间与夜间模式均清晰舒适。';

export default function MainArea({
  navState,
  activeNote,
  updateActiveNote,
  fontSizeLevel,
  setFontSizeLevel,
  customEvents,
  setCustomEvents,
  webdavConfig,
  setWebdavConfig,
  ftpConfig,
  setFtpConfig,
  uiScale = 1.0,
  setUiScale,
  customFestivals,
  setCustomFestivals,
  notes,
  setNotes,
  handleCreateNote,
  setActiveNoteId,
  setNavState,
  handleExportDatabase,
  handleImportDatabase,
  isPartitionOpen,
  setIsPartitionOpen,
  themeMode,
  setThemeMode,
  deviceProfile,
  applyDevicePreset,
  activeTool,
  setActiveTool,
  independentTags,
  setIndependentTags,
  noteTagsMap,
  setNoteTagsMap,
  activeSettingsTab,
  setActiveSettingsTab,
  searchQuery,
  setSearchQuery,
}: MainAreaProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const effectiveSearchQuery = searchQuery !== undefined ? searchQuery : localSearchQuery;
  const handleSearchChange = (q: string) => {
    if (setSearchQuery) setSearchQuery(q);
    else setLocalSearchQuery(q);
  };

  // Non-blocking toast queue
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const notify = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: 'success' | 'error' | 'info'; message?: string }>).detail;
      if (detail?.message) {
        notify(detail.type || 'info', detail.message);
      }
    };
    window.addEventListener('sovereign-toast', handler);
    return () => window.removeEventListener('sovereign-toast', handler);
  }, [notify]);

  // Multi-model AI preset state
  const [presets, setPresets] = useState<AiModelPreset[]>(() => loadAiPresets());
  const [activePresetId, setActivePresetId] = useState<string>(() =>
    loadActivePresetId(loadAiPresets())
  );
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  // Shared custom AI commands state (synced across NoteEditor, AiAssistantDrawer, SettingsView)
  const [customCommands, setCustomCommands] = useState<AiCustomCommand[]>(() =>
    loadCustomAiCommands()
  );

  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0];

  const handleSelectPreset = (id: string) => {
    setActivePresetId(id);
    saveActivePresetId(id);
  };

  const handleUpsertPreset = (preset: AiModelPreset) => {
    setPresets((prev) => {
      const exists = prev.some((p) => p.id === preset.id);
      const next = exists ? prev.map((p) => (p.id === preset.id ? preset : p)) : [...prev, preset];
      saveAiPresets(next);
      return next;
    });
  };

  const handleBatchAddPresets = (newPresets: AiModelPreset[]) => {
    if (newPresets.length === 0) return;
    setPresets((prev) => {
      const existingKeys = new Set(
        prev.map((p) => `${p.protocol}::${p.baseUrl.trim()}::${p.model.trim()}`)
      );
      const toAdd = newPresets.filter(
        (p) => !existingKeys.has(`${p.protocol}::${p.baseUrl.trim()}::${p.model.trim()}`)
      );
      if (toAdd.length === 0) return prev;
      const next = [...prev, ...toAdd];
      saveAiPresets(next);
      return next;
    });
  };

  const handleDeletePreset = (id: string) => {
    setPresets((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((p) => p.id !== id);
      saveAiPresets(next);
      if (activePresetId === id && next[0]) {
        handleSelectPreset(next[0].id);
      }
      return next;
    });
  };

  const handleUpsertCustomCommand = (cmd: AiCustomCommand) => {
    setCustomCommands((prev) => {
      const exists = prev.some((c) => c.id === cmd.id);
      const next = exists ? prev.map((c) => (c.id === cmd.id ? cmd : c)) : [...prev, cmd];
      saveCustomAiCommands(next);
      return next;
    });
  };

  const handleDeleteCustomCommand = (id: string) => {
    setCustomCommands((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveCustomAiCommands(next);
      return next;
    });
  };

  const handleResetCustomCommands = () => {
    const defaults = resetCustomAiCommands();
    setCustomCommands(defaults);
  };

  const handleInsertIntoActiveNote = (text: string) => {
    if (!activeNote) return;
    const sep = activeNote.content.trim() ? '\n\n' : '';
    updateActiveNote(activeNote.title, `${activeNote.content}${sep}${text}`, {});
  };

  const handleCreateMindmapNote = (title: string, nodes: MindmapNode[]) => {
    handleCreateNote(title, '', activeNote?.folder, {
      type: 'mindmap',
      mindmapData: { nodes },
    });
    setNavState('notes');
  };

  const handleUpdateActiveMindmap = (nodes: MindmapNode[]) => {
    if (!activeNote) return;
    updateActiveNote(activeNote.title, activeNote.content, {
      type: 'mindmap',
      mindmapData: { nodes },
    });
  };

  let contentView: React.ReactNode = null;

  if (navState === 'about') {
    contentView = (
      <div className="flex-1 flex flex-col sn-canvas border-l sn-border sn-text overflow-y-auto w-full min-w-0">
        <div className="h-14 px-6 lg:px-8 border-b sn-border flex items-center shrink-0 justify-between sn-panel">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-sky-500" />
            <h1 className="font-bold sn-text">关于与系统更新日志</h1>
          </div>
          <div className="sn-muted text-xs font-mono">{RELEASE_VERSION}</div>
        </div>

        <div className="p-6 lg:p-8 max-w-3xl space-y-6 mx-auto w-full">
          <div className="sn-panel border sn-border p-8 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-black">
              S
            </div>
            <div>
              <h2 className="text-xl font-bold sn-text">SovereignNote</h2>
              <p className="text-xs sn-muted mt-1 font-mono">Version: {RELEASE_VERSION}</p>
            </div>
            <p className="text-xs sn-muted leading-relaxed max-w-lg">
              离线优先、主权自治的跨平台个人知识库，内置 Markdown、思维导图、白板、农历日程与自定义 AI 协作套件。
            </p>
          </div>

          <div className="p-6 sn-panel rounded-xl border sn-border space-y-3">
            <div
              className="text-sm leading-7 max-w-none"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(RELEASE_CHANGELOG) }}
            />
          </div>
        </div>
      </div>
    );
  } else if (navState === 'settings') {
    contentView = (
      <SettingsView
        activeSettingsTab={activeSettingsTab}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        deviceProfile={deviceProfile}
        applyDevicePreset={applyDevicePreset}
        uiScale={uiScale}
        setUiScale={setUiScale}
        fontSizeLevel={fontSizeLevel}
        setFontSizeLevel={setFontSizeLevel}
        notes={notes}
        setNotes={setNotes}
        customEvents={customEvents}
        setCustomEvents={setCustomEvents}
        customFestivals={customFestivals}
        independentTags={independentTags}
        setIndependentTags={setIndependentTags}
        noteTagsMap={noteTagsMap}
        setNoteTagsMap={setNoteTagsMap}
        webdavConfig={webdavConfig}
        setWebdavConfig={setWebdavConfig}
        ftpConfig={ftpConfig}
        setFtpConfig={setFtpConfig}
        handleExportDatabase={handleExportDatabase}
        handleImportDatabase={handleImportDatabase}
        presets={presets}
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        onUpsertPreset={handleUpsertPreset}
        onBatchAddPresets={handleBatchAddPresets}
        onDeletePreset={handleDeletePreset}
        customCommands={customCommands}
        onUpsertCustomCommand={handleUpsertCustomCommand}
        onDeleteCustomCommand={handleDeleteCustomCommand}
        onResetCustomCommands={handleResetCustomCommands}
        notify={notify}
        releaseVersion={RELEASE_VERSION}
      />
    );
  } else if (navState === 'tools') {
    contentView = (
      <ToolsView
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        notes={notes}
        customEvents={customEvents}
        webdavConfig={webdavConfig}
        ftpConfig={ftpConfig}
        handleExportDatabase={handleExportDatabase}
        handleImportDatabase={handleImportDatabase}
        setNavState={setNavState}
        fontSizeLevel={fontSizeLevel}
        setFontSizeLevel={setFontSizeLevel}
        uiScale={uiScale}
        setUiScale={setUiScale}
        deviceProfile={deviceProfile}
        applyDevicePreset={applyDevicePreset}
        notify={notify}
      />
    );
  } else if (navState === 'calendar') {
    contentView = (
      <CalendarView
        navState={navState}
        setNavState={setNavState}
        notes={notes}
        setActiveNoteId={setActiveNoteId}
        customEvents={customEvents}
        setCustomEvents={setCustomEvents}
        customFestivals={customFestivals}
        setCustomFestivals={setCustomFestivals}
        noteTagsMap={noteTagsMap}
        handleCreateNote={handleCreateNote}
        notify={notify}
      />
    );
  } else {
    contentView = (
      <div className="flex-1 flex overflow-hidden min-w-0">
        <NoteEditor
          activeNote={activeNote}
          notes={notes}
          updateActiveNote={updateActiveNote}
          fontSizeLevel={fontSizeLevel}
          isPartitionOpen={isPartitionOpen}
          setIsPartitionOpen={setIsPartitionOpen}
          setActiveNoteId={setActiveNoteId}
          setNavState={setNavState}
          noteTagsMap={noteTagsMap}
          setNoteTagsMap={setNoteTagsMap}
          independentTags={independentTags}
          setIndependentTags={setIndependentTags}
          searchQuery={effectiveSearchQuery}
          setSearchQuery={handleSearchChange}
          activePreset={activePreset}
          isAiDrawerOpen={isAiDrawerOpen}
          setIsAiDrawerOpen={setIsAiDrawerOpen}
          customCommands={customCommands}
          onUpsertCustomCommand={handleUpsertCustomCommand}
          onDeleteCustomCommand={handleDeleteCustomCommand}
          notify={notify}
        />
        <AiAssistantDrawer
          isOpen={isAiDrawerOpen}
          onClose={() => setIsAiDrawerOpen(false)}
          presets={presets}
          activePresetId={activePresetId}
          onSelectPreset={handleSelectPreset}
          onOpenAiSettings={() => {
            setNavState('settings');
            setActiveSettingsTab('ai');
          }}
          activeNote={activeNote}
          notes={notes}
          onInsertIntoActiveNote={handleInsertIntoActiveNote}
          onCreateMindmapNote={handleCreateMindmapNote}
          onUpdateActiveMindmap={handleUpdateActiveMindmap}
          noteTagsMap={noteTagsMap}
          setNoteTagsMap={setNoteTagsMap}
          independentTags={independentTags}
          setIndependentTags={setIndependentTags}
          customEvents={customEvents}
          setCustomEvents={setCustomEvents}
          customCommands={customCommands}
          onUpsertCustomCommand={handleUpsertCustomCommand}
          onDeleteCustomCommand={handleDeleteCustomCommand}
          notify={notify}
        />
      </div>
    );
  }

  return (
    <>
      {contentView}
      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
