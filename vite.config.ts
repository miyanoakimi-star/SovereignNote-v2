import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 49', 'android >= 5', 'ie >= 11'],
      modernTargets: ['chrome >= 60', 'android >= 5'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: false,
    })
  ],
  build: {
    target: ['chrome79', 'es2015'],
    cssTarget: 'chrome49',
    cssCodeSplit: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
