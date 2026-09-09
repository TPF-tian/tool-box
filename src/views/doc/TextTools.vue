<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import {
  textStats,
  findReplace,
  regexExtract,
  charsToUnicodeEscape,
  unicodeEscapeToChars,
  stripZeroWidth,
  textToBase64,
  base64ToText,
  textToUrlEncoded,
  urlEncodedToText,
  textToHex,
  hexToText,
  textToCodepoints,
  codepointsToText,
  lineDiff,
  type CharStats,
  type DiffLine
} from '@/utils/textUtils'
import { copyToClipboard, readAsText, formatSize } from '@/utils/docUtils'

type Tab = 'stats' | 'replace' | 'extract' | 'unicode' | 'encoding' | 'diff'

const tabs: { id: Tab; label: string }[] = [
  { id: 'stats', label: '字符统计' },
  { id: 'replace', label: '查找替换' },
  { id: 'extract', label: '正则提取' },
  { id: 'unicode', label: 'Unicode' },
  { id: 'encoding', label: '编码转换' },
  { id: 'diff', label: '文本 diff' }
]
const tab = ref<Tab>('stats')

const input = ref('Hello, 世界！\n这是一个测试文本 Hello World。\n第二行 with English words.')

const stats = computed<CharStats>(() => textStats(input.value))

// ===== 查找替换 =====
const find = ref('Hello')
const replaceWith = ref('你好')
const useRegex = ref(false)
const caseSensitive = ref(true)
const replaceResult = computed(() => {
  if (!find.value && !useRegex.value) return { output: input.value, count: 0 }
  try {
    return findReplace(input.value, find.value, replaceWith.value, {
      regex: useRegex.value,
      caseSensitive: caseSensitive.value,
      global: true
    })
  } catch (e) {
    return { output: '⚠️ ' + (e as Error).message, count: 0 }
  }
})

// ===== 正则提取 =====
const extractPattern = ref('\\b\\w+\\b')
const extractFlags = ref('g')
const extractResult = computed(() => regexExtract(input.value, extractPattern.value, extractFlags.value))

// ===== Unicode =====
const unicodeMode = ref<'escape' | 'unescape' | 'strip'>('escape')
const unicodeInput = ref('Hello, 世界！')
const unicodeOutput = computed(() => {
  if (unicodeMode.value === 'escape') return charsToUnicodeEscape(unicodeInput.value)
  if (unicodeMode.value === 'unescape') return unicodeEscapeToChars(unicodeInput.value)
  return stripZeroWidth(unicodeInput.value)
})

// ===== 编码转换 =====
type EncodingMode = 'base64' | 'url' | 'hex' | 'codepoint'
const encMode = ref<EncodingMode>('base64')
const encInput = ref('Hello, 世界！')
const encOutput = computed(() => {
  try {
    if (encMode.value === 'base64') return textToBase64(encInput.value)
    if (encMode.value === 'url') return textToUrlEncoded(encInput.value)
    if (encMode.value === 'hex') return textToHex(encInput.value, { space: true })
    return textToCodepoints(encInput.value)
  } catch (e) {
    return '⚠️ ' + (e as Error).message
  }
})
const decInput = ref('')
const decOutput = computed(() => {
  try {
    if (encMode.value === 'base64') return base64ToText(decInput.value)
    if (encMode.value === 'url') return urlEncodedToText(decInput.value)
    if (encMode.value === 'hex') return hexToText(decInput.value)
    return codepointsToText(decInput.value)
  } catch (e) {
    return '⚠️ ' + (e as Error).message
  }
})

// ===== diff =====
const diffLeft = ref('line 1\nline 2\nline 3\nshared line\nline 5')
const diffRight = ref('line 1\nline 2 modified\nline 3\nshared line\nline 5\nnew line 6')
const diffLines = computed<DiffLine[]>(() => lineDiff(diffLeft.value, diffRight.value))
const diffStats = computed(() => ({
  added: diffLines.value.filter((l) => l.type === 'add').length,
  removed: diffLines.value.filter((l) => l.type === 'remove').length,
  context: diffLines.value.filter((l) => l.type === 'context').length
}))

// ===== 通用：复制 =====
const copiedKey = ref<string>('')
async function copy(text: string, key: string) {
  const ok = await copyToClipboard(text)
  if (ok) {
    copiedKey.value = key
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
    }, 1500)
  }
}

// ===== 通用：文件加载 =====
const fileInput = ref<HTMLInputElement | null>(null)
function openFile() {
  fileInput.value?.click()
}
async function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) input.value = await readAsText(f)
}

// ===== 字符统计的 stat 卡片 =====
const statCards = computed(() => {
  const s = stats.value
  return [
    { label: '总字符', value: s.total },
    { label: '中文字符', value: s.chinese },
    { label: '英文字母', value: s.english },
    { label: '数字', value: s.digits },
    { label: '标点符号', value: s.punctuation },
    { label: '空白 (空格+Tab)', value: s.spaces },
    { label: '换行符', value: s.newlines },
    { label: '行数', value: s.lines },
    { label: '段落数', value: s.paragraphs },
    { label: '非空白', value: s.noWhitespace },
    { label: '字节 (UTF-8)', value: formatSize(s.bytesUtf8) },
    { label: '字节 (GBK 估)', value: formatSize(s.bytesGbk) }
  ]
})

// 让 stats 实时反应 input 变化
watch(input, () => {}, { immediate: true })
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
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">文本处理</h1>
          <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">字符统计 · 查找替换 · 正则提取 · Unicode · 编码转换 · diff</p>
        </div>
        <div class="flex items-center gap-2">
          <input ref="fileInput" type="file" accept=".txt,.md,text/*" class="hidden" @change="onFileChange" />
          <button class="btn-secondary" @click="openFile">打开文件</button>
          <button class="btn-secondary" @click="copy(input, 'input')">{{ copiedKey === 'input' ? '已复制 ✓' : '复制输入' }}</button>
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

      <!-- 字符统计 -->
      <div v-if="tab === 'stats'" class="grid gap-4 lg:grid-cols-3">
        <div class="card lg:col-span-2 p-0">
          <div class="border-b border-slate-200 px-4 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">输入文本</div>
          <textarea v-model="input" class="block h-[55vh] w-full resize-none bg-transparent p-4 font-mono text-sm leading-6 focus:outline-none" spellcheck="false" />
        </div>
        <div class="space-y-2">
          <div class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">统计</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div v-for="c in statCards" :key="c.label" class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <span class="text-slate-500 dark:text-slate-400">{{ c.label }}</span>
                <span class="font-mono font-medium text-slate-900 dark:text-white">{{ c.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 查找替换 -->
      <div v-else-if="tab === 'replace'" class="grid gap-4 lg:grid-cols-2">
        <div class="card p-0">
          <div class="border-b border-slate-200 px-4 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">输入</div>
          <textarea v-model="input" class="block h-[50vh] w-full resize-none bg-transparent p-4 font-mono text-sm leading-6 focus:outline-none" spellcheck="false" />
        </div>
        <div class="space-y-4">
          <div class="card space-y-3">
            <div>
              <label class="label">查找</label>
              <input v-model="find" class="input font-mono" />
            </div>
            <div>
              <label class="label">替换为</label>
              <input v-model="replaceWith" class="input font-mono" />
            </div>
            <div class="flex flex-wrap gap-3 text-sm">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="useRegex" class="rounded accent-brand-600" />
                正则
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="caseSensitive" class="rounded accent-brand-600" />
                区分大小写
              </label>
            </div>
            <div class="text-sm text-slate-600 dark:text-slate-300">
              共匹配 <span class="font-semibold text-brand-600">{{ replaceResult.count }}</span> 处
            </div>
          </div>
          <div class="card p-0">
            <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">结果</span>
              <button class="text-xs text-slate-400 hover:text-brand-500" @click="copy(replaceResult.output, 'rep')">{{ copiedKey === 'rep' ? '已复制 ✓' : '复制' }}</button>
            </div>
            <textarea :value="replaceResult.output" readonly class="block h-[40vh] w-full resize-none bg-slate-50 p-4 font-mono text-sm focus:outline-none dark:bg-slate-950/50" />
          </div>
        </div>
      </div>

      <!-- 正则提取 -->
      <div v-else-if="tab === 'extract'" class="grid gap-4 lg:grid-cols-2">
        <div class="card p-0">
          <div class="border-b border-slate-200 px-4 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">输入</div>
          <textarea v-model="input" class="block h-[50vh] w-full resize-none bg-transparent p-4 font-mono text-sm leading-6 focus:outline-none" spellcheck="false" />
        </div>
        <div class="space-y-4">
          <div class="card space-y-3">
            <div>
              <label class="label">正则表达式</label>
              <input v-model="extractPattern" class="input font-mono" />
            </div>
            <div>
              <label class="label">flags (如 g, gi, gm)</label>
              <input v-model="extractFlags" class="input font-mono" />
            </div>
            <div class="text-sm">
              匹配 <span class="font-semibold text-brand-600">{{ extractResult.count }}</span> 处
              <span v-if="extractResult.error" class="ml-2 text-rose-500">⚠️ {{ extractResult.error }}</span>
            </div>
          </div>
          <div class="card p-0">
            <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">匹配结果 (每行一个)</span>
              <button class="text-xs text-slate-400 hover:text-brand-500" @click="copy(extractResult.matches.join('\n'), 'ext')">{{ copiedKey === 'ext' ? '已复制 ✓' : '复制' }}</button>
            </div>
            <textarea :value="extractResult.matches.join('\n')" readonly class="block h-[40vh] w-full resize-none bg-slate-50 p-4 font-mono text-sm focus:outline-none dark:bg-slate-950/50" />
          </div>
        </div>
      </div>

      <!-- Unicode -->
      <div v-else-if="tab === 'unicode'" class="card space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900">
            <button class="rounded-md px-3 py-1" :class="unicodeMode === 'escape' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'" @click="unicodeMode = 'escape'">字符 → \u 转义</button>
            <button class="rounded-md px-3 py-1" :class="unicodeMode === 'unescape' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'" @click="unicodeMode = 'unescape'">\u 转义 → 字符</button>
            <button class="rounded-md px-3 py-1" :class="unicodeMode === 'strip' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'" @click="unicodeMode = 'strip'">去零宽字符</button>
          </div>
        </div>
        <div class="grid gap-3 lg:grid-cols-2">
          <div>
            <label class="label">输入</label>
            <textarea v-model="unicodeInput" class="input h-64 resize-none font-mono" spellcheck="false" />
          </div>
          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <label class="label !mb-0">输出</label>
              <button class="text-xs text-slate-400 hover:text-brand-500" @click="copy(unicodeOutput, 'uc')">{{ copiedKey === 'uc' ? '已复制 ✓' : '复制' }}</button>
            </div>
            <textarea :value="unicodeOutput" readonly class="input h-64 resize-none bg-slate-50 font-mono dark:bg-slate-950/50" />
          </div>
        </div>
      </div>

      <!-- 编码转换 -->
      <div v-else-if="tab === 'encoding'" class="space-y-4">
        <div class="card flex flex-wrap items-center gap-3">
          <span class="text-sm text-slate-600 dark:text-slate-300">编码方式</span>
          <div class="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900">
            <button v-for="m in ['base64','url','hex','codepoint'] as EncodingMode[]" :key="m" class="rounded-md px-3 py-1 capitalize" :class="encMode === m ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'" @click="encMode = m">{{ m }}</button>
          </div>
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <label class="label !mb-0">原文 (编码)</label>
              <button class="text-xs text-slate-400 hover:text-brand-500" @click="copy(encOutput, 'en')">{{ copiedKey === 'en' ? '已复制 ✓' : '复制编码' }}</button>
            </div>
            <textarea v-model="encInput" class="input h-48 resize-none font-mono" />
            <textarea :value="encOutput" readonly class="input mt-2 h-32 resize-none bg-slate-50 font-mono dark:bg-slate-950/50" />
          </div>
          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <label class="label !mb-0">编码 (解码)</label>
              <button class="text-xs text-slate-400 hover:text-brand-500" @click="copy(decOutput, 'de')">{{ copiedKey === 'de' ? '已复制 ✓' : '复制解码' }}</button>
            </div>
            <textarea v-model="decInput" class="input h-48 resize-none font-mono" />
            <textarea :value="decOutput" readonly class="input mt-2 h-32 resize-none bg-slate-50 font-mono dark:bg-slate-950/50" />
          </div>
        </div>
      </div>

      <!-- diff -->
      <div v-else-if="tab === 'diff'" class="space-y-4">
        <div class="card flex flex-wrap items-center gap-4 text-sm">
          <span class="text-slate-600 dark:text-slate-300">统计:</span>
          <span class="text-emerald-600 dark:text-emerald-400">+{{ diffStats.added }} 新增</span>
          <span class="text-rose-600 dark:text-rose-400">-{{ diffStats.removed }} 删除</span>
          <span class="text-slate-500">{{ diffStats.context }} 相同行</span>
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="card p-0">
            <div class="border-b border-slate-200 px-4 py-2 text-xs font-medium text-rose-500 dark:border-slate-800">原文 (-)</div>
            <textarea v-model="diffLeft" class="block h-[40vh] w-full resize-none bg-transparent p-4 font-mono text-sm focus:outline-none" spellcheck="false" />
          </div>
          <div class="card p-0">
            <div class="border-b border-slate-200 px-4 py-2 text-xs font-medium text-emerald-500 dark:border-slate-800">新版 (+)</div>
            <textarea v-model="diffRight" class="block h-[40vh] w-full resize-none bg-transparent p-4 font-mono text-sm focus:outline-none" spellcheck="false" />
          </div>
        </div>
        <div class="card p-0">
          <div class="border-b border-slate-200 px-4 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">行级 diff (git 风格)</div>
          <div class="overflow-x-auto">
            <table class="w-full font-mono text-xs">
              <tbody>
                <tr v-for="(l, i) in diffLines" :key="i" :class="l.type === 'add' ? 'bg-emerald-50 dark:bg-emerald-950/30' : l.type === 'remove' ? 'bg-rose-50 dark:bg-rose-950/30' : ''">
                  <td class="w-12 select-none border-r border-slate-200 px-2 py-0.5 text-right text-slate-400 dark:border-slate-800">{{ l.leftNo ?? '' }}</td>
                  <td class="w-12 select-none border-r border-slate-200 px-2 py-0.5 text-right text-slate-400 dark:border-slate-800">{{ l.rightNo ?? '' }}</td>
                  <td class="w-4 select-none px-2 py-0.5 text-center font-bold" :class="l.type === 'add' ? 'text-emerald-600' : l.type === 'remove' ? 'text-rose-600' : 'text-slate-400'">
                    {{ l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' ' }}
                  </td>
                  <td class="px-2 py-0.5 text-slate-800 dark:text-slate-200 whitespace-pre">{{ l.text }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
