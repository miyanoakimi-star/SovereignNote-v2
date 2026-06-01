import { useState, useEffect, useMemo } from 'react';
import { NavState, Note } from './types';
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

  useEffect(() => {
    const cached = getLocalNotes();
    setNotes(cached);
    if (cached.length > 0) {
      const active = cached.find(n => !n.deleted);
      if (active) setActiveNoteId(active.id);
    }
  }, []);

  const activeNote = useMemo(() => {
    return notes.find(n => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  function updateActiveNote(title: string, content: string) {
    if (!activeNoteId) return;
    const now = Date.now();
    const updated = notes.map(n => {
      if (n.id === activeNoteId) {
        return { ...n, title, content, updated_at: now };
      }
      return n;
    });
    setNotes(updated);
    saveLocalNotes(updated);
  }

  function handleCreateNote() {
    const now = Date.now();
    const newNote: Note = {
      id: generateUUID(),
      title: 'Untitled Note',
      content: '# Untitled Note\n\nStart writing...',
      created_at: now,
      updated_at: now,
      deleted: false,
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    saveLocalNotes(updated);
    setActiveNoteId(newNote.id);
    if (!isPartitionOpen) setIsPartitionOpen(true);
  }

  function handleDeleteNote(id: string) {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
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
      />

      <MainArea 
        navState={navState}
        activeNote={activeNote}
        updateActiveNote={updateActiveNote}
      />
    </div>
  );
}
