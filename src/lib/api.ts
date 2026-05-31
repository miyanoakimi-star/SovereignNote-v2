export interface NoteEntity {
  uuid: string;
  title: string;
  content: string;
  updated_at: number; // 高精度毫秒级时间戳 (LWW 基准)
}

// 固化于回环地址的后台接口基座
const API_BASE = 'http://127.0.0.1:3000/api';

/**
 * 核心网络层：去中心化 LWW (Last-Write-Wins) 修改合并算法
 * 该封装保证了前端任何复杂的合并都在到达物理层前完成冲突判断。
 */
export class SovereignServices {
  
  /**
   * 纯本地 Last-Write-Wins 的碰撞判定算法实现
   */
  public static resolveLWW(localState: NoteEntity, remoteState: NoteEntity): NoteEntity {
    // 若时间戳极其相近（例如处于1毫秒内并发），由于我们主要做单机闭环与云端拓扑同步，
    // 以远端(最新拉取)防腐为准，或依赖 Rust 后端 SQLite 层的 ON CONFLICT 时间戳卫语。
    if (localState.updated_at > remoteState.updated_at) {
      return localState;
    }
    return remoteState;
  }

  /**
   * 将经过本地 LWW 裁定的笔记发送至 Rust 内核强制执行事务落盘
   */
  public static async forceSyncNoteTransaction(note: NoteEntity): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      
      if (!response.ok) {
        throw new Error(`Rust Backend rejected transaction: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error('⚠️ [SovereignNote] 物理落盘环线被切断: ', error);
      // 降级策略（通常在主权架构下，如后台保活失败，可选择抛错锁定 UI）
      return false;
    }
  }

  /**
   * 媒体文件强制下发静态 URL
   * 放弃 fetch API 和 blob URL 构建，直接硬连接！
   */
  public static getAssetStreamUrlUrl(uuid: string): string {
     return `${API_BASE}/assets/download/${uuid}`;
  }
}
