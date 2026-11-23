export type NoteType = 'markdown' | 'mindmap' | 'whiteboard';

export interface Note {
  id: string;
  title: string;
  content: string;
  type?: NoteType;
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

export interface WebDavConfig {
  url: string;
  port: string;
  path: string;
  username: string;
  password: string;
}

export interface FtpConfig {
  host: string;
  port?: string | number;
  user: string;
  pass: string;
  path: string;
  secure: boolean;
}

export interface SyncLogEntry {
  id?: number;
  timestamp: string;
  level: string;
  message: string;
  session_id?: string;
  protocol?: string;
  step?: string;
}

export interface ProbeLogItem {
  timestamp?: string;
  status?: string;
  level?: string;
  message: string;
  step?: string;
  layer?: string;
}

export type NavState = 'notes' | 'tags' | 'calendar' | 'settings' | 'about' | 'tools';

export type SettingsTab = 'general' | 'appearance' | 'editor' | 'calendar' | 'ai' | 'sync' | 'about';

export type AiProtocol = 'server-gemini' | 'openai' | 'gemini-custom';

export interface AiModelPreset {
  id: string;
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  directBrowser?: boolean;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AiExtractedSuggestions {
  tags: string[];
  events: Array<{
    title: string;
    date: string;
    reason?: string;
  }>;
}

export interface FetchedAiModel {
  id: string;
  displayName?: string;
  ownedBy?: string;
}

export interface AiCustomCommand {
  id: string;
  name: string;
  prompt: string;
  updatedAt: number;
}
