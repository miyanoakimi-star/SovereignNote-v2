import { Note } from '../types';

/**
 * 动态获取后台 API 基址。
 * - 对于同一主机提供的 Web 服务，默认为相对路径 `/api`
 * - 对于 Capacitor (移动端) 或需要外挂同步的端点，可通过 localStorage 'sovereign_sync_url' 手动变更
 */
export function getApiBaseUrl(): string {
  const customUrl = localStorage.getItem('sovereign_sync_url');
  if (customUrl) {
    return customUrl.endsWith('/') ? customUrl.slice(0, -1) + '/api' : customUrl + '/api';
  }
  return '/api';
}

/**
  * 核心 LWW-Register 合并算法：
  * 在客户端和服务器两端对同一 Note ID 采取“最后写入者胜 (Last-Write-Wins)”策略进行合并。
  */
export function mergeNotesLWW(clientNotes: Note[], serverNotes: Note[]): Note[] {
  const noteMap = new Map<string, Note>();

  // 1. 植入客户端现存记录
  for (const note of clientNotes) {
    noteMap.set(note.id, note);
  }

  // 2. 将服务端同步的数据依 LWW 合入
  for (const serverNote of serverNotes) {
    const clientNote = noteMap.get(serverNote.id);
    if (!clientNote) {
      noteMap.set(serverNote.id, serverNote);
    } else {
      // 比较上次更新时间戳 (LWW)
      if (serverNote.updated_at > clientNote.updated_at) {
        noteMap.set(serverNote.id, serverNote);
      }
    }
  }

  return Array.from(noteMap.values());
}

/**
 * 从本地 localStorage 读取 notes (包括已被标记删除的 notes 以确保 tombstone 同步成功)
 */
export function getLocalNotes(): Note[] {
  try {
    const data = localStorage.getItem('sovereign_notes');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse local notes:', e);
    return [];
  }
}

/**
 * 写入本地 localStorage
 */
export function saveLocalNotes(notes: Note[]): void {
  localStorage.setItem('sovereign_notes', JSON.stringify(notes));
}

/**
 * 同步网络层：将本地更改同步至 Rust 后台
 */
export async function syncWithBackend(): Promise<{ success: boolean; notes: Note[]; error?: string }> {
  const localNotes = getLocalNotes();

  try {
    const response = await fetch(`${getApiBaseUrl()}/notes/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(localNotes),
    });

    if (!response.ok) {
      throw new Error(`Sync request failed with status: ${response.status}`);
    }

    const serverNotes: Note[] = await response.json();

    // 在客户端合并两端最新、最全的代码数据
    const merged = mergeNotesLWW(localNotes, serverNotes);
    saveLocalNotes(merged);

    return { success: true, notes: merged };
  } catch (err: any) {
    console.warn('Sync connection failed. Running in standalone local mode:', err.message);
    return { success: false, notes: localNotes, error: err.message };
  }
}
