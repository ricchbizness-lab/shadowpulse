import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        mentionsLegales: resolve(root, 'mentions-legales/index.html'),
        politiqueConfidentialite: resolve(root, 'politique-de-confidentialite/index.html'),
        cgv: resolve(root, 'cgv/index.html'),
      },
    },
  },
})
