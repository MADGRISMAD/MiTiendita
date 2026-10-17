import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import os from 'node:os'
import { readFileSync } from 'node:fs'

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

// Versión de esta compilación: la del paquete + el commit que la generó (Vercel o GitHub) para reconocerla en Configuración
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const commit = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 7)
const APP_VERSION = commit ? `${pkgVersion}+${commit}` : pkgVersion
const BUILT_AT = new Date().toISOString()

// Publica /version.json con la versión y el commit de esta compilación: sirve para comprobar qué versión está en línea
function versionFile() {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION, commit: commit || null, builtAt: BUILT_AT }, null, 2) })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    versionFile(),
  ],
  define: {
    'import.meta.env.VITE_LAN_HOST': JSON.stringify(lan),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILT_AT__: JSON.stringify(BUILT_AT),
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
