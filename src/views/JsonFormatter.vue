<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import JsonTreeView from '@/components/JsonTreeView.vue'
import {
  formatJson,
  minifyJson,
  jsonDiff,
  buildDiffLines,
  type DiffPart,
  type DiffLine
} from '@/utils/jsonDiff'
import type { JsonValue } from '@/utils/jsonValue'

const tab = ref<'format' | 'diff'>('format')

// format tab
const input = ref('')
// treeValue 是递归类型,用 shallowRef 避开 UnwrapRef 深度展开
const treeValue = shallowRef<JsonValue | null>(null)
const error = ref('')
const indent = ref<number | '\t'>(2)
const compressNotice = ref('')
let noticeTimer: number | undefined

// diff tab
const leftInput = ref('')
const rightInput = ref('')
const diffParts = ref<DiffPart[]>([])
const diffError = ref('')
const diffLines = ref<DiffLine[]>([])

const exampleJson = `{
  "name": "ToolBox",
  "version": "0.1.0",
  "features": [
    "image",
    "json",
    "ip"
  ],
  "author": {
    "name": "Kevin",
    "email": "kevin@example.com"
  }
}`

function doFormat() {
  error.value = ''
  try {
    treeValue.value = JSON.parse(input.value) as JsonValue
  } catch (e) {
    error.value = (e as Error).message
    treeValue.value = null
  }
}

async function doMinify() {
  error.value = ''
  try {
    const m = minifyJson(input.value)
    await copyText(m)
    showNotice('已复制压缩结果到剪贴板')
  } catch (e) {
    error.value = (e as Error).message
  }
}

function showNotice(text: string) {
  compressNotice.value = text
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (compressNotice.value = ''), 2200)
}

async function copyTree() {
  if (treeValue.value === null) return
  const str = JSON.stringify(treeValue.value, null, indent.value)
  await copyText(str)
  showNotice(`已复制 (${str.length} 字符)`)
}

function doDiff() {
  diffError.value = ''
  try {
    diffParts.value = jsonDiff(leftInput.value, rightInput.value)
    diffLines.value = buildDiffLines(diffParts.value)
  } catch (e) {
    diffError.value = (e as Error).message
    diffParts.value = []
    diffLines.value = []
  }
}

async function copyText(text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 退化方案
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

function clearAll() {
  input.value = ''
  treeValue.value = null
  error.value = ''
  compressNotice.value = ''
  leftInput.value = ''
  rightInput.value = ''
  diffParts.value = []
  diffLines.value = []
  diffError.value = ''
}


const changedCount = computed(() => diffParts.value.filter((p) => p.added || p.removed).length)

onMounted(() => {
  // 预填示例,方便用户立刻看到效果
  leftInput.value = exampleJson
  rightInput.value = exampleJson
    .replace('"0.1.0"', '"0.2.0"')
    .replace('"image"', '"image",\n    "text"')
})
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-6xl px-4 py-10">
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">JSON 工具</h1>
      <p class="mb-6 text-slate-500 dark:text-slate-400">格式化、压缩、字段级差异对比 — 完全离线</p>

      <div class="mb-6 flex flex-wrap items-center gap-2">
        <button
          class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="tab === 'format' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
          @click="tab = 'format'"
        >
          格式化 / 压缩
        </button>
        <button
          class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="tab === 'diff' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
          @click="tab = 'diff'"
        >
          差异对比
        </button>
        <button
          class="ml-auto rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="clearAll"
        >
          清空
        </button>
      </div>

      <!-- Format tab -->
      <div v-if="tab === 'format'" class="grid gap-4 lg:grid-cols-2">
        <div class="card">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white">输入</h3>
            <button
              class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              @click="input = exampleJson"
            >
              载入示例
            </button>
          </div>
          <textarea
            v-model="input"
            class="input h-[28rem] resize-none font-mono text-xs"
            placeholder="粘贴 JSON..."
            spellcheck="false"
          />
        </div>
        <div class="card">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white">格式化结果</h3>
            <button
              v-if="treeValue !== null"
              class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              @click="copyTree"
            >
              复制
            </button>
          </div>
          <div
            v-if="error"
            class="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
          >
            {{ error }}
          </div>
          <div
            v-if="compressNotice"
            class="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          >
            {{ compressNotice }}
          </div>
          <div
            v-if="treeValue !== null"
            class="h-[28rem] overflow-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-950"
          >
            <JsonTreeView :value="treeValue" @update:value="treeValue = $event" />
          </div>
          <div
            v-else
            class="grid h-[28rem] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/50"
          >
            点击「格式化」显示树形视图
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <label class="text-sm text-slate-600 dark:text-slate-400">缩进</label>
            <select v-model="indent" class="input max-w-24 py-1 text-sm">
              <option :value="2">2 空格</option>
              <option :value="4">4 空格</option>
              <option :value="'\t'">Tab</option>
            </select>
            <button class="btn-primary ml-auto" @click="doFormat">格式化</button>
            <button class="btn-secondary" @click="doMinify">压缩</button>
          </div>
        </div>
      </div>

      <!-- Diff tab -->
      <div v-else>
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="card">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">左侧 (原)</h3>
              <button
                v-if="leftInput"
                class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                @click="copyText(leftInput)"
              >
                复制
              </button>
            </div>
            <textarea
              v-model="leftInput"
              class="input h-80 resize-none font-mono text-xs"
              placeholder="原 JSON..."
              spellcheck="false"
            />
          </div>
          <div class="card">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">右侧 (新)</h3>
              <button
                v-if="rightInput"
                class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                @click="copyText(rightInput)"
              >
                复制
              </button>
            </div>
            <textarea
              v-model="rightInput"
              class="input h-80 resize-none font-mono text-xs"
              placeholder="新 JSON..."
              spellcheck="false"
            />
          </div>
        </div>
        <div class="mt-4 flex items-center gap-3">
          <button class="btn-primary" @click="doDiff">对比</button>
          <span v-if="changedCount > 0" class="text-sm text-slate-500">{{ changedCount }} 处差异</span>
          <span v-else-if="diffParts.length > 0" class="text-sm text-emerald-600 dark:text-emerald-400">无差异</span>
        </div>
        <div
          v-if="diffError"
          class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
        >
          {{ diffError }}
        </div>
        <div v-if="diffLines.length > 0" class="card mt-4 animate-fade-in">
          <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">差异结果</h3>
          <div class="max-h-[28rem] overflow-auto rounded-lg bg-slate-50 font-mono text-xs dark:bg-slate-950">
            <div
              v-for="(line, i) in diffLines"
              :key="i"
              class="flex"
              :class="{
                'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200': line.kind === 'add',
                'bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200': line.kind === 'remove'
              }"
            >
              <span class="w-10 shrink-0 select-none border-r border-slate-200/60 px-2 py-0.5 text-right text-slate-400 dark:border-slate-800/60">{{ line.oldLine ?? '' }}</span>
              <span class="w-10 shrink-0 select-none border-r border-slate-200/60 px-2 py-0.5 text-right text-slate-400 dark:border-slate-800/60">{{ line.newLine ?? '' }}</span>
              <span class="w-6 shrink-0 select-none py-0.5 text-center text-slate-400">{{ line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' ' }}</span>
              <pre class="flex-1 whitespace-pre-wrap py-0.5 pr-3">{{ line.text }}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
