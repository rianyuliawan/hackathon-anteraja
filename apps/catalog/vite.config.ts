import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const proxyTarget = loadEnv(mode, '.', 'VITE_').VITE_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/sanctum': { target: proxyTarget, changeOrigin: true },
        '/login': { target: proxyTarget, changeOrigin: true },
        '/register': { target: proxyTarget, changeOrigin: true },
        '/logout': { target: proxyTarget, changeOrigin: true },
      },
    },
  }
})
