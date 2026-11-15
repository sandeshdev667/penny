import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Any request to /api/... is forwarded to our Express server.
    // So the page can call "/api/..." and it works on laptop, phone, and after deploy.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
