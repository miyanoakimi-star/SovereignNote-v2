import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 49', 'android >= 5', 'ie >= 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: true,
    })
  ],
  build: {
    target: 'es2015',
    cssTarget: 'chrome49',
    cssCodeSplit: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
