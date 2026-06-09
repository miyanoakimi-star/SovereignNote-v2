export interface Note {
  id: string;
  title: string;
  content: string;
  type?: 'markdown' | 'mindmap' | 'whiteboard';
  created_at: number;
  updated_at: number;
  deleted: boolean;
  tags?: string[];
  tagIds?: string[];
  folder?: string;
  mindmapData?: MindmapPayload;
}

export interface MindmapPayload {
  nodes: MindmapNode[];
}

export interface MindmapNode {
  id: string;
  label: string;
  parentId: string | null;
  direction?: 'left' | 'right';
  x?: number;
  y?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  noteId: string | null; // Associated note ID
  isCustomFestival?: boolean;
}

export type NavState = 'notes' | 'tags' | 'calendar' | 'settings' | 'releases' | 'tools';
