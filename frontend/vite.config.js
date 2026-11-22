import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // La caché de Vite fuera de Dropbox: Dropbox bloquea la carpeta y da errores EBUSY
  cacheDir: path.join(os.tmpdir(), 'satd-vite-cache'),
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
})
