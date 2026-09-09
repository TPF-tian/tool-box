<script setup lang="ts">
import Layout from '@/components/Layout.vue'
import ToolCard from '@/components/ToolCard.vue'

const tools = [
  {
    to: '/image',
    title: '图像工具',
    desc: '压缩、尺寸、水印、九宫格、Base64、GIF 拆帧、证件照、转 GIF/视频，9 个细分工具',
    icon: 'image' as const,
    tag: '9 个工具'
  },
  {
    to: '/doc',
    title: '文档工具',
    desc: 'Markdown 编辑器、MD↔HTML、文本处理、PDF 工具、Word 文档',
    icon: 'doc' as const,
    tag: '新功能'
  },
  {
    to: '/json',
    title: 'JSON 工具',
    desc: '美化、字段级差异对比 (git 风格行号)、树形视图可编辑删除',
    icon: 'json' as const,
    tag: '离线'
  },
  {
    to: '/ip',
    title: 'IP 解析',
    desc: '查询 IP 地理位置、ASN、运营商，支持本机 IP 自动识别',
    icon: 'ip' as const,
    tag: '免费 API'
  }
]
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <div class="mb-12 text-center">
        <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
          纯前端 · 数据不上传
        </div>
        <h1 class="mb-4 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl dark:text-white">
          顺手好用的小工具集
        </h1>
        <p class="mx-auto max-w-2xl text-base text-slate-500 md:text-lg dark:text-slate-400">
          图像处理、文档工具、JSON 工具、IP 解析 — 所有计算在浏览器内完成，文件不经过服务器。
        </p>
      </div>
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ToolCard
          v-for="t in tools"
          :key="t.to"
          :to="t.to"
          :title="t.title"
          :desc="t.desc"
          :icon="t.icon"
          :tag="t.tag"
        />
      </div>
    </section>
  </Layout>
</template>
