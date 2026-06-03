/**
 * Unifying Safe Storage Layer
 * Safely wraps localStorage to prevent security exceptions in sandboxed WebViews, 
 * cross-origin iframes, and legacy engines without database storage enabled.
 * Seamlessly falls back to an in-memory dictionary.
 */

class SafeStorage {
  private memoryStore: Record<string, string> = {};

  private isAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.isAvailable()) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        console.warn(`Storage getItem failed for key "${key}":`, e);
      }
    }
    return key in this.memoryStore ? this.memoryStore[key] : null;
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable()) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        console.warn(`Storage setItem failed for key "${key}":`, e);
      }
    }
    this.memoryStore[key] = String(value);
  }

  removeItem(key: string): void {
    if (this.isAvailable()) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {
        console.warn(`Storage removeItem failed for key "${key}":`, e);
      }
    }
    delete this.memoryStore[key];
  }

  clear(): void {
    if (this.isAvailable()) {
      try {
        window.localStorage.clear();
        return;
      } catch (e) {
        console.warn('Storage clear failed:', e);
      }
    }
    this.memoryStore = {};
  }
}

export const safeStorage = new SafeStorage();
