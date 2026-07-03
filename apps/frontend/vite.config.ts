import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const devPort = Number(process.env.FRONTEND_PORT ?? 5173);
const devHost = process.env.DOSCHEI_DEV_HOST;
const hmrClientPort = Number(process.env.VITE_HMR_CLIENT_PORT ?? devPort);

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Without this, Workbox's default NavigationRoute intercepts every
        // top-level browser navigation and returns the cached index.html —
        // including navigations to /api/* (e.g. GET /api/auth/oauth, which
        // must reach the backend to issue the OAuth redirect to the IdP).
        navigateFallbackDenylist: [/^\/api\//],
      },
      includeAssets: ['favicon.svg', 'logo.svg', 'logo-192.png', 'logo-512.png'],
      manifest: {
        name: 'Do Schèi',
        short_name: 'Do Schèi',
        description: 'Manage and share your expenses',
        theme_color: '#111936',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'logo-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'logo-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
        screenshots: [
          {
            src: 'screenshots/mobile-home.png',
            sizes: '517x1121',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Mobile home screen',
          },
          {
            src: 'screenshots/desktop-home.png',
            sizes: '1694x953',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Desktop home screen',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
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
