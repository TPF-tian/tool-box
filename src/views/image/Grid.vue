<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { useImageFile } from '@/composables/useImageFile'
import { splitNineGrid } from '@/utils/imageTools'

const { file, previewUrl, originalInfo, dragOver, onFileChange, onDrop, onDragOver, onDragLeave, reset } = useImageFile()

const processing = ref(false)
const cells = ref<{ url: string; index: number }[]>([])
const cellSize = ref<{ w: number; h: number } | null>(null)

const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

async function process() {
  if (!file.value) return
  processing.value = true
  try {
    const { blobs, cellWidth, cellHeight } = await splitNineGrid(file.value)
    cells.value.forEach((c) => URL.revokeObjectURL(c.url))
    cells.value = blobs.map((b, i) => ({ url: URL.createObjectURL(b), index: i }))
    cellSize.value = { w: cellWidth, h: cellHeight }
  } catch (e) {
    alert('处理失败: ' + (e as Error).message)
  } finally {
    processing.value = false
  }
}

function downloadOne(idx: number) {
  const c = cells.value[idx]
  if (!c || !file.value) return
  const a = document.createElement('a')
  a.href = c.url
  const base = file.value.name.replace(/\.[^.]+$/, '')
  a.download = `${base}-grid-${idx + 1}.png`
  a.click()
}

async function downloadZip() {
  if (!file.value || cells.value.length === 0) return
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const base = file.value.name.replace(/\.[^.]+$/, '')
  for (let i = 0; i < cells.value.length; i++) {
    const r = await fetch(cells.value[i].url)
    const b = await r.blob()
    zip.file(`${base}-grid-${i + 1}.png`, b)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${base}-九宫格.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadAll() {
  if (!file.value || cells.value.length === 0) return
  const base = file.value.name.replace(/\.[^.]+$/, '')
  // 错开点击时间避免浏览器拦截多次下载
  cells.value.forEach((c, i) => {
    setTimeout(() => {
      const a = document.createElement('a')
      a.href = c.url
      a.download = `${base}-grid-${i + 1}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }, i * 200)
  })
}

function fullReset() {
  reset()
  cells.value.forEach((c) => URL.revokeObjectURL(c.url))
  cells.value = []
  cellSize.value = null
}

watch(() => file.value, () => {
  cells.value.forEach((c) => URL.revokeObjectURL(c.url))
  cells.value = []
  cellSize.value = null
})

onUnmounted(() => {
  cells.value.forEach((c) => URL.revokeObjectURL(c.url))
})
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-6xl px-4 py-10">
      <RouterLink to="/image" class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
        返回图像工具
      </RouterLink>
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">九宫格切图</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">把图片切成 3×3 共 9 份，可单独下载或一次性打包 ZIP</p>

      <div
        v-if="!file"
        class="rounded-2xl border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-slate-900"
        :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-600'"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
      >
        <input type="file" id="file-input" accept="image/*" class="hidden" @change="onFileChange" />
        <label for="file-input" class="cursor-pointer">
          <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
          </div>
          <p class="text-base font-medium text-slate-700 dark:text-slate-200">点击或拖拽上传图片</p>
        </label>
      </div>

      <div v-else>
        <div class="card mb-4">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white">
              切图
              <span v-if="cellSize" class="ml-2 text-xs font-normal text-slate-500">
                每格 {{ cellSize.w }} × {{ cellSize.h }} px
              </span>
            </h3>
            <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="fullReset">重新选择</button>
          </div>
          <div class="mb-4 flex flex-wrap gap-2">
            <button class="btn-primary flex-1" :disabled="processing" @click="process">
              <span v-if="processing">切图中…</span>
              <span v-else>{{ cells.length ? '重新切图' : '开始切图' }}</span>
            </button>
            <button v-if="cells.length" class="btn-secondary" @click="downloadAll">下载全部</button>
            <button v-if="cells.length" class="btn-secondary" @click="downloadZip">打包 ZIP</button>
          </div>

          <div v-if="cells.length">
            <!-- 完整图 + 3×3 切分线 -->
            <div class="flex justify-center">
              <div class="relative inline-block" style="max-height: 480px">
                <img
                  :src="previewUrl"
                  class="block max-h-[480px] w-auto rounded-lg"
                  style="max-width: 100%"
                  alt="原图预览"
                />
                <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <div v-for="i in 9" :key="i" class="border border-white/60"></div>
                </div>
                <!-- 9 个编号标签 -->
                <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <div v-for="i in 9" :key="i" class="relative">
                    <span class="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{{ i }}</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- 单张下载按钮 -->
            <div class="mt-4">
              <div class="mb-2 text-xs text-slate-500">下载单张</div>
              <div class="grid grid-cols-9 gap-1.5">
                <button
                  v-for="(c, i) in cells"
                  :key="i"
                  @click="downloadOne(i)"
                  class="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:bg-brand-950 dark:hover:text-brand-300"
                >
                  {{ i + 1 }}
                </button>
              </div>
            </div>
          </div>

          <div v-else-if="previewUrl" class="flex justify-center">
            <div class="relative inline-block" style="max-height: 480px">
              <img
                :src="previewUrl"
                class="block max-h-[480px] w-auto rounded-lg"
                style="max-width: 100%"
                alt="原图预览"
              />
              <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                <div v-for="i in 9" :key="i" class="border border-white/50"></div>
              </div>
            </div>
          </div>
          <p v-if="previewUrl && cells.length === 0" class="mt-2 text-center text-xs text-slate-500">预览中显示 3×3 切分线</p>
        </div>
      </div>
    </section>
  </Layout>
</template>
