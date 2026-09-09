<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { getImageInfo } from '@/utils/imageTools'
import { extractGifFrames, readGifInfo, type ExtractedGifFrame, type GifInfo } from '@/utils/gifFrames'

type Mode = 'images' | 'gif'

type Frame = {
  id: string
  file: File
  url: string
  width: number
  height: number
  durationSec: number // 每张图停留秒数
}

const mode = ref<Mode>('images')
const dragOver = ref(false)
const processing = ref(false)
const error = ref('')
const progressText = ref('')
const progressPct = ref(0)
const resultUrl = ref('')
const resultSize = ref(0)
const resultExt = ref<'webm' | 'mp4'>('webm')
const resultFormatLabel = ref('WebM')

// 多图模式状态
const frames = ref<Frame[]>([])
const globalDuration = ref(2) // 秒
const defaultDurationMin = 0.2

// GIF 模式状态
const gifFile = ref<File | null>(null)
const gifInfo = ref<GifInfo | null>(null)
const gifFrames = ref<ExtractedGifFrame[]>([])
const gifPreviewUrl = ref('')

// 视频格式
const videoFormatId = ref('webm-vp9')

type VideoFormat = {
  id: string
  label: string
  desc: string
  mimeType: string
  ext: 'webm' | 'mp4'
}

const videoFormatOptions: VideoFormat[] = [
  { id: 'webm-vp9', label: 'WebM · VP9', desc: '更高压缩率', mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
  { id: 'webm-vp8', label: 'WebM · VP8', desc: '默认, 兼容性最好', mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
  { id: 'mp4-h264', label: 'MP4 · H.264', desc: 'Safari / Chrome 116+', mimeType: 'video/mp4;codecs=avc1.42E01F', ext: 'mp4' }
]

const supportedVideoFormats = computed(() => {
  if (typeof MediaRecorder === 'undefined') return []
  return videoFormatOptions.filter((f) => MediaRecorder.isTypeSupported(f.mimeType))
})

watch(supportedVideoFormats, (formats) => {
  if (formats.length > 0 && !formats.find((f) => f.id === videoFormatId.value)) {
    videoFormatId.value = formats[0].id
  }
}, { immediate: true })

const MAX_DIM = 1920

// ============= 多图模式: 上传/帧管理 =============
function onFilesChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (mode.value !== 'images') return
  const files = e.dataTransfer?.files
  if (files) addFiles(files)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function addFiles(fileList: FileList | File[]) {
  const list = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
  if (list.length === 0) return
  const newFrames: Frame[] = []
  for (const file of list) {
    const info = await getImageInfo(file)
    newFrames.push({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      width: info.width,
      height: info.height,
      durationSec: globalDuration.value
    })
  }
  frames.value.push(...newFrames)
  // 加图后清掉旧结果
  clearResult()
}

function removeFrame(id: string) {
  const idx = frames.value.findIndex((f) => f.id === id)
  if (idx >= 0) {
    URL.revokeObjectURL(frames.value[idx].url)
    frames.value.splice(idx, 1)
  }
  clearResult()
}

function moveFrame(id: string, dir: -1 | 1) {
  const idx = frames.value.findIndex((f) => f.id === id)
  const newIdx = idx + dir
  if (idx >= 0 && newIdx >= 0 && newIdx < frames.value.length) {
    const [item] = frames.value.splice(idx, 1)
    frames.value.splice(newIdx, 0, item!)
  }
  clearResult()
}

function applyGlobalDuration() {
  for (const f of frames.value) f.durationSec = globalDuration.value
}

function clearImages() {
  frames.value.forEach((f) => URL.revokeObjectURL(f.url))
  frames.value = []
  clearResult()
}

const totalDurationSec = computed(() => {
  return frames.value.reduce((s, f) => s + (f.durationSec || 0), 0)
})

const fmtSec = (s: number) => {
  if (s < 1) return (s * 1000).toFixed(0) + ' ms'
  return s.toFixed(1) + ' s'
}

// ============= GIF 模式: 上传/解析 =============
function onGifFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) loadGifFile(input.files[0])
  input.value = ''
}

function onGifDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  if (f.type === 'image/gif' || f.name.toLowerCase().endsWith('.gif')) loadGifFile(f)
}

async function loadGifFile(f: File) {
  clearGif()
  gifFile.value = f
  try {
    progressText.value = '解析 GIF 元信息...'
    progressPct.value = 10
    gifInfo.value = await readGifInfo(f)
    progressText.value = `拆 ${gifInfo.value.frameCount} 帧...`
    progressPct.value = 20
    const extracted = await extractGifFrames(f)
    gifFrames.value = extracted.frames
    if (extracted.frames.length > 0) {
      const bmp = extracted.frames[0].bitmap
      const cv = document.createElement('canvas')
      cv.width = bmp.width
      cv.height = bmp.height
      const cx = cv.getContext('2d')!
      cx.drawImage(bmp, 0, 0)
      gifPreviewUrl.value = await new Promise<string>((resolve) =>
        cv.toBlob((blob) => resolve(URL.createObjectURL(blob!)), 'image/png')
      )
    }
    progressPct.value = 0
    progressText.value = ''
  } catch (e) {
    error.value = 'GIF 解析失败: ' + (e as Error).message
  }
}

function clearGif() {
  if (gifPreviewUrl.value) URL.revokeObjectURL(gifPreviewUrl.value)
  gifPreviewUrl.value = ''
  gifFile.value = null
  gifInfo.value = null
  gifFrames.value.forEach((f) => f.bitmap.close())
  gifFrames.value = []
  clearResult()
}

function clearAll() {
  clearImages()
  clearGif()
  error.value = ''
}

function clearResult() {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultUrl.value = ''
  resultSize.value = 0
  progressText.value = ''
  progressPct.value = 0
}

// ============= 视频生成核心 =============

function getCanvasSize(): { w: number; h: number } {
  if (mode.value === 'images') {
    if (frames.value.length === 0) return { w: 1280, h: 720 }
    let w = frames.value[0].width
    let h = frames.value[0].height
    if (w > MAX_DIM || h > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    return { w, h }
  } else {
    if (!gifInfo.value) return { w: 480, h: 320 }
    let w = gifInfo.value.width
    let h = gifInfo.value.height
    if (w > MAX_DIM || h > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    return { w, h }
  }
}

/**
 * 把图等比缩放居中画到 ctx, 背景填黑
 */
function drawImageFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement | ImageBitmap, canvasW: number, canvasH: number) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasW, canvasH)
  const sw = (img as HTMLImageElement).naturalWidth ?? (img as ImageBitmap).width
  const sh = (img as HTMLImageElement).naturalHeight ?? (img as ImageBitmap).height
  const scale = Math.min(canvasW / sw, canvasH / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (canvasW - dw) / 2
  const dy = (canvasH - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

async function generateVideo() {
  // 校验
  if (mode.value === 'images' && frames.value.length < 2) {
    error.value = '至少需要 2 张图片'
    return
  }
  if (mode.value === 'gif' && gifFrames.value.length === 0) {
    error.value = '请先选择 GIF'
    return
  }
  if (typeof MediaRecorder === 'undefined') {
    error.value = '当前浏览器不支持 MediaRecorder, 无法生成视频'
    return
  }
  const format = supportedVideoFormats.value.find((f) => f.id === videoFormatId.value)
  if (!format) {
    error.value = '当前浏览器不支持所选视频格式'
    return
  }

  processing.value = true
  error.value = ''
  clearResult()
  progressPct.value = 0
  progressText.value = '准备编码器...'

  try {
    const { w, h } = getCanvasSize()
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!

    const stream = canvas.captureStream(0)
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
    const recorder = new MediaRecorder(stream, { mimeType: format.mimeType })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    await new Promise<void>((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: format.mimeType })
        resultUrl.value = URL.createObjectURL(blob)
        resultSize.value = blob.size
        resultExt.value = format.ext
        resultFormatLabel.value = format.label
        progressPct.value = 100
        progressText.value = '完成'
        resolve()
      }
      recorder.onerror = () => reject(new Error('录制出错'))
      recorder.start()

      if (mode.value === 'images') {
        // 多图模式: 预加载所有图, 按顺序 + durationSec 切换
        runImagesSequence(ctx, w, h, track, recorder).catch(reject)
      } else {
        // GIF 模式: 按 GIF 帧 delay 顺序画
        runGifSequence(ctx, w, h, track, recorder).catch(reject)
      }
    })
  } catch (e) {
    error.value = '生成视频失败: ' + (e as Error).message
  } finally {
    processing.value = false
  }
}

async function runImagesSequence(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  track: CanvasCaptureMediaStreamTrack,
  recorder: MediaRecorder
) {
  progressText.value = '加载图片...'
  const images: HTMLImageElement[] = []
  for (let i = 0; i < frames.value.length; i++) {
    images.push(await loadImage(frames.value[i].url))
  }

  const totalMs = totalDurationSec.value * 1000
  let elapsed = 0
  for (let i = 0; i < images.length; i++) {
    drawImageFit(ctx, images[i], w, h)
    if (track.requestFrame) track.requestFrame()
    const durMs = Math.max(50, frames.value[i].durationSec * 1000)
    progressText.value = `录制 ${i + 1} / ${images.length}`
    progressPct.value = totalMs > 0 ? Math.min(100, (elapsed / totalMs) * 100) : 0
    elapsed += durMs
    await new Promise<void>((r) => setTimeout(r, durMs))
  }
  // 缓冲 100ms 再停
  await new Promise<void>((r) => setTimeout(r, 100))
  recorder.stop()
}

async function runGifSequence(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  track: CanvasCaptureMediaStreamTrack,
  recorder: MediaRecorder
) {
  for (let i = 0; i < gifFrames.value.length; i++) {
    const f = gifFrames.value[i]
    drawImageFit(ctx, f.bitmap, w, h)
    if (track.requestFrame) track.requestFrame()
    progressText.value = `录制帧 ${i + 1} / ${gifFrames.value.length}`
    progressPct.value = ((i + 1) / gifFrames.value.length) * 100
    await new Promise<void>((r) => setTimeout(r, f.delay))
  }
  await new Promise<void>((r) => setTimeout(r, 50))
  recorder.stop()
}

function download() {
  if (!resultUrl.value) return
  const a = document.createElement('a')
  a.href = resultUrl.value
  a.download = `toolbox-tovideo-${Date.now()}.${resultExt.value}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const fmt = (n: number) => (n / 1024).toFixed(1) + ' KB'

onUnmounted(() => {
  frames.value.forEach((f) => URL.revokeObjectURL(f.url))
  if (gifPreviewUrl.value) URL.revokeObjectURL(gifPreviewUrl.value)
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  gifFrames.value.forEach((f) => f.bitmap.close())
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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">图片 / GIF 转视频</h1>
      <p class="mb-6 text-slate-500 dark:text-slate-400">
        多张图片按顺序合成视频 (每张可独立调时长), 或把 GIF 拆帧导出为 WebM/MP4
      </p>

      <!-- 模式切换 -->
      <div class="mb-6 flex gap-2">
        <button
          class="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          :class="mode === 'images' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
          @click="mode = 'images'; clearAll()"
        >
          🖼️ 多图转视频
        </button>
        <button
          class="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          :class="mode === 'gif' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
          @click="mode = 'gif'; clearAll()"
        >
          🎞️ GIF 转视频
        </button>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2 space-y-4">
          <!-- ============ 多图模式: 上传区 (无帧时) ============ -->
          <div v-if="mode === 'images' && frames.length === 0" class="card">
            <div
              class="rounded-2xl border-2 border-dashed p-12 text-center transition-colors"
              :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 hover:border-brand-400 dark:hover:border-brand-600'"
              @drop="onDrop"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
            >
              <input type="file" id="images-input" multiple accept="image/*" class="hidden" @change="onFilesChange" />
              <label for="images-input" class="cursor-pointer">
                <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="6" width="14" height="12" rx="2" />
                    <path d="m22 8-6 4 6 4V8Z" />
                    <path d="M5 6V4M9 6V4M13 6V4" />
                  </svg>
                </div>
                <p class="text-base font-medium text-slate-700 dark:text-slate-200">选择多张图片 (至少 2 张)</p>
                <p class="mt-1 text-sm text-slate-500">支持 JPG / PNG / WebP, 顺序就是播放顺序</p>
              </label>
            </div>
          </div>

          <!-- ============ 多图模式: 帧列表 + 设置 ============ -->
          <template v-if="mode === 'images' && frames.length > 0">
            <!-- 帧列表 -->
            <div class="card">
              <div class="mb-3 flex flex-wrap items-center gap-3">
                <h3 class="font-semibold text-slate-900 dark:text-white">图片列表 · {{ frames.length }} 张 · 总时长 {{ fmtSec(totalDurationSec) }}</h3>
                <button class="ml-auto rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900" @click="clearImages">清空</button>
              </div>
              <div class="space-y-2">
                <div
                  v-for="(frame, i) in frames"
                  :key="frame.id"
                  class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <span class="w-6 text-center text-sm tabular-nums text-slate-500">{{ i + 1 }}</span>
                  <img :src="frame.url" class="h-12 w-12 rounded object-cover" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm">{{ frame.file.name }}</div>
                    <div class="text-xs text-slate-500">{{ frame.width }}×{{ frame.height }} · {{ fmt(frame.file.size) }}</div>
                  </div>
                  <input type="number" v-model.number="frame.durationSec" :min="defaultDurationMin" step="0.1" class="input w-20 py-1 text-sm" title="单张停留时长" />
                  <span class="text-xs text-slate-500">秒</span>
                  <div class="flex gap-0.5">
                    <button class="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" :disabled="i === 0" @click="moveFrame(frame.id, -1)" title="上移">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>
                    <button class="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700" :disabled="i === frames.length - 1" @click="moveFrame(frame.id, 1)" title="下移">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                  <button class="rounded p-1 text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400" @click="removeFrame(frame.id)" title="删除">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <label class="cursor-pointer">
                  <input type="file" multiple accept="image/*" @change="onFilesChange" class="hidden" />
                  <span class="btn-secondary text-sm">+ 添加更多图片</span>
                </label>
                <span class="mx-1 hidden h-4 w-px bg-slate-200 sm:inline-block dark:bg-slate-700"></span>
                <label class="text-sm text-slate-600 dark:text-slate-400">应用到全部</label>
                <input type="number" v-model.number="globalDuration" :min="defaultDurationMin" step="0.1" class="input w-20 py-1 text-sm" />
                <span class="text-xs text-slate-500">秒</span>
                <button class="btn-secondary text-xs" @click="applyGlobalDuration">应用</button>
              </div>
            </div>

            <!-- 生成 -->
            <div class="card">
              <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">生成</h3>
              <div class="mb-3">
                <label class="label">视频格式</label>
                <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <button
                    v-for="f in supportedVideoFormats"
                    :key="f.id"
                    class="rounded-lg border px-3 py-2 text-left text-xs transition-colors"
                    :class="videoFormatId === f.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                    @click="videoFormatId = f.id"
                  >
                    <div class="font-medium">{{ f.label }}</div>
                    <div class="text-[10px] text-slate-500">{{ f.desc }}</div>
                  </button>
                </div>
                <p v-if="supportedVideoFormats.length === 0" class="text-xs text-rose-500 mt-1">当前浏览器不支持任何视频格式</p>
              </div>
              <button class="btn-primary w-full" :disabled="processing || frames.length < 2" @click="generateVideo">
                <span v-if="processing">处理中…</span>
                <span v-else-if="frames.length < 2">至少需要 2 张图片</span>
                <span v-else>生成视频 ({{ frames.length }} 张 · {{ fmtSec(totalDurationSec) }})</span>
              </button>
              <div v-if="processing" class="mt-3">
                <div class="mb-1 text-xs text-slate-500">{{ progressText }} {{ progressPct.toFixed(0) }}%</div>
                <div class="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div class="h-full bg-brand-500 transition-all" :style="{ width: progressPct + '%' }"></div>
                </div>
              </div>
              <div v-if="error" class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {{ error }}
              </div>
            </div>
          </template>

          <!-- ============ GIF 模式: 上传区 ============ -->
          <div v-if="mode === 'gif' && !gifFile" class="card">
            <div
              class="rounded-2xl border-2 border-dashed p-12 text-center transition-colors"
              :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-brand-900/20 hover:border-brand-400 dark:hover:border-brand-600'"
              @drop="onGifDrop"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
            >
              <input type="file" id="gif-input" accept="image/gif" class="hidden" @change="onGifFileChange" />
              <label for="gif-input" class="cursor-pointer">
                <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 3v18" />
                  </svg>
                </div>
                <p class="text-base font-medium text-slate-700 dark:text-slate-200">选择一个 GIF</p>
                <p class="mt-1 text-sm text-slate-500">自动拆帧导出, 保留原 GIF 帧间隔</p>
              </label>
            </div>
          </div>

          <!-- ============ GIF 模式: 已上传, 显示设置 ============ -->
          <div v-if="mode === 'gif' && gifFile && gifInfo" class="card">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">设置</h3>
              <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="clearGif">重新选择</button>
            </div>

            <div class="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div class="text-xs text-slate-500">尺寸</div>
                  <div class="font-medium">{{ gifInfo.width }}×{{ gifInfo.height }}</div>
                </div>
                <div>
                  <div class="text-xs text-slate-500">帧数</div>
                  <div class="font-medium">{{ gifInfo.frameCount }}</div>
                </div>
                <div>
                  <div class="text-xs text-slate-500">时长</div>
                  <div class="font-medium">{{ (gifInfo.totalDurationMs / 1000).toFixed(2) }}s</div>
                </div>
              </div>
            </div>

            <div class="mb-4">
              <label class="label">视频格式</label>
              <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                <button
                  v-for="f in supportedVideoFormats"
                  :key="f.id"
                  class="rounded-lg border px-3 py-2 text-left text-xs transition-colors"
                  :class="videoFormatId === f.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                  @click="videoFormatId = f.id"
                >
                  <div class="font-medium">{{ f.label }}</div>
                  <div class="text-[10px] text-slate-500">{{ f.desc }}</div>
                </button>
              </div>
              <p v-if="supportedVideoFormats.length === 0" class="text-xs text-rose-500 mt-1">当前浏览器不支持任何视频格式</p>
            </div>

            <button class="btn-primary w-full" :disabled="processing" @click="generateVideo">
              <span v-if="processing">处理中…</span>
              <span v-else>生成视频</span>
            </button>
            <div v-if="processing" class="mt-3">
              <div class="mb-1 text-xs text-slate-500">{{ progressText }} {{ progressPct.toFixed(0) }}%</div>
              <div class="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div class="h-full bg-brand-500 transition-all" :style="{ width: progressPct + '%' }"></div>
              </div>
            </div>
            <div v-if="error" class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {{ error }}
            </div>
          </div>

          <!-- ============ 结果区 (两模式共享) ============ -->
          <div v-if="resultUrl" class="card animate-fade-in">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-semibold text-slate-900 dark:text-white">
                结果 · {{ resultFormatLabel }}
                <span class="ml-2 text-xs font-normal text-slate-500">
                  {{ fmt(resultSize) }}
                </span>
              </h3>
              <button class="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" @click="download">下载</button>
            </div>
            <video
              :src="resultUrl"
              controls
              autoplay
              loop
              class="max-h-96 w-full rounded bg-black object-contain"
            />
          </div>
        </div>

        <!-- 右侧: 说明 -->
        <div class="space-y-4">
          <div v-if="mode === 'images' && frames.length > 0" class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">使用说明</h3>
            <ul class="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>· 至少 2 张图才能生成视频</li>
              <li>· 画布尺寸 = 第一张图尺寸, 最长边自动限制 1920px</li>
              <li>· 其他图按比例居中, 空白填黑底</li>
              <li>· 每张可独立调停留时长, 也可"应用全部"</li>
              <li>· 帧顺序就是播放顺序, 可上下移调整</li>
            </ul>
          </div>

          <div v-if="mode === 'images' && frames.length === 0" class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">使用说明</h3>
            <ul class="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>· 选多张图片, 按顺序合成视频</li>
              <li>· 每张图可独立设置停留时长</li>
              <li>· 输出 WebM / MP4 视频, 浏览器内完成</li>
              <li>· 单张图转视频请用下面 GIF 转视频 + 静态帧, 或用图片转 GIF</li>
            </ul>
          </div>

          <div v-if="mode === 'gif' && gifFile && gifInfo" class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">GIF 预览</h3>
            <img v-if="gifPreviewUrl" :src="gifPreviewUrl" class="mb-3 max-h-72 w-full rounded-lg object-contain" alt="GIF 第 1 帧" />
            <p class="text-xs text-slate-500">仅显示第 1 帧预览, 实际按所有帧+delay 生成视频</p>
          </div>

          <div v-if="mode === 'gif' && !gifFile" class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">使用说明</h3>
            <ul class="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>· 选一个 GIF, 自动拆帧</li>
              <li>· 保留原 GIF 帧间隔</li>
              <li>· 输出 WebM / MP4 视频</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
