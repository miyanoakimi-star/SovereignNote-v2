import { Note } from '../types';
import { safeStorage } from '../utils/safeStorage';
import { Capacitor } from '@capacitor/core';

/**
 * 动态获取后台 API 基址。
 * - 对于同一主机提供的 Web 服务，默认为相对路径 `/api`
 * - 对于 Capacitor (移动端) 或需要外挂同步的端点，可通过 localStorage 'sovereign_sync_url' 手动变更
 */
export function getApiBaseUrl(): string {
  const customUrl = safeStorage.getItem('sovereign_sync_url');
  if (customUrl) {
    return customUrl.endsWith('/') ? customUrl.slice(0, -1) + '/api' : customUrl + '/api';
  }
  if (Capacitor.isNativePlatform()) {
    // Android默认Kernel地址
    return 'http://127.0.0.1:8787/api';
  }
  return '/api';
}

/**
 * 3-Layer Sync Probe System - Frontend / Kernel Level Logger
 */
export async function probeKernel(
  sessionId: string,
  layer: 'frontend' | 'kernel',
  protocol: string,
  step: string,
  status: 'start' | 'ok' | 'error' | 'warn',
  message: string
) {
  try {
    await fetch(`${getApiBaseUrl()}/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        layer,
        protocol,
        step,
        status,
        message
      })
    });
  } catch (err) {
    console.error("Probe error:", err);
  }
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
    const data = safeStorage.getItem('sovereign_notes');
    let notes: Note[] = data ? JSON.parse(data) : [];

    // Inject __APP_STATE__ note
    const independentTags = safeStorage.getItem('sovereign_independent_tags');
    const noteTagsMap = safeStorage.getItem('sovereign_note_tags_map');
    const customEvents = safeStorage.getItem('sovereign_events');
    const updateTime = safeStorage.getItem('sovereign_app_state_updated_at') || '0';
    
    if (independentTags || noteTagsMap || customEvents) {
      notes.push({
        id: '__SOVEREIGN_APP_STATE__',
        title: '__SOVEREIGN_APP_STATE__',
        content: JSON.stringify({
          independentTags: independentTags ? JSON.parse(independentTags) : undefined,
          noteTagsMap: noteTagsMap ? JSON.parse(noteTagsMap) : undefined,
          customEvents: customEvents ? JSON.parse(customEvents) : undefined,
        }),
        created_at: 0,
        updated_at: parseInt(updateTime, 10),
        deleted: false
      });
    }

    return notes;
  } catch (e) {
    console.error('Failed to parse local notes:', e);
    return [];
  }
}

/**
 * 写入本地 localStorage
 */
export function saveLocalNotes(notes: Note[]): void {
  try {
    // Check for __APP_STATE__ and extract it
    const stateNote = notes.find(n => n.id === '__SOVEREIGN_APP_STATE__');
    if (stateNote) {
      try {
        const state = JSON.parse(stateNote.content);
        const lastUpdate = safeStorage.getItem('sovereign_app_state_updated_at') || '0';
        if (stateNote.updated_at > parseInt(lastUpdate, 10)) {
          if (state.independentTags) safeStorage.setItem('sovereign_independent_tags', JSON.stringify(state.independentTags));
          if (state.noteTagsMap) safeStorage.setItem('sovereign_note_tags_map', JSON.stringify(state.noteTagsMap));
          if (state.customEvents) safeStorage.setItem('sovereign_events', JSON.stringify(state.customEvents));
          safeStorage.setItem('sovereign_app_state_updated_at', stateNote.updated_at.toString());
          
          // Note: using an event or reload to update UI state since components use local state.
          // Because `saveLocalNotes` only writes to localStorage. You can refresh safely.
          window.dispatchEvent(new Event('sovereign_app_state_updated'));
        }
      } catch (err) {
        console.error("Failed to parse app state note", err);
      }
    }

    const purelyNotes = notes.filter(n => n.id !== '__SOVEREIGN_APP_STATE__');
    safeStorage.setItem('sovereign_notes', JSON.stringify(purelyNotes));
  } catch (e) {
    console.error('Failed to save local notes:', e);
  }
}

export async function safeParseResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (text.trim().startsWith('<')) {
    throw new Error('HTML response detected (proxy error / nginx fallback)');
  }
  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new Error(`JSON parse failed: ${e.message}`);
  }
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

    const serverNotes: Note[] = await safeParseResponse(response);

    // 在客户端合并两端最新、最全的代码数据
    const merged = mergeNotesLWW(localNotes, serverNotes);
    saveLocalNotes(merged);

    return { success: true, notes: merged };
  } catch (err: any) {
    console.warn('Sync connection failed. Running in standalone local mode:', err.message);
    return { success: false, notes: localNotes, error: err.message };
  }
}

/**
 * 远程发送一条同步或诊断日志存入 SQLite 数据库
 */
export async function addSyncLog(
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR',
  message: string,
  session_id?: string,
  protocol?: string,
  step?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/sync/logs/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ level, message, session_id, protocol, step }),
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to add remote sync log:', err);
    return false;
  }
}
