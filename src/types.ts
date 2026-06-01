export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  deleted: boolean;
  tags?: string[];
}

export type NavState = 'notes' | 'tags' | 'calendar' | 'settings';
