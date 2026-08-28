<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { extractGifFrames, readGifInfo, bitmapToBlob, type ExtractedGifFrame, type GifInfo } from '@/utils/gifFrames'

const file = ref<File | null>(null)
const dragOver = ref(false)
const error = ref('')
const gifInfo = ref<GifInfo | null>(null)
const frames = ref<ExtractedGifFrame[]>([])
const processing = ref(false)
const progress = ref(0)

const frameUrls = ref<string[]>([])

function revokeUrls() {
  frameUrls.value.forEach((u) => URL.revokeObjectURL(u))
  frameUrls.value = []
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) loadFile(f)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFile(f)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function loadFile(f: File) {
  reset()
  file.value = f
  try {
    gifInfo.value = await readGifInfo(f)
  } catch (e) {
    error.value = 'GIF 解析失败: ' + (e as Error).message
  }
}

async function process() {
  if (!file.value) return
  processing.value = true
  progress.value = 0
  error.value = ''
  revokeUrls()
  frames.value = []
  try {
    const result = await extractGifFrames(file.value)
    frames.value = result.frames
    frameUrls.value = await Promise.all(
      result.frames.map(async (f) => {
        const blob = await bitmapToBlob(f.bitmap, 'image/png')
        return URL.createObjectURL(blob)
      })
    )
    progress.value = 100
  } catch (e) {
    error.value = '拆帧失败: ' + (e as Error).message
  } finally {
    processing.value = false
  }
}

async function downloadOne(idx: number) {
  const f = frames.value[idx]
  if (!f) return
  const blob = await bitmapToBlob(f.bitmap, 'image/png')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${file.value?.name.replace(/\.[^.]+$/, '')}-frame-${(idx + 1).toString().padStart(3, '0')}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function downloadZip() {
  if (!file.value || frames.value.length === 0) return
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const base = file.value.name.replace(/\.[^.]+$/, '')
  for (let i = 0; i < frames.value.length; i++) {
    const b = await bitmapToBlob(frames.value[i].bitmap, 'image/png')
    zip.file(`${base}-frame-${(i + 1).toString().padStart(3, '0')}.png`, b)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${base}-frames.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function reset() {
  file.value = null
  gifInfo.value = null
  error.value = ''
  revokeUrls()
  frames.value = []
  progress.value = 0
}

const fmtSize = (n: number) => (n / 1024).toFixed(1) + ' KB'
const fmtMs = (n: number) => n >= 1000 ? (n / 1000).toFixed(2) + ' s' : n + ' ms'

onUnmounted(() => {
  revokeUrls()
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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">GIF 拆帧</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">把 GIF 的每一帧拆成独立 PNG，可单张下载或全部打包</p>

      <div
        v-if="!file"
        class="rounded-2xl border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-slate-900"
        :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-600'"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
      >
        <input type="file" id="file-input" accept="image/gif" class="hidden" @change="onFileChange" />
        <label for="file-input" class="cursor-pointer">
          <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
          </div>
          <p class="text-base font-medium text-slate-700 dark:text-slate-200">点击或拖拽上传 GIF</p>
          <p class="mt-1 text-sm text-slate-500">仅支持 .gif 格式</p>
        </label>
      </div>

      <div v-else>
        <div class="card mb-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold text-slate-900 dark:text-white">{{ file.name }}</h3>
              <div v-if="gifInfo" class="mt-1 text-sm text-slate-500">
                {{ gifInfo.width }} × {{ gifInfo.height }} px · {{ gifInfo.frameCount }} 帧 · 总时长 {{ fmtMs(gifInfo.totalDurationMs) }} · {{ fmtSize(file.size) }}
              </div>
            </div>
            <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="reset">重新选择</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-primary flex-1" :disabled="processing" @click="process">
              <span v-if="processing">拆帧中…</span>
              <span v-else-if="frames.length">重新拆帧</span>
              <span v-else>开始拆帧</span>
            </button>
            <button v-if="frames.length" class="btn-secondary" @click="downloadZip">打包下载 (ZIP)</button>
          </div>
          <div v-if="error" class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {{ error }}
          </div>
        </div>

        <div v-if="frameUrls.length" class="grid gap-2" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(120px, 1fr))` }">
          <div v-for="(url, i) in frameUrls" :key="i" class="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <img :src="url" :alt="`第 ${i + 1} 帧`" class="block w-full" />
            <div class="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">#{{ i + 1 }}</div>
            <div class="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{{ frames[i]?.delay }}ms</div>
            <button
              @click="downloadOne(i)"
              class="absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100"
            >
              <span class="rounded bg-white/90 px-2 py-1 text-slate-700">下载</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
