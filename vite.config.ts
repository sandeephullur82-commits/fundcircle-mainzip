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
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
    build: {
      // Raise the warning threshold — individual chunks will still be well under control
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // ── React core ─────────────────────────────────────────────────────
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/scheduler/')) {
              return 'vendor-react';
            }

            // ── Routing ────────────────────────────────────────────────────────
            if (id.includes('node_modules/react-router') ||
                id.includes('node_modules/@remix-run/')) {
              return 'vendor-router';
            }

            // ── Firebase (largest single chunk) ────────────────────────────────
            if (id.includes('node_modules/firebase/') ||
                id.includes('node_modules/@firebase/')) {
              return 'vendor-firebase';
            }

            // ── Clerk auth ─────────────────────────────────────────────────────
            if (id.includes('node_modules/@clerk/')) {
              return 'vendor-clerk';
            }

            // ── Animation ─────────────────────────────────────────────────────
            if (id.includes('node_modules/framer-motion/') ||
                id.includes('node_modules/motion/')) {
              return 'vendor-animation';
            }

            // ── Charts ────────────────────────────────────────────────────────
            if (id.includes('node_modules/recharts/') ||
                id.includes('node_modules/d3-') ||
                id.includes('node_modules/victory-') ||
                id.includes('node_modules/d3/')) {
              return 'vendor-charts';
            }

            // ── PDF export (jspdf + html2canvas) ──────────────────────────────
            if (id.includes('node_modules/jspdf/') ||
                id.includes('node_modules/html2canvas/')) {
              return 'vendor-pdf';
            }

            // ── Excel export ───────────────────────────────────────────────────
            if (id.includes('node_modules/exceljs/') ||
                id.includes('node_modules/archiver') ||
                id.includes('node_modules/jszip/')) {
              return 'vendor-excel';
            }

            // ── Icons ──────────────────────────────────────────────────────────
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }

            // ── State / data layer ─────────────────────────────────────────────
            if (id.includes('node_modules/zustand/') ||
                id.includes('node_modules/@tanstack/') ||
                id.includes('node_modules/dexie/')) {
              return 'vendor-state';
            }

            // ── Date utilities ─────────────────────────────────────────────────
            if (id.includes('node_modules/date-fns/')) {
              return 'vendor-dates';
            }

            // ── UI primitives (shadcn, radix, sonner, next-themes, etc.) ───────
            if (id.includes('node_modules/@radix-ui/') ||
                id.includes('node_modules/sonner/') ||
                id.includes('node_modules/next-themes/') ||
                id.includes('node_modules/class-variance-authority/') ||
                id.includes('node_modules/clsx/') ||
                id.includes('node_modules/tailwind-merge/') ||
                id.includes('node_modules/@base-ui/')) {
              return 'vendor-ui';
            }

            // ── All other node_modules go into a general vendor chunk ──────────
            if (id.includes('node_modules/')) {
              return 'vendor-misc';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true as true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
