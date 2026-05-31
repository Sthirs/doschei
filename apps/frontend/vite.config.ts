import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const devPort = Number(process.env.FRONTEND_PORT ?? 5173);
const devHost = process.env.DOSCHEI_DEV_HOST;
const hmrClientPort = Number(process.env.VITE_HMR_CLIENT_PORT ?? devPort);

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg'],
      manifest: {
        name: 'Do Schèi',
        short_name: 'Do Schèi',
        theme_color: '#111936',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: devPort,
    strictPort: true,
    hmr: devHost
      ? {
          host: devHost,
          clientPort: hmrClientPort,
          protocol: 'ws',
        }
      : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
