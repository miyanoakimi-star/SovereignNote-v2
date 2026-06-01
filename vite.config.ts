import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'android >= 5']
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
