import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Any request to /api/... is forwarded to our Express server.
    // So the page can call "/api/..." and it works on laptop, phone, and after deploy.
    proxy: {
      // (set API_URL to point at a different server, e.g. API_URL=http://localhost:4100 npm run dev)
      '/api': process.env.API_URL || 'http://localhost:4000',
    },
  },
})
