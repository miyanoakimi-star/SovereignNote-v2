import { registerPlugin } from '@capacitor/core';

export interface FTPPlugin {
  testConnection(options: {
    host: string;
    port: number;
    username: string;
    password: string;
    secure?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
  }>;
}

export const FTP = registerPlugin<FTPPlugin>('FTPPlugin');
