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
import { parsePath, pickByPaths, omitByPaths, type Path } from '@/utils/jsonPath'
import { tryRepairJson } from '@/utils/jsonRepair'
import { generateTypeCode, type Lang } from '@/utils/jsonToType'
import { jsonToTable, type TableFormat } from '@/utils/jsonToTable'

type Tab = 'format' | 'diff' | 'pick' | 'type' | 'table'
const tab = ref<Tab>('format')

// ============= format tab =============
const input = ref('')
const treeValue = shallowRef<JsonValue | null>(null)
const error = ref('')
const indent = ref<number | '\t'>(2)
const compressNotice = ref('')
let noticeTimer: number | undefined

// ============= diff tab =============
const leftInput = ref('')
const rightInput = ref('')
const diffParts = ref<DiffPart[]>([])
const diffError = ref('')
const diffLines = ref<DiffLine[]>([])

// ============= pick tab =============
const pickInput = ref('')
const pickMode = ref<'pick' | 'omit'>('pick')
const pickPathsText = ref('')
const pickResult = ref('')
const pickError = ref('')

// ============= type tab =============
const typeInput = ref('')
const typeLang = ref<Lang>('ts')
const typeRootName = ref('Root')
const typeResult = ref('')
const typeError = ref('')

// ============= table tab =============
const tableInput = ref('')
const tableFormat = ref<TableFormat>('markdown')
const tableResult = ref('')
const tableError = ref('')
const tableInfo = ref<{ columns: string[]; rowCount: number } | null>(null)

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

const exampleTableJson = `[
  { "name": "kevin", "age": 30, "role": "dev", "active": true },
  { "name": "alice", "age": 25, "role": "pm", "active": true },
  { "name": "bob", "age": 28, "role": "qa", "active": false }
]`

const examplePickPaths = `author.name
features`

// ============= format 操作 =============
function doFormat() {
  error.value = ''
  try {
    treeValue.value = JSON.parse(input.value) as JsonValue
  } catch (e) {
    error.value = (e as Error).message
    treeValue.value = null
  }
}

/** 修复非标准 JSON 后再格式化 (注释/单引号/尾逗号/未引号 key/Python 字面量) */
function doRepairAndFormat() {
  error.value = ''
  try {
    const { value, repaired } = tryRepairJson(input.value)
    input.value = formatJson(JSON.stringify(value), indent.value)
    treeValue.value = value as JsonValue
    showNotice(`已修复并格式化 (输入有 ${repaired !== input.value ? '语法宽容' : '已是合法 JSON'})`)
  } catch (e) {
    error.value = '修复失败: ' + (e as Error).message
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

// ============= diff 操作 =============
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

// ============= pick 操作 =============
function doPick() {
  pickError.value = ''
  pickResult.value = ''
  if (!pickInput.value.trim()) {
    pickError.value = '请输入 JSON'
    return
  }
  if (!pickPathsText.value.trim()) {
    pickError.value = '请输入至少一个路径'
    return
  }
  try {
    const obj = JSON.parse(pickInput.value) as JsonValue
    const lines = pickPathsText.value.split('\n').map((l) => l.trim()).filter(Boolean)
    const paths: Path[] = lines.map(parsePath)
    const result = pickMode.value === 'pick' ? pickByPaths(obj, paths) : omitByPaths(obj, paths)
    pickResult.value = JSON.stringify(result, null, 2)
  } catch (e) {
    pickError.value = (e as Error).message
  }
}

async function copyPickResult() {
  if (!pickResult.value) return
  await copyText(pickResult.value)
  showNotice('已复制结果')
}

function loadPickExample() {
  pickInput.value = exampleJson
  pickPathsText.value = examplePickPaths
  pickResult.value = ''
  pickError.value = ''
}

// ============= type 操作 =============
function doGenerateType() {
  typeError.value = ''
  typeResult.value = ''
  if (!typeInput.value.trim()) {
    typeError.value = '请输入 JSON'
    return
  }
  try {
    const obj = JSON.parse(typeInput.value)
    const name = typeRootName.value.trim() || 'Root'
    typeResult.value = generateTypeCode(obj, typeLang.value, name)
  } catch (e) {
    typeError.value = (e as Error).message
  }
}

async function copyTypeResult() {
  if (!typeResult.value) return
  await copyText(typeResult.value)
  showNotice('已复制结果')
}

// ============= table 操作 =============
function doGenerateTable() {
  tableError.value = ''
  tableResult.value = ''
  tableInfo.value = null
  if (!tableInput.value.trim()) {
    tableError.value = '请输入 JSON'
    return
  }
  try {
    const obj = JSON.parse(tableInput.value)
    const res = jsonToTable(obj, tableFormat.value)
    if (res.error) {
      tableError.value = res.error
      return
    }
    tableResult.value = res.text
    tableInfo.value = { columns: res.columns, rowCount: res.rowCount }
  } catch (e) {
    tableError.value = (e as Error).message
  }
}

async function copyTableResult() {
  if (!tableResult.value) return
  await copyText(tableResult.value)
  showNotice('已复制表格')
}

function loadTableExample() {
  tableInput.value = exampleTableJson
  tableResult.value = ''
  tableError.value = ''
  tableInfo.value = null
}

function loadTypeExample() {
  typeInput.value = exampleJson
  typeResult.value = ''
  typeError.value = ''
}

const langLabel: Record<Lang, string> = {
  ts: 'TypeScript',
  go: 'Go',
  java: 'Java',
  python: 'Python'
}

// ============= 通用 =============
async function copyText(text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
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
  pickInput.value = ''
  pickPathsText.value = ''
  pickResult.value = ''
  pickError.value = ''
  typeInput.value = ''
  typeResult.value = ''
  typeError.value = ''
  tableInput.value = ''
  tableResult.value = ''
  tableError.value = ''
  tableInfo.value = null
}

const changedCount = computed(() => diffParts.value.filter((p) => p.added || p.removed).length)

onMounted(() => {
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
          class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="tab === 'pick' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
          @click="tab = 'pick'"
        >
          字段提取 / 剔除
        </button>
        <button
          class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="tab === 'type' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
          @click="tab = 'type'"
        >
          生成类型
        </button>
        <button
          class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="tab === 'table' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
          @click="tab = 'table'"
        >
          转表格
        </button>
        <button
          class="ml-auto rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="clearAll"
        >
          清空
        </button>
      </div>

      <!-- ==================== Format tab ==================== -->
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
            placeholder="粘贴 JSON... (支持非标准 JSON: 注释/单引号/尾逗号)"
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
          <button
            class="btn-secondary mt-2 w-full"
            title="容错解析: 容忍 // 注释, /* */ 注释, 单引号, 尾逗号, 未引号 key, Python True/False/None"
            @click="doRepairAndFormat"
          >
            🛠 修复并格式化 (容错)
          </button>
        </div>
      </div>

      <!-- ==================== Diff tab ==================== -->
      <div v-else-if="tab === 'diff'">
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

      <!-- ==================== Pick / Omit tab ==================== -->
      <div v-else-if="tab === 'pick'">
        <div class="grid gap-4 lg:grid-cols-2">
          <div>
            <div class="card">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="font-semibold text-slate-900 dark:text-white">输入 JSON</h3>
                <button
                  class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  @click="loadPickExample"
                >
                  载入示例
                </button>
              </div>
              <textarea
                v-model="pickInput"
                class="input h-72 resize-none font-mono text-xs"
                placeholder="粘贴 JSON..."
                spellcheck="false"
              />
            </div>
            <div class="card mt-4">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="font-semibold text-slate-900 dark:text-white">路径 (每行一个)</h3>
                <div class="flex items-center gap-1 text-xs">
                  <button
                    class="rounded-md border px-2 py-0.5 transition-colors"
                    :class="pickMode === 'pick' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                    @click="pickMode = 'pick'"
                  >
                    提取
                  </button>
                  <button
                    class="rounded-md border px-2 py-0.5 transition-colors"
                    :class="pickMode === 'omit' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                    @click="pickMode = 'omit'"
                  >
                    剔除
                  </button>
                </div>
              </div>
              <textarea
                v-model="pickPathsText"
                class="input h-40 resize-none font-mono text-xs"
                placeholder="author.name
features
author.email"
                spellcheck="false"
              />
              <p class="mt-2 text-xs text-slate-500">
                支持嵌套路径 (<code class="rounded bg-slate-100 px-1 dark:bg-slate-800">user.address.city</code>), 数组索引 (<code class="rounded bg-slate-100 px-1 dark:bg-slate-800">items[0]</code>), 数组通配 (<code class="rounded bg-slate-100 px-1 dark:bg-slate-800">items[*].id</code>)
              </p>
              <button class="btn-primary mt-3 w-full" @click="doPick">应用</button>
            </div>
          </div>
          <div class="card">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">
                {{ pickMode === 'pick' ? '提取结果' : '剔除结果' }}
              </h3>
              <button
                v-if="pickResult"
                class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                @click="copyPickResult"
              >
                复制
              </button>
            </div>
            <div
              v-if="pickError"
              class="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
            >
              {{ pickError }}
            </div>
            <pre
              v-if="pickResult"
              class="max-h-[28rem] overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-slate-950"
            >{{ pickResult }}</pre>
            <div
              v-else
              class="grid h-[28rem] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/50"
            >
              点击「应用」生成结果
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Type tab ==================== -->
      <div v-else-if="tab === 'type'">
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="card">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">输入 JSON</h3>
              <button
                class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                @click="loadTypeExample"
              >
                载入示例
              </button>
            </div>
            <textarea
              v-model="typeInput"
              class="input h-72 resize-none font-mono text-xs"
              placeholder="粘贴 JSON 样例数据..."
              spellcheck="false"
            />
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label class="label">目标语言</label>
                <select v-model="typeLang" class="input">
                  <option value="ts">TypeScript</option>
                  <option value="go">Go</option>
                  <option value="java">Java</option>
                  <option value="python">Python</option>
                </select>
              </div>
              <div>
                <label class="label">根类型名</label>
                <input v-model="typeRootName" class="input" placeholder="Root" />
              </div>
            </div>
            <button class="btn-primary mt-3 w-full" @click="doGenerateType">生成类型</button>
            <div
              v-if="typeError"
              class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
            >
              {{ typeError }}
            </div>
          </div>
          <div class="card">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">
                {{ langLabel[typeLang] }} 类型定义
              </h3>
              <button
                v-if="typeResult"
                class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                @click="copyTypeResult"
              >
                复制
              </button>
            </div>
            <pre
              v-if="typeResult"
              class="max-h-[28rem] overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-slate-950"
            >{{ typeResult }}</pre>
            <div
              v-else
              class="grid h-[28rem] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/50"
            >
              选语言 + 粘贴 JSON 后生成
            </div>
          </div>
        </div>
        <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          <h4 class="mb-1.5 font-semibold text-slate-700 dark:text-slate-300">类型推断说明</h4>
          <ul class="space-y-1 text-xs">
            <li>· 数字: 整数 → <code>int</code>/<code>number</code>, 小数 → <code>float</code>/<code>number</code></li>
            <li>· 数组: 取所有元素的类型并集合, 对象数组会生成独立的 Item 类型</li>
            <li>· 嵌套对象: 递归生成, 每层用字段名 PascalCase 命名</li>
            <li>· null: 标为 nullable / Optional</li>
          </ul>
        </div>
      </div>

      <!-- ==================== Table tab ==================== -->
      <div v-else-if="tab === 'table'">
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="card">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">输入 JSON (对象数组)</h3>
              <button
                class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                @click="loadTableExample"
              >
                载入示例
              </button>
            </div>
            <textarea
              v-model="tableInput"
              class="input h-72 resize-none font-mono text-xs"
              placeholder='[{"name": "kevin", "age": 30}, ...]'
              spellcheck="false"
            />
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <label class="text-sm text-slate-600 dark:text-slate-400">输出格式</label>
              <div class="flex items-center gap-1 text-xs">
                <button
                  class="rounded-md border px-2 py-0.5 transition-colors"
                  :class="tableFormat === 'markdown' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                  @click="tableFormat = 'markdown'"
                >
                  Markdown
                </button>
                <button
                  class="rounded-md border px-2 py-0.5 transition-colors"
                  :class="tableFormat === 'html' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                  @click="tableFormat = 'html'"
                >
                  HTML
                </button>
              </div>
            </div>
            <button class="btn-primary mt-3 w-full" @click="doGenerateTable">生成表格</button>
            <div
              v-if="tableError"
              class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
            >
              {{ tableError }}
            </div>
          </div>
          <div class="card">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">
                {{ tableFormat === 'markdown' ? 'Markdown 表格' : 'HTML 表格' }}
                <span v-if="tableInfo" class="ml-2 text-xs font-normal text-slate-500">
                  {{ tableInfo.rowCount }} 行 · {{ tableInfo.columns.length }} 列
                </span>
              </h3>
              <button
                v-if="tableResult"
                class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                @click="copyTableResult"
              >
                复制
              </button>
            </div>
            <pre
              v-if="tableResult"
              class="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-slate-950"
            >{{ tableResult }}</pre>
            <div
              v-else
              class="grid h-72 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/50"
            >
              粘贴对象数组后生成
            </div>
            <!-- HTML 预览 -->
            <div v-if="tableResult && tableFormat === 'html'" class="mt-4">
              <div class="mb-2 text-xs font-medium text-slate-500">预览</div>
              <div
                class="max-h-72 overflow-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                v-html="tableResult"
              />
            </div>
          </div>
        </div>
        <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          <h4 class="mb-1.5 font-semibold text-slate-700 dark:text-slate-300">转换说明</h4>
          <ul class="space-y-1 text-xs">
            <li>· 输入必须是对象数组 <code>[&#123;...&#125;, ...]</code>, 单个对象也行 (当成一行)</li>
            <li>· 嵌套对象 / 数组值会被自动序列化为 JSON 字符串塞进单元格</li>
            <li>· 列按首次出现顺序; 各行缺的字段留空</li>
            <li>· Markdown: <code>|</code> 自动转义, 单元格换行变空格</li>
            <li>· HTML: 输出 <code>&lt;table&gt;</code> 标签, 直接粘到网页 / 邮件</li>
          </ul>
        </div>
      </div>
    </section>
  </Layout>
</template>
