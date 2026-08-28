<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { compressImage, resizeImage, convertImage, getImageInfo, type ImageInfo } from '@/utils/imageTools'

const file = ref<File | null>(null)
const previewUrl = ref('')
const originalInfo = ref<ImageInfo | null>(null)
const processedUrl = ref('')
const processedInfo = ref<ImageInfo | null>(null)
const processing = ref(false)

const mode = ref<'compress' | 'resize' | 'convert'>('compress')
const quality = ref(80)
const maxWidth = ref(1920)
const keepOriginalSize = ref(false)
const targetFormat = ref<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg')

const dragOver = ref(false)

function revokeAll() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  if (processedUrl.value) URL.revokeObjectURL(processedUrl.value)
  previewUrl.value = ''
  processedUrl.value = ''
  processedInfo.value = null
}

async function loadFile(f: File) {
  revokeAll()
  file.value = f
  previewUrl.value = URL.createObjectURL(f)
  originalInfo.value = await getImageInfo(f)
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
  if (f && f.type.startsWith('image/')) loadFile(f)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function process() {
  if (!file.value) return
  processing.value = true
  try {
    let blob: Blob
    if (mode.value === 'compress') {
      blob = await compressImage(file.value, {
        quality: quality.value / 100,
        maxWidth: keepOriginalSize.value ? undefined : maxWidth.value
      })
    } else if (mode.value === 'resize') {
      blob = await resizeImage(file.value, {
        maxWidth: keepOriginalSize.value ? undefined : maxWidth.value
      })
    } else {
      blob = await convertImage(file.value, {
        type: targetFormat.value,
        quality: quality.value / 100
      })
    }
    if (processedUrl.value) URL.revokeObjectURL(processedUrl.value)
    processedUrl.value = URL.createObjectURL(blob)
    processedInfo.value = await getImageInfo(new File([blob], 'out', { type: blob.type }))
  } catch (e) {
    alert('处理失败: ' + (e as Error).message)
  } finally {
    processing.value = false
  }
}

function download() {
  if (!processedUrl.value || !file.value) return
  const a = document.createElement('a')
  a.href = processedUrl.value
  const ext = processedInfo.value?.mime.split('/')[1] || 'png'
  a.download = file.value.name.replace(/\.[^.]+$/, '') + '-processed.' + ext
  a.click()
}

function reset() {
  revokeAll()
  file.value = null
  originalInfo.value = null
}

const reduction = computed(() => {
  if (!originalInfo.value || !processedInfo.value) return null
  return ((originalInfo.value.size - processedInfo.value.size) / originalInfo.value.size) * 100
})

const fmt = (n: number) => (n / 1024).toFixed(1) + ' KB'

onUnmounted(() => revokeAll())
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-6xl px-4 py-10">
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">图像处理</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">压缩、转换、调整尺寸 — 全程在浏览器内处理，文件不上传</p>

      <!-- 上传区 -->
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
          <p class="mt-1 text-sm text-slate-500">支持 JPG / PNG / WebP / GIF</p>
        </label>
      </div>

      <!-- 处理区 -->
      <div v-else class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="card">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">设置</h3>
              <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="reset">重新选择</button>
            </div>
            <div class="mb-4 flex gap-2">
              <button
                v-for="m in ['compress', 'resize', 'convert'] as const"
                :key="m"
                class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                :class="mode === m ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
                @click="mode = m"
              >
                {{ m === 'compress' ? '压缩' : m === 'resize' ? '尺寸' : '格式' }}
              </button>
            </div>

            <div class="space-y-4">
              <div v-if="mode === 'compress' || mode === 'convert'">
                <label class="label">质量: {{ quality }}%</label>
                <input type="range" min="10" max="100" v-model.number="quality" class="w-full accent-brand-600" />
              </div>
              <div v-if="mode === 'resize' || mode === 'compress'">
                <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" v-model="keepOriginalSize" class="rounded accent-brand-600" />
                  保持原图尺寸
                </label>
                <div v-if="!keepOriginalSize" class="mt-2">
                  <label class="label">最大宽度: {{ maxWidth }}px</label>
                  <input type="range" min="320" max="3840" step="10" v-model.number="maxWidth" class="w-full accent-brand-600" />
                </div>
              </div>
              <div v-if="mode === 'convert'">
                <label class="label">目标格式</label>
                <select v-model="targetFormat" class="input">
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="image/webp">WebP</option>
                </select>
              </div>
            </div>

            <button class="btn-primary mt-6 w-full" :disabled="processing" @click="process">
              <span v-if="processing">处理中…</span>
              <span v-else>开始处理</span>
            </button>
            <button v-if="processedUrl" class="btn-secondary mt-2 w-full" @click="download">下载结果</button>
          </div>

          <div v-if="processedInfo" class="card mt-4 animate-fade-in">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">处理结果</h3>
            <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <div class="text-slate-500">大小</div>
                <div class="font-medium">{{ fmt(processedInfo.size) }}</div>
              </div>
              <div>
                <div class="text-slate-500">尺寸</div>
                <div class="font-medium">{{ processedInfo.width }}×{{ processedInfo.height }}</div>
              </div>
              <div>
                <div class="text-slate-500">格式</div>
                <div class="font-medium">{{ processedInfo.mime.split('/')[1].toUpperCase() }}</div>
              </div>
              <div v-if="reduction !== null">
                <div class="text-slate-500">体积变化</div>
                <div
                  class="font-medium"
                  :class="reduction > 0 ? 'text-emerald-600 dark:text-emerald-400' : reduction < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'"
                >
                  {{ reduction > 0 ? '-' : reduction < 0 ? '+' : '' }}{{ Math.abs(reduction).toFixed(1) }}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">原图</h3>
            <img v-if="previewUrl" :src="previewUrl" class="mb-3 max-h-64 w-full rounded-lg bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22><rect width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/><rect x=%228%22 y=%228%22 width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/></svg>')] object-contain" alt="preview" />
            <div v-if="originalInfo" class="space-y-1 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">大小</span><span>{{ fmt(originalInfo.size) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">尺寸</span><span>{{ originalInfo.width }}×{{ originalInfo.height }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">格式</span><span>{{ originalInfo.mime.split('/')[1].toUpperCase() }}</span></div>
            </div>
          </div>
          <div v-if="processedUrl" class="card mt-4 animate-fade-in">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">预览</h3>
            <img :src="processedUrl" class="max-h-64 w-full rounded-lg bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22><rect width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/><rect x=%228%22 y=%228%22 width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/></svg>')] object-contain" alt="result" />
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
