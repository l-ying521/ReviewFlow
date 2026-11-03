import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  /* ---------- Vite dev server 代理（解决浏览器跨域 CORS） ---------- */
  // Vite 内置代理会自动转发 POST body，无需 configure 手动 write
  // 生产部署时需改用自建后端 / Netlify rewrites / Vercel rewrites / Nginx location
  server: {
    proxy: {
      // 百度 OCR 通用文字识别
      '/api/cv-classify': {
        target: 'https://aip.baidubce.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cv-classify/, '/rest/2.0/ocr/v1/general'),
      },

      // 智谱 AI Chat Completions
      '/api/ai-chat': {
        target: 'https://open.bigmodel.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai-chat/, '/api/paas/v4/chat/completions'),
      },
    },
  },
})
