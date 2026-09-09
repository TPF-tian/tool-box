<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import {
  docxToHtml,
  docxToMarkdown,
  docxToText,
  htmlToDocx,
  htmlToDocxWithImages
} from '@/utils/docxUtils'
import { markdownToHtml } from '@/utils/markdownUtils'
import { downloadBlob, copyToClipboard, stripExt } from '@/utils/docUtils'

type DocTab = 'docx2html' | 'docx2md' | 'docx2text' | 'html2docx' | 'md2docx'
const tabs: { id: DocTab; label: string }[] = [
  { id: 'docx2html', label: '.docx → HTML' },
  { id: 'docx2md', label: '.docx → Markdown' },
  { id: 'docx2text', label: '.docx → 纯文本' },
  { id: 'md2docx', label: 'Markdown → .docx' },
  { id: 'html2docx', label: 'HTML → .docx' }
]
const tab = ref<DocTab>('docx2html')

// ===== docx → ... =====
const docxFile = ref<File | null>(null)
const docxOutHtml = ref('')
const docxOutMd = ref('')
const docxOutText = ref('')
const docxMessages = ref<string[]>([])
const docxBusy = ref(false)
const docxErr = ref('')

const docxFileInput = ref<HTMLInputElement | null>(null)
function openDocx() {
  docxFileInput.value?.click()
}
async function onDocxChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  await loadDocx(f)
}
const docxDragOver = ref(false)
async function onDocxDrop(e: DragEvent) {
  e.preventDefault()
  docxDragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) await loadDocx(f)
}
function onDocxDragOver(e: DragEvent) {
  e.preventDefault()
  docxDragOver.value = true
}
function onDocxDragLeave() {
  docxDragOver.value = false
}
async function loadDocx(f: File) {
  docxErr.value = ''
  if (!/\.docx$/i.test(f.name) && f.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    docxErr.value = '请选择 .docx 文件'
    return
  }
  docxFile.value = f
  docxBusy.value = true
  try {
    const [html, md, txt] = await Promise.all([docxToHtml(f), docxToMarkdown(f), docxToText(f)])
    docxOutHtml.value = html.html
    docxMessages.value = html.messages
    docxOutMd.value = md
    docxOutText.value = txt
  } catch (e) {
    docxErr.value = '读取失败: ' + (e as Error).message
  } finally {
    docxBusy.value = false
  }
}

async function downloadDocxOut(kind: 'html' | 'md' | 'text') {
  if (!docxFile.value) return
  const baseName = stripExt(docxFile.value.name)
  if (kind === 'html') {
    const body = docxOutHtml.value
    const full = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${baseName}</title>
<style>
body { max-width: 800px; margin: 32px auto; padding: 0 16px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; color: #1e293b; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin-top: 1.5em; }
h1 { border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
p { margin: 0.6em 0; }
img { max-width: 100%; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #cbd5e1; padding: 0.4em 0.75em; }
ul, ol { padding-left: 1.6em; }
</style>
</head>
<body>
${body}
</body>
</html>`
    downloadBlob(new Blob([full], { type: 'text/html;charset=utf-8' }), `${baseName}.html`)
  } else if (kind === 'md') {
    downloadBlob(new Blob([docxOutMd.value], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`)
  } else {
    downloadBlob(new Blob([docxOutText.value], { type: 'text/plain;charset=utf-8' }), `${baseName}.txt`)
  }
}

async function copyDocxOut(kind: 'html' | 'md' | 'text') {
  const text = kind === 'html' ? docxOutHtml.value : kind === 'md' ? docxOutMd.value : docxOutText.value
  await copyToClipboard(text)
}

const copiedKey = ref<string>('')

// ===== HTML → docx =====
const htmlInput = ref(`<h1>测试标题</h1>
<p>这是一段包含 <strong>粗体</strong>、<em>斜体</em>、<u>下划线</u> 和 <code>行内代码</code> 的段落。</p>
<h2>列表</h2>
<ul>
<li>无序项 1</li>
<li>无序项 2</li>
</ul>
<ol>
<li>有序项 1</li>
<li>有序项 2</li>
</ol>
<blockquote>引用块文字</blockquote>
<pre><code>const x = 42
console.log(x)</code></pre>
<p>图片:</p>
<p><img src="https://placehold.co/200x100/png" alt="placeholder" /></p>
`)
const htmlBusy = ref(false)
const htmlErr = ref('')
const includeImages = ref(true)

async function doHtmlToDocx() {
  if (!htmlInput.value.trim()) {
    htmlErr.value = '请输入 HTML 内容'
    return
  }
  htmlBusy.value = true
  htmlErr.value = ''
  try {
    const blob = includeImages.value
      ? await htmlToDocxWithImages(htmlInput.value)
      : await htmlToDocx(htmlInput.value)
    downloadBlob(blob, 'output.docx')
  } catch (e) {
    htmlErr.value = '生成失败: ' + (e as Error).message
  } finally {
    htmlBusy.value = false
  }
}

const htmlFileInput = ref<HTMLInputElement | null>(null)
function openHtmlFile() {
  htmlFileInput.value?.click()
}
async function onHtmlFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  htmlInput.value = await f.text()
}

const docxStats = computed(() => ({
  html: docxOutHtml.value.length,
  md: docxOutMd.value.length,
  text: docxOutText.value.length
}))

// ===== Markdown → .docx =====
const mdInput = ref(`# Markdown 转 Word

这是一段 **粗体**、*斜体* 和 \`行内代码\` 的段落。

## 二级标题

- 列表项 1
- 列表项 2

> 引用块

\`\`\`js
const x = 42
\`\`\`
`)
const mdBusy = ref(false)
const mdErr = ref('')
const mdFileInput = ref<HTMLInputElement | null>(null)
function openMdFile() {
  mdFileInput.value?.click()
}
async function onMdFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  mdInput.value = await f.text()
}
async function doMdToDocx() {
  if (!mdInput.value.trim()) {
    mdErr.value = '请输入 Markdown 内容'
    return
  }
  mdBusy.value = true
  mdErr.value = ''
  try {
    const html = markdownToHtml(mdInput.value)
    const blob = includeImages.value
      ? await htmlToDocxWithImages(html)
      : await htmlToDocx(html)
    downloadBlob(blob, 'output.docx')
  } catch (e) {
    mdErr.value = '生成失败: ' + (e as Error).message
  } finally {
    mdBusy.value = false
  }
}
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
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Word 文档工具</h1>
          <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">.docx 与 HTML/Markdown/纯文本互转,纯前端处理</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-4 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="rounded-md px-3 py-1.5 transition-colors"
          :class="tab === t.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
          @click="tab = t.id"
        >{{ t.label }}</button>
      </div>

      <div v-if="docxErr" class="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
        {{ docxErr }}
      </div>
      <div v-if="htmlErr" class="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
        {{ htmlErr }}
      </div>
      <div v-if="mdErr" class="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
        {{ mdErr }}
      </div>

      <!-- .docx → ... -->
      <template v-if="tab !== 'html2docx' && tab !== 'md2docx'">
        <div
          v-if="!docxFile"
          class="card"
          :class="{ 'ring-2 ring-brand-400': docxDragOver }"
          @drop="onDocxDrop"
          @dragover="onDocxDragOver"
          @dragleave="onDocxDragLeave"
        >
          <input ref="docxFileInput" type="file" accept=".docx" class="hidden" @change="onDocxChange" />
          <div class="rounded-2xl border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-slate-900" :class="docxDragOver ? 'border-brand-500' : 'border-slate-300 dark:border-slate-700 hover:border-brand-400'">
            <p class="text-base font-medium text-slate-700 dark:text-slate-200">点击或拖拽 .docx 文件</p>
            <button class="btn-primary mt-4" @click="openDocx">选择 .docx</button>
          </div>
        </div>
        <div v-else class="space-y-4">
          <div class="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div class="truncate">
              <span class="font-medium text-slate-900 dark:text-white">{{ docxFile.name }}</span>
              <span v-if="docxBusy" class="ml-2 text-slate-500">解析中…</span>
              <span v-else class="ml-2 text-slate-500">已解析</span>
            </div>
            <button class="text-xs text-slate-500 hover:text-rose-500" @click="docxFile = null">重选</button>
          </div>

          <div v-if="docxMessages.length" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <div class="font-semibold">mammoth 提示 ({{ docxMessages.length }})</div>
            <ul class="mt-1 list-disc pl-5">
              <li v-for="(m, i) in docxMessages" :key="i">{{ m }}</li>
            </ul>
          </div>

          <div v-if="tab === 'docx2html'" class="card p-0">
            <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">HTML 输出 · {{ docxStats.html }} 字符</span>
              <div class="flex gap-3 text-xs">
                <button class="text-slate-400 hover:text-brand-500" @click="copyDocxOut('html')">{{ copiedKey === 'html' ? '已复制 ✓' : '复制' }}</button>
                <button class="text-slate-400 hover:text-brand-500" @click="downloadDocxOut('html')">下载 .html</button>
              </div>
            </div>
            <textarea v-model="docxOutHtml" readonly class="block h-[40vh] w-full resize-none bg-slate-50 p-4 font-mono text-sm leading-6 focus:outline-none dark:bg-slate-950/50" />
            <div class="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">HTML 预览</div>
            <div class="max-h-[40vh] overflow-auto p-4 prose-content" v-html="docxOutHtml" />
          </div>

          <div v-else-if="tab === 'docx2md'" class="card p-0">
            <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Markdown 输出 · {{ docxStats.md }} 字符</span>
              <div class="flex gap-3 text-xs">
                <button class="text-slate-400 hover:text-brand-500" @click="copyDocxOut('md')">{{ copiedKey === 'md' ? '已复制 ✓' : '复制' }}</button>
                <button class="text-slate-400 hover:text-brand-500" @click="downloadDocxOut('md')">下载 .md</button>
              </div>
            </div>
            <textarea v-model="docxOutMd" readonly class="block h-[60vh] w-full resize-none bg-slate-50 p-4 font-mono text-sm leading-6 focus:outline-none dark:bg-slate-950/50" />
          </div>

          <div v-else-if="tab === 'docx2text'" class="card p-0">
            <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">纯文本输出 · {{ docxStats.text }} 字符</span>
              <div class="flex gap-3 text-xs">
                <button class="text-slate-400 hover:text-brand-500" @click="copyDocxOut('text')">{{ copiedKey === 'text' ? '已复制 ✓' : '复制' }}</button>
                <button class="text-slate-400 hover:text-brand-500" @click="downloadDocxOut('text')">下载 .txt</button>
              </div>
            </div>
            <textarea v-model="docxOutText" readonly class="block h-[60vh] w-full resize-none bg-slate-50 p-4 font-mono text-sm leading-6 focus:outline-none dark:bg-slate-950/50" />
          </div>
        </div>
      </template>

      <!-- HTML → .docx -->
      <div v-else-if="tab === 'html2docx'" class="space-y-4">
        <div class="card p-0">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">HTML 输入</span>
            <div class="flex items-center gap-3 text-xs">
              <input ref="htmlFileInput" type="file" accept=".html,.htm,.txt" class="hidden" @change="onHtmlFile" />
              <button class="text-slate-400 hover:text-brand-500" @click="openHtmlFile">打开 .html</button>
              <label class="flex items-center gap-1 text-slate-500">
                <input type="checkbox" v-model="includeImages" class="rounded accent-brand-600" />
                包含图片 (img src=data:)
              </label>
            </div>
          </div>
          <textarea v-model="htmlInput" class="block h-[50vh] w-full resize-none bg-transparent p-4 font-mono text-sm leading-6 focus:outline-none" spellcheck="false" />
        </div>
        <button class="btn-primary w-full" :disabled="htmlBusy" @click="doHtmlToDocx">
          {{ htmlBusy ? '生成中…' : '生成 .docx 并下载' }}
        </button>
        <p class="text-xs text-slate-500">
          支持标签: h1-h6, p, ul/ol/li, blockquote, pre/code, table, hr, br, strong/b, em/i, u, code, a, img(data:)。<br />
          图片仅在勾选「包含图片」时真正嵌入到 .docx,否则仅保留 alt 文字占位。
        </p>
      </div>

      <!-- Markdown → .docx -->
      <div v-else class="space-y-4">
        <div class="card p-0">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Markdown 输入</span>
            <div class="flex items-center gap-3 text-xs">
              <input ref="mdFileInput" type="file" accept=".md,.markdown,.txt" class="hidden" @change="onMdFile" />
              <button class="text-slate-400 hover:text-brand-500" @click="openMdFile">打开 .md</button>
              <label class="flex items-center gap-1 text-slate-500">
                <input type="checkbox" v-model="includeImages" class="rounded accent-brand-600" />
                包含图片
              </label>
            </div>
          </div>
          <textarea v-model="mdInput" class="block h-[50vh] w-full resize-none bg-transparent p-4 font-mono text-sm leading-6 focus:outline-none" spellcheck="false" />
        </div>
        <button class="btn-primary w-full" :disabled="mdBusy" @click="doMdToDocx">
          {{ mdBusy ? '生成中…' : '生成 .docx 并下载' }}
        </button>
        <p class="text-xs text-slate-500">
          内部走两步: Markdown → HTML(markdown-it) → .docx。支持的语法同 HTML → .docx(标题、段落、列表、引用、代码块、表格、加粗/斜体/下划线、行内代码、链接、水平线)。<br />
          「包含图片」开启时,Markdown 中的 <code class="rounded bg-slate-100 px-1 dark:bg-slate-800">![alt](data:...)</code> 才会被真正嵌入;否则 alt 文字以占位形式出现。
        </p>
      </div>
    </section>
  </Layout>
</template>

<style>
.prose-content h1 { @apply mb-3 mt-4 text-2xl font-bold text-slate-900 dark:text-white; }
.prose-content h2 { @apply mb-2 mt-4 text-xl font-bold text-slate-900 dark:text-white; }
.prose-content h3 { @apply mb-2 mt-3 text-lg font-semibold text-slate-900 dark:text-white; }
.prose-content h4, .prose-content h5, .prose-content h6 { @apply mb-2 mt-3 font-semibold text-slate-900 dark:text-white; }
.prose-content p { @apply mb-3 leading-7 text-slate-700 dark:text-slate-200; }
.prose-content ul { @apply mb-3 ml-6 list-disc text-slate-700 dark:text-slate-200; }
.prose-content ol { @apply mb-3 ml-6 list-decimal text-slate-700 dark:text-slate-200; }
.prose-content a { @apply text-brand-600 underline-offset-2 hover:underline dark:text-brand-400; }
.prose-content img { @apply my-3 max-w-full rounded; }
.prose-content table { @apply mb-3 w-full border-collapse text-sm; }
.prose-content th, .prose-content td { @apply border border-slate-200 px-3 py-2 dark:border-slate-700; }
</style>
