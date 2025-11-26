import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Explicitly tell Vite that "root" is the current folder
  root: process.cwd(),
  server: {
    port: 4000,
    strictPort: true,
    fs: {
      strict: false,
    },
  },
  build: {
  
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
      },
    },
  },
})