<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { getImageInfo } from '@/utils/imageTools'

type Frame = {
  id: string
  file: File
  url: string
  width: number
  height: number
  delay: number // ms
}

const frames = ref<Frame[]>([])
const globalDelay = ref(500)
const videoSpeed = ref(1)
const processing = ref(false)
const error = ref('')
const progressPct = ref(0)
const progressText = ref('')
const resultUrl = ref('')
const resultSize = ref(0)
const resultExt = ref<'gif' | 'webm' | 'mp4'>('gif')
const resultFormatLabel = ref('GIF')
const dragOver = ref(false)
const videoFormatId = ref('webm-vp9')

const MAX_DIM = 1920

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

// 如果当前选中的格式不被支持, 自动切到第一个支持的
watch(supportedVideoFormats, (formats) => {
  if (formats.length > 0 && !formats.find((f) => f.id === videoFormatId.value)) {
    videoFormatId.value = formats[0].id
  }
}, { immediate: true })

async function onFiles(files: FileList | File[]) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
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
      delay: globalDelay.value
    })
  }
  frames.value.push(...newFrames)
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) onFiles(input.files)
  // 清空 value,允许重复选同一批文件
  input.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (e.dataTransfer?.files) onFiles(e.dataTransfer.files)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function removeFrame(id: string) {
  const idx = frames.value.findIndex((f) => f.id === id)
  if (idx >= 0) {
    URL.revokeObjectURL(frames.value[idx].url)
    frames.value.splice(idx, 1)
  }
}

function moveFrame(id: string, dir: -1 | 1) {
  const idx = frames.value.findIndex((f) => f.id === id)
  const newIdx = idx + dir
  if (idx >= 0 && newIdx >= 0 && newIdx < frames.value.length) {
    const [item] = frames.value.splice(idx, 1)
    frames.value.splice(newIdx, 0, item!)
  }
}

function applyGlobalDelay() {
  for (const f of frames.value) f.delay = globalDelay.value
}

const speedOptions = [0.5, 1, 1.5, 2, 4]

const totalDurationMs = computed(() => {
  const sum = frames.value.reduce((s, f) => s + f.delay, 0)
  return videoSpeed.value > 0 ? sum / videoSpeed.value : sum
})

const fmtMs = (ms: number) => {
  if (ms < 1000) return Math.round(ms) + ' ms'
  return (ms / 1000).toFixed(2) + ' s'
}

function clearAll() {
  frames.value.forEach((f) => URL.revokeObjectURL(f.url))
  frames.value = []
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultUrl.value = ''
  resultSize.value = 0
  error.value = ''
  progressText.value = ''
  progressPct.value = 0
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

function getCanvasSize(): { w: number; h: number } {
  if (frames.value.length === 0) return { w: 100, h: 100 }
  // 用第一帧的尺寸做画布, 最长边限制 MAX_DIM
  let w = frames.value[0].width
  let h = frames.value[0].height
  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  return { w, h }
}

function drawFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement, canvasW: number, canvasH: number) {
  // 背景填白
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasW, canvasH)
  // 等比缩放居中
  const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  const x = (canvasW - w) / 2
  const y = (canvasH - h) / 2
  ctx.drawImage(img, x, y, w, h)
}

async function generateGif() {
  if (frames.value.length === 0) return
  processing.value = true
  error.value = ''
  progressPct.value = 0
  progressText.value = '准备 GIF 编码器...'
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultUrl.value = ''
  try {
    const [{ default: GIF }, workerMod] = await Promise.all([
      import('gif.js'),
      import('gif.js/dist/gif.worker.js?url')
    ])
    const workerUrl = workerMod.default
    const { w, h } = getCanvasSize()
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: w,
      height: h,
      workerScript: workerUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    for (let i = 0; i < frames.value.length; i++) {
      const frame = frames.value[i]
      const img = await loadImage(frame.url)
      drawFrame(ctx, img, w, h)
      // GIF delay 单位是 1/100s, 最小 1; 速度 > 1 时压缩延迟
      const gifDelay = Math.max(1, Math.round((frame.delay / videoSpeed.value) / 10))
      gif.addFrame(ctx, { copy: true, delay: gifDelay })
      progressText.value = `准备帧 ${i + 1} / ${frames.value.length}`
    }
    gif.on('progress', (p: number) => {
      progressPct.value = p * 100
      progressText.value = `编码 GIF: ${(p * 100).toFixed(0)}%`
    })
    await new Promise<void>((resolve, reject) => {
      gif.on('finished', (blob: Blob) => {
        resultUrl.value = URL.createObjectURL(blob)
        resultSize.value = blob.size
        resultExt.value = 'gif'
        resultFormatLabel.value = 'GIF'
        progressPct.value = 100
        progressText.value = '完成'
        resolve()
      })
      try {
        gif.render()
      } catch (e) {
        reject(e)
      }
    })
  } catch (e) {
    error.value = '生成 GIF 失败: ' + (e as Error).message
  } finally {
    processing.value = false
  }
}

async function generateVideo() {
  if (frames.value.length === 0) return
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
  progressPct.value = 0
  progressText.value = '准备视频编码器...'
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultUrl.value = ''
  try {
    const { w, h } = getCanvasSize()
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    // 预加载所有图片
    const images: HTMLImageElement[] = []
    for (let i = 0; i < frames.value.length; i++) {
      images.push(await loadImage(frames.value[i].url))
      progressText.value = `加载图片 ${i + 1} / ${frames.value.length}`
    }
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
      let i = 0
      const drawNext = () => {
        if (i >= images.length) {
          // 最后一帧多停留一个 delay
          const lastDelay = frames.value[frames.value.length - 1].delay / videoSpeed.value
          setTimeout(() => recorder.stop(), lastDelay)
          return
        }
        drawFrame(ctx, images[i], w, h)
        if (track.requestFrame) track.requestFrame()
        progressText.value = `录制 ${i + 1} / ${images.length}`
        progressPct.value = ((i + 1) / images.length) * 100
        const curDelay = frames.value[i].delay / videoSpeed.value
        i++
        setTimeout(drawNext, curDelay)
      }
      drawNext()
    })
  } catch (e) {
    error.value = '生成视频失败: ' + (e as Error).message
  } finally {
    processing.value = false
  }
}

function download() {
  if (!resultUrl.value) return
  const a = document.createElement('a')
  a.href = resultUrl.value
  a.download = `toolbox-${Date.now()}.${resultExt.value}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const fmt = (n: number) => (n / 1024).toFixed(1) + ' KB'

onUnmounted(() => {
  frames.value.forEach((f) => URL.revokeObjectURL(f.url))
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">图片转 GIF / 视频</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">多张图片按顺序合成动画, 输出 GIF 或 WebM 视频</p>

      <!-- 上传区 (无帧时) -->
      <div
        v-if="frames.length === 0"
        class="rounded-2xl border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-slate-900"
        :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-600'"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
      >
        <input type="file" id="file-input" multiple accept="image/*" class="hidden" @change="onFileChange" />
        <label for="file-input" class="cursor-pointer">
          <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
          </div>
          <p class="text-base font-medium text-slate-700 dark:text-slate-200">点击或拖拽上传多张图片</p>
          <p class="mt-1 text-sm text-slate-500">支持多选, 顺序就是动画顺序</p>
        </label>
      </div>

      <!-- 已有帧时 -->
      <div v-else class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2 space-y-4">
          <!-- 帧列表 -->
          <div class="card">
            <div class="mb-3 flex flex-wrap items-center gap-3">
              <h3 class="font-semibold text-slate-900 dark:text-white">帧列表 · {{ frames.length }} 帧</h3>
              <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
                <label class="text-slate-600 dark:text-slate-400">全局延迟</label>
                <input type="number" v-model.number="globalDelay" min="10" step="10" class="input w-20 py-1 text-sm" />
                <span class="text-xs text-slate-500">ms</span>
                <button class="btn-secondary text-xs" @click="applyGlobalDelay">应用全部</button>
                <span class="mx-1 hidden h-4 w-px bg-slate-200 sm:inline-block dark:bg-slate-700"></span>
                <label class="text-slate-600 dark:text-slate-400">速度</label>
                <button
                  v-for="s in speedOptions"
                  :key="s"
                  class="rounded-md border px-2 py-0.5 text-xs transition-colors"
                  :class="videoSpeed === s ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'"
                  @click="videoSpeed = s"
                >{{ s }}x</button>
                <span class="ml-1 text-xs text-slate-500">总时长 {{ fmtMs(totalDurationMs) }}</span>
                <button class="ml-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900" @click="clearAll">清空</button>
              </div>
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
                <input type="number" v-model.number="frame.delay" min="10" step="10" class="input w-20 py-1 text-sm" title="单帧延迟" />
                <span class="text-xs text-slate-500">ms</span>
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
            <label class="mt-3 inline-block cursor-pointer">
              <input type="file" multiple accept="image/*" @change="onFileChange" class="hidden" />
              <span class="btn-secondary text-sm">+ 添加更多图片</span>
            </label>
          </div>

          <!-- 生成 -->
          <div class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">生成</h3>
            <div class="space-y-3">
              <button class="btn-primary w-full" :disabled="processing" @click="generateGif">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
                生成 GIF
              </button>
              <div>
                <div class="mb-1.5 text-xs text-slate-500">视频格式</div>
                <div v-if="supportedVideoFormats.length === 0" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                  当前浏览器不支持任何视频格式
                </div>
                <div v-else class="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <button
                    v-for="f in supportedVideoFormats"
                    :key="f.id"
                    class="rounded-lg border px-3 py-1.5 text-left text-xs transition-colors"
                    :class="videoFormatId === f.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'"
                    @click="videoFormatId = f.id"
                  >
                    <div class="font-medium">{{ f.label }}</div>
                    <div class="text-[10px] text-slate-500">{{ f.desc }}</div>
                  </button>
                </div>
                <button class="btn-secondary mt-2 w-full" :disabled="processing" @click="generateVideo">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
                    <path d="m22 8-6 4 6 4V8Z" />
                    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                  </svg>
                  生成视频
                </button>
              </div>
            </div>
            <div v-if="processing" class="mt-3">
              <div class="mb-1 text-xs text-slate-500">{{ progressText }} {{ progressPct.toFixed(0) }}%</div>
              <div class="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div class="h-full bg-brand-500 transition-all" :style="{ width: progressPct + '%' }"></div>
              </div>
            </div>
            <div
              v-if="error"
              class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
            >
              {{ error }}
            </div>
          </div>

          <!-- 结果 -->
          <div v-if="resultUrl" class="card animate-fade-in">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-semibold text-slate-900 dark:text-white">
                结果
                <span class="ml-2 text-xs font-normal text-slate-500">
                  {{ resultFormatLabel }} · {{ fmt(resultSize) }} · {{ frames.length }} 帧 · {{ videoSpeed }}x · {{ fmtMs(totalDurationMs) }}
                </span>
              </h3>
              <button class="btn-secondary text-sm" @click="download">下载</button>
            </div>
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <img v-if="resultExt === 'gif'" :src="resultUrl" class="mx-auto block max-h-96 rounded object-contain" alt="GIF 结果" />
              <video v-else :src="resultUrl" controls loop class="mx-auto block max-h-96 rounded object-contain"></video>
            </div>
          </div>
        </div>

        <!-- 右侧说明 -->
        <div>
          <div class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">使用说明</h3>
            <ul class="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>· 画布尺寸 = 第一帧尺寸, 最长边自动限制 1920px</li>
              <li>· 其他帧按比例居中, 空白填白底</li>
              <li>· 帧顺序就是动画播放顺序</li>
              <li>· 可单独改每帧延迟, 也可"应用全部"</li>
              <li>· GIF 适合嵌入, 视频文件更小</li>
            </ul>
          </div>
          <div class="card mt-4">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">格式说明</h3>
            <div class="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div>
                <div class="font-medium text-slate-700 dark:text-slate-300">GIF</div>
                <div class="text-xs">浏览器/IM 通吃, 体积大, 颜色限制 256</div>
              </div>
              <div>
                <div class="font-medium text-slate-700 dark:text-slate-300">WebM (VP8/VP9)</div>
                <div class="text-xs">现代浏览器原生支持, 体积小, 颜色无损</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
