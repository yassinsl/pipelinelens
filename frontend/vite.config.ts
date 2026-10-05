import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// The FastAPI backend started with `uvicorn pipelinelens.main:app` (see README).
// The browser only talks to /api on this dev server; provider credentials stay
// in the backend's .env and never reach the frontend bundle.
const backendUrl = process.env.PIPELINELENS_BACKEND_URL ?? 'http://127.0.0.1:8000'

const proxy: Record<string, ProxyOptions> = {
  '/api': {
    target: backendUrl,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
