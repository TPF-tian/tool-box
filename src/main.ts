import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'

// 初始化主题（在挂载前，避免闪烁）
const stored = localStorage.getItem('theme')
if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark')
}

const app = createApp(App)
app.use(router)
app.mount('#app')
