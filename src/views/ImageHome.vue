<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'

const tools = [
  {
    to: '/image/compress',
    title: '图片压缩',
    desc: '调节质量、最大宽度，减小文件体积，视觉无损',
    tag: '常用',
    icon: 'compress'
  },
  {
    to: '/image/resize',
    title: '尺寸修改',
    desc: '指定宽高或按比例缩放，支持锁定纵横比',
    tag: '常用',
    icon: 'resize'
  },
  {
    to: '/image/watermark',
    title: '添加水印',
    desc: '文字水印，6 种位置可选，支持平铺 + 旋转',
    icon: 'watermark'
  },
  {
    to: '/image/grid',
    title: '九宫格切图',
    desc: '把图片切成 3×3 九等分，可单独下载或打包 ZIP',
    icon: 'grid'
  },
  {
    to: '/image/base64',
    title: 'Base64 转换',
    desc: '图片 ↔ Base64 字符串互转，支持 data URL 与纯 base64',
    icon: 'base64'
  },
  {
    to: '/image/gif',
    title: 'GIF 拆帧',
    desc: '把 GIF 拆成独立的 PNG 帧，可全部打包下载',
    icon: 'gif'
  },
  {
    to: '/image/idphoto',
    title: '证件照生成',
    desc: 'AI 自动抠图 + 11 种标准尺寸 (中国+国际) + 自定义背景色',
    tag: '新功能',
    icon: 'idphoto'
  },
  {
    to: '/image/to-gif',
    title: '图片转 GIF / 视频',
    desc: '多张图片按顺序合成动画, 输出 GIF 或 WebM 视频',
    icon: 'gif2'
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
          <h1 class="text-3xl font-bold text-slate-900 dark:text-white">图像工具</h1>
          <p class="mt-1 text-slate-500 dark:text-slate-400">所有处理在浏览器内完成，文件不上传服务器</p>
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
            <svg v-if="t.icon === 'compress'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12 A10 10 0 1 1 12 2" />
              <path d="M22 2 12 12" />
              <path d="M16 2h6v6" />
            </svg>
            <svg v-else-if="t.icon === 'resize'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 21H3" />
              <path d="M3 3h18" />
              <path d="M3 3v18" />
              <path d="M9 9l6 6m0-6-6 6" />
            </svg>
            <svg v-else-if="t.icon === 'watermark'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
            </svg>
            <svg v-else-if="t.icon === 'grid'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
            </svg>
            <svg v-else-if="t.icon === 'base64'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <path d="M14 2v6h6" />
              <path d="m10 13-2 2 2 2" />
              <path d="m14 17 2-2-2-2" />
            </svg>
            <svg v-else-if="t.icon === 'gif'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 3v18" />
              <circle cx="6" cy="6" r="0.8" fill="currentColor" />
              <circle cx="12" cy="6" r="0.8" fill="currentColor" />
              <circle cx="18" cy="6" r="0.8" fill="currentColor" />
              <circle cx="6" cy="12" r="0.8" fill="currentColor" />
              <circle cx="12" cy="12" r="0.8" fill="currentColor" />
              <circle cx="18" cy="12" r="0.8" fill="currentColor" />
              <circle cx="6" cy="18" r="0.8" fill="currentColor" />
              <circle cx="12" cy="18" r="0.8" fill="currentColor" />
              <circle cx="18" cy="18" r="0.8" fill="currentColor" />
            </svg>
            <svg v-else-if="t.icon === 'gif2'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="6" width="14" height="12" rx="2" />
              <path d="m22 8-6 4 6 4V8Z" />
              <path d="M5 6V4M9 6V4M13 6V4" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
              <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="2 2" />
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
