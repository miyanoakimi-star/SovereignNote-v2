import { useState, useEffect, useMemo } from 'react';
import { NavState, Note, CalendarEvent } from './types';
import Sidebar from './components/Sidebar';
import PartitionBar from './components/PartitionBar';
import MainArea from './components/MainArea';
import { getLocalNotes, saveLocalNotes } from './lib/api';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function App() {
  const [navState, setNavState] = useState<NavState>('notes');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isPartitionOpen, setIsPartitionOpen] = useState<boolean>(true);

  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Custom states matching requested requirements
  const [fontSizeLevel, setFontSizeLevel] = useState<number>(() => {
    const saved = localStorage.getItem('sovereign_font_size');
    return saved ? parseInt(saved, 10) : 2; // default: 2 (Normal)
  });

  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('sovereign_events');
    return saved ? JSON.parse(saved) : [
      { id: 'event-1', title: '✈️ 飞往东京', date: '2026-05-16', noteId: null },
      { id: 'event-2', title: '🎉 App 发布会', date: '2026-05-10', noteId: null },
    ];
  });

  const [webdavConfig, setWebdavConfig] = useState(() => {
    const saved = localStorage.getItem('sovereign_webdav');
    return saved ? JSON.parse(saved) : {
      url: 'https://dav.jianguoyun.com/dav',
      port: '443',
      path: '/SovereignNotes',
      username: '',
      password: '',
    };
  });

  const [customFestivals, setCustomFestivals] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('sovereign_custom_festivals');
    return saved ? JSON.parse(saved) : {};
  });

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  useEffect(() => {
    const cached = getLocalNotes();
    setNotes(cached);
    if (cached.length > 0) {
      const active = cached.find(n => !n.deleted);
      if (active) setActiveNoteId(active.id);
    }
  }, []);

  // Sync settings when modified
  useEffect(() => {
    localStorage.setItem('sovereign_font_size', String(fontSizeLevel));
  }, [fontSizeLevel]);

  useEffect(() => {
    localStorage.setItem('sovereign_events', JSON.stringify(customEvents));
  }, [customEvents]);

  useEffect(() => {
    localStorage.setItem('sovereign_webdav', JSON.stringify(webdavConfig));
  }, [webdavConfig]);

  useEffect(() => {
    localStorage.setItem('sovereign_custom_festivals', JSON.stringify(customFestivals));
  }, [customFestivals]);

  const activeNote = useMemo(() => {
    return notes.find(n => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  function updateActiveNote(title: string, content: string, extraFields?: Partial<Note>) {
    if (!activeNoteId) return;
    const now = Date.now();
    const updated = notes.map(n => {
      if (n.id === activeNoteId) {
        return { ...n, title, content, ...extraFields, updated_at: now };
      }
      return n;
    });
    setNotes(updated);
    saveLocalNotes(updated);
  }

  function handleCreateNote(initialTitle?: string, initialContent?: string, folder?: string) {
    const now = Date.now();
    const newNote: Note = {
      id: generateUUID(),
      title: initialTitle || '无标题笔记',
      content: initialContent || '# 无标题笔记\n\n开始写作...',
      created_at: now,
      updated_at: now,
      deleted: false,
      folder: folder,
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    saveLocalNotes(updated);
    setActiveNoteId(newNote.id);
    if (!isPartitionOpen) setIsPartitionOpen(true);
  }

  function handleDeleteNote(id: string) {
    if (!window.confirm('确定要删除此笔记吗？')) return;
    const now = Date.now();
    const updated = notes.map(n => {
      if (n.id === id) return { ...n, deleted: true, updated_at: now };
      return n;
    });
    setNotes(updated);
    saveLocalNotes(updated);
    if (activeNoteId === id) {
      const nextActive = updated.find(n => !n.deleted);
      setActiveNoteId(nextActive ? nextActive.id : null);
    }
  }

  // Export full LWW state database as JSON
  function handleExportDatabase() {
    const data = {
      notes,
      customEvents,
      webdavConfig,
      fontSizeLevel,
      customFestivals,
      version: "1.0.0"
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sovereign_notes_db_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Import full database from JSON content
  function handleImportDatabase(jsonData: string) {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed.notes && Array.isArray(parsed.notes)) {
        // Merge notes using LWW algorithm
        const merged = [...parsed.notes, ...notes];
        // Ensure no duplicate IDs by using newest updated_at
        const uniqueMap: Record<string, Note> = {};
        for (const n of merged) {
          if (!uniqueMap[n.id] || n.updated_at > uniqueMap[n.id].updated_at) {
            uniqueMap[n.id] = n;
          }
        }
        const finalNotes = Object.values(uniqueMap);
        setNotes(finalNotes);
        saveLocalNotes(finalNotes);

        if (parsed.customEvents && Array.isArray(parsed.customEvents)) {
          setCustomEvents(parsed.customEvents);
        }
        if (parsed.webdavConfig) {
          setWebdavConfig(parsed.webdavConfig);
        }
        if (parsed.fontSizeLevel) {
          setFontSizeLevel(parsed.fontSizeLevel);
        }
        if (parsed.customFestivals) {
          setCustomFestivals(parsed.customFestivals);
        }
        alert("数据库同步备份导入成功！");
      } else {
        alert("导入失败：JSON 格式不兼容，缺少核心 notes 数据库。");
      }
    } catch (e: any) {
      alert("导入解析错误: " + e.message);
    }
  }

  // Batch import notes from diverse formats
  const handleImportNotesFromFiles = async (files: FileList | File[]) => {
    const now = Date.now();
    const newNotes: Note[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      let title = file.name.replace(/\.[^/.]+$/, ""); // strip extension
      let content = text;

      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            // Merge batch
            const merged = [...parsed, ...notes];
            setNotes(merged);
            saveLocalNotes(merged);
            alert(`成功导入 ${parsed.length} 条笔记！`);
            continue;
          } else if (parsed.title && parsed.content) {
            title = parsed.title;
            content = parsed.content;
          }
        } catch (e) {
          console.error("JSON parse error:", e);
        }
      } else if (file.name.endsWith('.html')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        content = doc.body.innerText || doc.body.textContent || text;
      } else if (file.name.endsWith('.md')) {
        const match = text.match(/^#\s+(.+)$/m);
        if (match) {
          title = match[1].trim();
        }
      }

      newNotes.push({
        id: generateUUID(),
        title,
        content,
        created_at: now,
        updated_at: now,
        deleted: false,
      });
    }

    if (newNotes.length > 0) {
      const updated = [...newNotes, ...notes];
      setNotes(updated);
      saveLocalNotes(updated);
      setActiveNoteId(newNotes[0].id);
      alert(`已成功批量导入 ${newNotes.length} 条笔记！`);
    }
  };

  return (
    <div className="h-screen flex bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-hidden">
      <Sidebar 
        navState={navState}
        setNavState={(state) => {
          setNavState(state);
          setIsPartitionOpen(true);
        }}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
      
      <PartitionBar 
        navState={navState}
        isOpen={isPartitionOpen}
        setIsOpen={setIsPartitionOpen}
        notes={notes}
        activeNoteId={activeNoteId}
        setActiveNoteId={setActiveNoteId}
        searchQuery={searchQuery}
        handleCreateNote={handleCreateNote}
        handleDeleteNote={handleDeleteNote}
        selectedTag={selectedTag}
        setSelectedTag={(tag) => {
          setSelectedTag(tag);
          setNavState('notes'); // switch to notes to show results
        }}
        selectedFolder={selectedFolder}
        setSelectedFolder={setSelectedFolder}
        fontSizeLevel={fontSizeLevel}
        setFontSizeLevel={setFontSizeLevel}
        customEvents={customEvents}
        handleExportDatabase={handleExportDatabase}
        handleImportDatabase={handleImportDatabase}
        handleImportNotesFromFiles={handleImportNotesFromFiles}
      />

      <MainArea 
        navState={navState}
        activeNote={activeNote}
        updateActiveNote={updateActiveNote}
        fontSizeLevel={fontSizeLevel}
        setFontSizeLevel={setFontSizeLevel}
        customEvents={customEvents}
        setCustomEvents={setCustomEvents}
        webdavConfig={webdavConfig}
        setWebdavConfig={setWebdavConfig}
        customFestivals={customFestivals}
        setCustomFestivals={setCustomFestivals}
        notes={notes}
        handleCreateNote={handleCreateNote}
        setActiveNoteId={setActiveNoteId}
        setNavState={setNavState}
        handleExportDatabase={handleExportDatabase}
        handleImportDatabase={handleImportDatabase}
        isPartitionOpen={isPartitionOpen}
        setIsPartitionOpen={setIsPartitionOpen}
      />
    </div>
  );
}

