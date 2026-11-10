import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Folders holding the Craft apps' web builds (see scripts/fetch-crafts.mjs).
const CRAFTS = 'photocraft,vectorcraft,lightcraft,filmcraft,effectcraft,soundcraft,pdfcraft';
const CRAFT_PATH = new RegExp(`/(${CRAFTS.replace(/,/g, '|')})/`);

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 5000 },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        id: './',
        name: 'EditSupreme – PDF Editor',
        short_name: 'EditSupreme',
        description: 'Edit, splice, merge, split, compress, convert, sign and secure PDFs — privately, on your device.',
        theme_color: '#14213d',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        file_handlers: [{ action: './', accept: { 'application/pdf': ['.pdf'] } }]
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,jpg,woff2}'],
        globIgnores: ['**/models/**', `**/{${CRAFTS}}/**`],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // The Craft apps are separate sites in their own folders: never answer their pages with ours.
        navigateFallbackDenylist: [CRAFT_PATH],
        runtimeCaching: [{
          // The Craft apps are downloaded the first time they are opened, then kept for offline use.
          // (EffectCraft also has its own service worker inside its folder.)
          urlPattern: new RegExp(`/(${CRAFTS.replace(/,/g, '|')})/(?!sw\\.js$)`),
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'craft-apps', cacheableResponse: { statuses: [0, 200] } }
        }, {
          // The AI upscaling model is fetched only when "Recreate in HD" is used, then kept for offline use.
          urlPattern: /\/models\/esrgan-slim\//,
          handler: 'CacheFirst',
          options: { cacheName: 'ai-models', cacheableResponse: { statuses: [0, 200] } }
        }, {
          // Fonts, icons, OCR languages and the object-selection model, kept for offline use once fetched.
          urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|tessdata\.projectnaptha\.com|api\.fontsource\.org|api\.iconify\.design|storage\.googleapis\.com\/mediapipe-models)\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'remote-assets',
            expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 120 },
            cacheableResponse: { statuses: [0, 200] }
          }
        }]
      }
    })
  ]
});
