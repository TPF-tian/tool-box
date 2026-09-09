<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'

const tools = [
  {
    to: '/doc/markdown',
    title: 'Markdown 编辑器',
    desc: '左编辑右预览,支持代码高亮,导出 HTML/.docx',
    tag: '常用',
    icon: 'md'
  },
  {
    to: '/doc/text',
    title: '文本处理',
    desc: '字符统计、批量替换、正则提取、Unicode、编码转换、diff',
    icon: 'text'
  },
  {
    to: '/doc/pdf',
    title: 'PDF 工具',
    desc: '合并、拆分、提取页、删除页、重新保存(去元数据)、转图片',
    icon: 'pdf'
  },
  {
    to: '/doc/word',
    title: 'Word 文档',
    desc: '.docx 转 HTML/Markdown/纯文本,Markdown/HTML 转 .docx (含图片)',
    icon: 'word'
  }
]
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-6xl px-4 py-10">
      <div class="mb-8 flex items-center justify-between">
        <div>
          <RouterLink to="/" class="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            返回首页
          </RouterLink>
          <h1 class="text-3xl font-bold text-slate-900 dark:text-white">文档工具</h1>
          <p class="mt-1 text-slate-500 dark:text-slate-400">所有处理在浏览器内完成,文件不上传服务器</p>
        </div>
      </div>
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="t in tools"
          :key="t.to"
          :to="t.to"
          class="group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
        >
          <div
            v-if="t.tag"
            class="absolute right-4 top-4 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-brand-950 dark:group-hover:text-brand-300"
          >
            {{ t.tag }}
          </div>
          <div
            class="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 dark:from-brand-950 dark:to-brand-900 dark:text-brand-400"
          >
            <svg v-if="t.icon === 'md'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M6 16V9l3 3 3-3v7" />
              <path d="M16 9v7" />
              <path d="M19 9v7" />
            </svg>
            <svg v-else-if="t.icon === 'text'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7V4h16v3" />
              <path d="M9 20h6" />
              <path d="M12 4v16" />
            </svg>
            <svg v-else-if="t.icon === 'pdf'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <path d="M14 2v6h6" />
              <path d="M9 13h6" />
              <path d="M9 17h4" />
            </svg>
            <svg v-else-if="t.icon === 'word'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <path d="M14 2v6h6" />
              <path d="M8 13l2 5 2-5 2 5 2-5" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
            </svg>
          </div>
          <h3 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">{{ t.title }}</h3>
          <p class="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{{ t.desc }}</p>
          <div class="mt-4 flex items-center text-sm font-medium text-brand-600 dark:text-brand-400">
            打开
            <svg class="ml-1 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </RouterLink>
      </div>
    </section>
  </Layout>
</template>
