import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  // relative base so the built site works anywhere: GitHub Pages subpath,
  // Netlify/Vercel root, or a single file opened locally
  base: './',
  plugins: [react(), viteSingleFile()],
  server: {
    proxy: {
      // the claims service has no CORS headers; proxy it so the app can show
      // live locked/free status while developing locally
      '/api/claims': {
        target: 'https://belongto.us',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Reasonable for viewer with embedded data
    chunkSizeWarningLimit: 1200,
  },
})
