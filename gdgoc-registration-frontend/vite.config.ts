import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev-only: proxy the API to the Express service so the browser sees a
    // single origin. That sidesteps CORS entirely in local development and
    // means the client only ever needs to reference relative "/api" paths.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    // Surface a build failure if any Google Form URL is ever introduced into
    // the bundle. The spec requires that only the two server-returned links
    // can ever reach the client — see scripts.assert-no-form-urls.mjs.
    outDir: 'dist',
  },
})
