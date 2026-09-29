import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg'],
      manifest: {
        name: 'Mi Tiendita',
        short_name: 'Mi Tiendita',
        description: 'POS en la nube para tiendas de abarrotes',
        theme_color: '#1E5AA8',
        background_color: '#F4F1EA',
        display: 'standalone',
        start_url: '/pos',
        lang: 'es-MX',
        icons: [
          {
            src: '/logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
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
