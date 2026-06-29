import { registerPlugin } from '@capacitor/core';

export interface StoragePathInfo {
  basePath: string;
  storageType: string;
  folders: {
    backup: string;
    database: string;
    export: string;
    logs: string;
    settings: string;
    sync: string;
    temp: string;
  };
}

export interface NativeFileItem {
  name: string;
  size: number;
  isDirectory: boolean;
  lastModified: number;
}

export interface SovereignNativePlugin {
  getStoragePathInfo(): Promise<StoragePathInfo>;

  exportFile(options: {
    folderName: string;
    filename: string;
    content: string;
  }): Promise<{
    success: boolean;
    path: string;
    message: string;
  }>;

  importFile(options: {
    folderName: string;
    filename: string;
  }): Promise<{
    success: boolean;
    content: string;
  }>;

  listFiles(options: {
    folderName: string;
  }): Promise<{
    success: boolean;
    files: NativeFileItem[];
  }>;

  deleteFile(options: {
    folderName: string;
    filename: string;
  }): Promise<{
    success: boolean;
    message: string;
  }>;

  shareFile(options: {
    folderName: string;
    filename: string;
    mimeType?: string;
  }): Promise<{
    success: boolean;
  }>;

  shareText(options: {
    text: string;
    title?: string;
  }): Promise<{
    success: boolean;
  }>;

  getPendingShareIntent(): Promise<{
    hasShare: boolean;
    data?: {
      title?: string;
      text?: string;
    };
  }>;
}

export const SovereignNative = registerPlugin<SovereignNativePlugin>('SovereignNativePlugin');
