import { registerPlugin } from '@capacitor/core';

export interface FTPPlugin {
  testConnection(options: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    user?: string;
    pass?: string;
    path?: string;
    secure?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
  }>;

  listFiles(options: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    user?: string;
    pass?: string;
    path?: string;
  }): Promise<{
    success: boolean;
    files: Array<{ name: string; size: number; isDirectory: boolean }>;
  }>;

  downloadFile(options: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    user?: string;
    pass?: string;
    path?: string;
    filename: string;
  }): Promise<{
    success: boolean;
    content: string;
  }>;

  uploadFile(options: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    user?: string;
    pass?: string;
    path?: string;
    filename: string;
    content: string;
  }): Promise<{
    success: boolean;
    message: string;
  }>;

  deleteFile(options: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    user?: string;
    pass?: string;
    path?: string;
    filename: string;
  }): Promise<{
    success: boolean;
    message: string;
  }>;

  renameFile(options: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    user?: string;
    pass?: string;
    path?: string;
    from: string;
    to: string;
  }): Promise<{
    success: boolean;
    message: string;
  }>;

  disconnect(): Promise<{
    success: boolean;
    message: string;
  }>;
}

export const FTP = registerPlugin<FTPPlugin>('FTPPlugin');
