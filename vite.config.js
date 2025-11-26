import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: process.cwd(),
  server: {
    port: 5173, // Explicitly set to 5173
    strictPort: true, // Fail if 5173 is busy (instead of switching)
    host: true, // Allow network access
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