<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const dark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  localStorage.setItem('theme', dark.value ? 'dark' : 'light')
}

const navLinks = [
  { to: '/image', label: '图像处理' },
  { to: '/doc', label: '文档工具' },
  { to: '/json', label: 'JSON 工具' },
  { to: '/ip', label: 'IP 解析' }
]
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header
      class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/80"
    >
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <RouterLink to="/" class="flex items-center gap-2.5 text-base font-semibold text-slate-900 dark:text-white">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </span>
          Kevin 工具箱
        </RouterLink>
        <nav class="hidden gap-1 md:flex">
          <RouterLink
            v-for="l in navLinks"
            :key="l.to"
            :to="l.to"
            class="rounded-md px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            active-class="bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
          >
            {{ l.label }}
          </RouterLink>
        </nav>
        <button
          class="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          :aria-label="dark ? '切换到亮色' : '切换到暗色'"
          @click="toggleTheme"
        >
          <svg v-if="dark" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>
      <nav class="flex gap-1 overflow-x-auto border-t border-slate-200 px-4 py-2 md:hidden dark:border-slate-800">
        <RouterLink
          v-for="l in navLinks"
          :key="l.to"
          :to="l.to"
          class="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          active-class="bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
        >
          {{ l.label }}
        </RouterLink>
      </nav>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
      <p>ToolBox · 纯前端工具集 · 数据不上传</p>
      <p class="mt-2">
        开源协议 <a
          href="https://github.com/TPF-tian/tool-box/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-slate-700 dark:hover:text-slate-300"
        >MIT</a>
        · 欢迎 <a
          href="https://github.com/TPF-tian/tool-box"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-slate-700 dark:hover:text-slate-300"
        >Star & Issue</a>
      </p>
      <!--
        部署到国内服务器需要在 footer 加 ICP 备案号, 把下面这一行取消注释并填你自己的备案号.
        <p class="mt-1"><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">你的备案号</a></p>
      -->
    </footer>
  </div>
</template>
