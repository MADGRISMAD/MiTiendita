import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import seoPlugin from './seo-plugin.mjs'
import os from 'node:os'

/** Primera IPv4 de la LAN (Wi‑Fi/Ethernet), para abrir desde el celular. */
function lanHost() {
  if (process.env.VERCEL || process.env.CI) return ''
  try {
    const nets = os.networkInterfaces()
    for (const entries of Object.values(nets)) {
      for (const net of entries || []) {
        const family = String(net.family)
        if ((family === 'IPv4' || family === '4') && !net.internal) {
          return net.address
        }
      }
    }
  } catch {
    return ''
  }
  return ''
}

const lan = lanHost()

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    seoPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        id: '/pos',
        name: 'Mi Tiendita',
        short_name: 'Mi Tiendita',
        description: 'Punto de venta para abarrotes, farmacias y ferreterías. Cobra aunque se vaya el internet.',
        theme_color: '#1E5AA8',
        background_color: '#F4F1EA',
        display: 'standalone',
        scope: '/',
        start_url: '/pos',
        orientation: 'any',
        lang: 'es-MX',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Vender', short_name: 'Vender', url: '/pos', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Caja', short_name: 'Caja', url: '/orders', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2,png}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  define: {
    'import.meta.env.VITE_LAN_HOST': JSON.stringify(lan),
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
})
