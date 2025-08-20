import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/analyses': 'http://localhost:8000',
      '/datasets': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  }
})


