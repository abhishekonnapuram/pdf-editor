import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 5000 },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Pagewise – PDF tools',
        short_name: 'Pagewise',
        description: 'Merge, split, compress, convert, edit, sign and secure PDFs — privately, on your device.',
        theme_color: '#0f5c55',
        background_color: '#f6f4ef',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        file_handlers: [{ action: './', accept: { 'application/pdf': ['.pdf'] } }]
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [{
          urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|tessdata\.projectnaptha\.com)\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'remote-assets',
            expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 120 },
            cacheableResponse: { statuses: [0, 200] }
          }
        }]
      }
    })
  ]
});
