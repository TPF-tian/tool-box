import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        // 固定 pdfjs worker 文件名(去掉 hash),避免 CDN 缓存不一致
        // 其它资源仍然用 hash 化
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? ''
          if (name.includes('pdf.worker')) {
            return 'assets/pdf.worker.min.js'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  // 单独优化 worker 块,确保作为 ESM 输出
  worker: {
    format: 'es'
  }
})
