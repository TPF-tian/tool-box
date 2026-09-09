<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { markdownToHtml } from '@/utils/markdownUtils'
import { htmlToDocx } from '@/utils/docxUtils'
import { downloadBlob, copyToClipboard, readAsText, stripExt } from '@/utils/docUtils'
import 'highlight.js/styles/github-dark.css'

const DEFAULT_MD = `# Markdown 编辑器

左编辑右预览,所有计算在浏览器内完成。

## 代码高亮

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

## 列表示例

- 支持有序 / 无序列表
- 支持 **粗体** / *斜体* / ~~删除线~~
- 支持 \`行内代码\`
- 支持 [链接](https://github.com)

## 表格

| 工具 | 说明 |
| --- | --- |
| Markdown | 编辑器 + 实时预览 |
| 文本工具 | 字符统计、批量替换 |

> 引用块也支持,代码块自动高亮。
`

const md = ref(DEFAULT_MD)
const preview = ref('')

function updatePreview() {
  preview.value = markdownToHtml(md.value)
}

watch(md, updatePreview, { immediate: true })

const wordCount = computed(() => {
  const t = md.value
  return {
    chars: t.length,
    charsNoSpace: t.replace(/\s+/g, '').length,
    lines: t === '' ? 0 : t.split('\n').length,
    words: (t.match(/[A-Za-z0-9_]+/g) || []).length
  }
})

async function exportHtml() {
  const body = preview.value
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>Markdown 导出</title>
<style>
body { max-width: 800px; margin: 32px auto; padding: 0 16px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; color: #1e293b; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin-top: 1.5em; }
h1 { border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
code { background: #f1f5f9; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
pre code { background: transparent; padding: 0; color: inherit; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #e2e8f0; padding: 0.5em 0.75em; }
th { background: #f8fafc; }
blockquote { border-left: 4px solid #cbd5e1; padding: 0 1em; color: #475569; margin: 1em 0; }
img { max-width: 100%; }
</style>
</head>
<body>
${body}
</body>
</html>`
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 'document.html')
}

async function exportMd() {
  downloadBlob(new Blob([md.value], { type: 'text/markdown;charset=utf-8' }), 'document.md')
}

const docxBusy = ref(false)
async function exportDocx() {
  if (docxBusy.value) return
  docxBusy.value = true
  try {
    const blob = await htmlToDocx(preview.value, 'document')
    downloadBlob(blob, 'document.docx')
  } catch (e) {
    alert('导出 Word 失败: ' + (e as Error).message)
  } finally {
    docxBusy.value = false
  }
}

async function copyHtml() {
  await copyToClipboard(preview.value)
}

async function loadFromFile(file: File) {
  md.value = await readAsText(file)
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadFromFile(f)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFromFile(f)
}

function clearAll() {
  md.value = ''
}

const dragOver = ref(false)
function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}
function onDragLeave() {
  dragOver.value = false
}

const fileInput = ref<HTMLInputElement | null>(null)
function openFile() {
  fileInput.value?.click()
}

onMounted(() => {})
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-7xl px-4 py-6">
      <RouterLink to="/doc" class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
        返回文档工具
      </RouterLink>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Markdown 编辑器</h1>
          <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">左编辑右预览,代码自动高亮</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input ref="fileInput" type="file" accept=".md,.markdown,.txt,text/*" class="hidden" @change="onFileChange" />
          <button class="btn-secondary" @click="openFile">打开 .md</button>
          <button class="btn-secondary" @click="copyHtml">复制 HTML</button>
          <button class="btn-secondary" @click="exportMd">导出 .md</button>
          <button class="btn-secondary" @click="exportDocx" :disabled="docxBusy">
            {{ docxBusy ? '生成中…' : '导出 .docx' }}
          </button>
          <button class="btn-primary" @click="exportHtml">导出 HTML</button>
        </div>
      </div>

      <div
        class="grid gap-4 lg:grid-cols-2"
        :class="{ 'ring-2 ring-brand-400': dragOver }"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
      >
        <div class="card flex flex-col p-0">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">编辑 · Markdown</span>
            <button class="text-xs text-slate-400 hover:text-rose-500" @click="clearAll">清空</button>
          </div>
          <textarea
            v-model="md"
            class="block h-[60vh] w-full resize-none bg-transparent p-4 font-mono text-sm leading-6 text-slate-800 focus:outline-none dark:text-slate-100"
            spellcheck="false"
          />
        </div>
        <div class="card flex flex-col p-0">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">预览</span>
            <span class="text-xs text-slate-400">
              {{ wordCount.chars }} 字符 · {{ wordCount.words }} 词 · {{ wordCount.lines }} 行
            </span>
          </div>
          <div class="md-preview h-[60vh] overflow-auto p-4" v-html="preview" />
        </div>
      </div>
    </section>
  </Layout>
</template>

<style>
.md-preview h1 { @apply mb-3 mt-4 text-2xl font-bold text-slate-900 dark:text-white; }
.md-preview h2 { @apply mb-2 mt-4 text-xl font-bold text-slate-900 dark:text-white; }
.md-preview h3 { @apply mb-2 mt-3 text-lg font-semibold text-slate-900 dark:text-white; }
.md-preview h4, .md-preview h5, .md-preview h6 { @apply mb-2 mt-3 font-semibold text-slate-900 dark:text-white; }
.md-preview p { @apply mb-3 leading-7 text-slate-700 dark:text-slate-200; }
.md-preview ul { @apply mb-3 ml-6 list-disc text-slate-700 dark:text-slate-200; }
.md-preview ol { @apply mb-3 ml-6 list-decimal text-slate-700 dark:text-slate-200; }
.md-preview li { @apply mb-1; }
.md-preview a { @apply text-brand-600 underline-offset-2 hover:underline dark:text-brand-400; }
.md-preview code:not(pre code) { @apply rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.875em] text-slate-800 dark:bg-slate-800 dark:text-slate-200; }
.md-preview pre { @apply mb-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm leading-6 text-slate-100; }
.md-preview pre code { @apply bg-transparent p-0 text-inherit; }
.md-preview blockquote { @apply mb-3 border-l-4 border-slate-300 pl-4 text-slate-600 dark:border-slate-600 dark:text-slate-400; }
.md-preview table { @apply mb-3 w-full border-collapse text-sm; }
.md-preview th, .md-preview td { @apply border border-slate-200 px-3 py-2 dark:border-slate-700; }
.md-preview th { @apply bg-slate-50 font-semibold dark:bg-slate-800; }
.md-preview hr { @apply my-4 border-slate-200 dark:border-slate-700; }
.md-preview img { @apply mx-auto my-3 max-w-full rounded; }
.md-preview del { @apply text-slate-400; }
</style>
