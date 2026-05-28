import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['fundcircle-favicon-v2.png', 'fundcircle-192.png', 'fundcircle-512.png', 'apple-touch-icon.png', 'fundcircle-logo.png', 'fundcircle-logo-full.png', 'icons/*.png'],
        manifest: {
          name: 'FundCircle',
          short_name: 'FundCircle',
          description: 'Modern pigmy collection management platform',
          theme_color: '#0b1020',
          background_color: '#0b1020',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
          categories: ['finance', 'business'],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkFirst',
              options: { cacheName: 'firestore-cache', networkTimeoutSeconds: 4, expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 } },
            },
          ],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true as true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
