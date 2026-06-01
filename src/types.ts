export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  deleted: boolean;
  tags?: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  noteId: string | null; // Associated note ID
  isCustomFestival?: boolean;
}

export type NavState = 'notes' | 'tags' | 'calendar' | 'settings' | 'releases';
