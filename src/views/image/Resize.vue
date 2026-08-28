<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { useImageFile } from '@/composables/useImageFile'
import { resizeImage, getImageInfo, type ImageInfo } from '@/utils/imageTools'

const { file, previewUrl, originalInfo, dragOver, onFileChange, onDrop, onDragOver, onDragLeave, reset } = useImageFile()

const width = ref(0)
const height = ref(0)
const lockAspect = ref(true)
const mode = ref<'exact' | 'max'>('max')
const processing = ref(false)
const processedUrl = ref('')
const processedInfo = ref<ImageInfo | null>(null)

// 加载新图时初始化宽高
watch(originalInfo, (info) => {
  if (info) {
    width.value = info.width
    height.value = info.height
  }
})

const aspectRatio = computed(() => {
  if (!originalInfo.value || !originalInfo.value.height) return 1
  return originalInfo.value.width / originalInfo.value.height
})

watch(width, (w) => {
  if (lockAspect.value && originalInfo.value) {
    height.value = Math.round(w / aspectRatio.value)
  }
})
watch(height, (h) => {
  if (lockAspect.value && originalInfo.value) {
    width.value = Math.round(h * aspectRatio.value)
  }
})

async function process() {
  if (!file.value) return
  processing.value = true
  try {
    const opts: any = { quality: 0.92 }
    if (mode.value === 'exact') {
      opts.maxWidth = width.value
      opts.height = height.value
    } else {
      // 按比例缩放:取较短边作为 maxWidth 的对应
      if (!originalInfo.value) return
      if (originalInfo.value.width >= originalInfo.value.height) {
        opts.maxWidth = width.value
      } else {
        opts.maxWidth = Math.round((width.value / originalInfo.value.width) * originalInfo.value.width)
        opts.height = height.value
      }
    }
    const blob = await resizeImage(file.value, opts)
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
  a.download = file.value.name.replace(/\.[^.]+$/, '') + `-${width.value}x${height.value}.` + ext
  a.click()
}

function fullReset() {
  reset()
  if (processedUrl.value) URL.revokeObjectURL(processedUrl.value)
  processedUrl.value = ''
  processedInfo.value = null
}

function setPreset(p: number) {
  if (!originalInfo.value) return
  if (lockAspect.value) {
    width.value = p
    height.value = Math.round(p / aspectRatio.value)
  }
}

const fmt = (n: number) => (n / 1024).toFixed(1) + ' KB'
const presets = [320, 640, 1280, 1920, 2560]

onUnmounted(() => {
  if (processedUrl.value) URL.revokeObjectURL(processedUrl.value)
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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">尺寸修改</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">精确指定宽高或按预设缩放，可锁定纵横比</p>

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

      <div v-else class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="card">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">设置</h3>
              <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="fullReset">重新选择</button>
            </div>
            <div class="mb-4 flex gap-2">
              <button
                class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                :class="mode === 'max' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
                @click="mode = 'max'"
              >
                按比例
              </button>
              <button
                class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                :class="mode === 'exact' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
                @click="mode = 'exact'"
              >
                精确尺寸
              </button>
            </div>

            <div class="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label class="label">宽 (px)</label>
                <input type="number" min="1" v-model.number="width" class="input" />
              </div>
              <div>
                <label class="label">高 (px)</label>
                <input type="number" min="1" v-model.number="height" class="input" />
              </div>
            </div>

            <label class="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" v-model="lockAspect" class="rounded accent-brand-600" />
              锁定纵横比
            </label>

            <div class="mb-2 text-xs text-slate-500">快捷预设</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="p in presets"
                :key="p"
                class="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                @click="setPreset(p)"
              >{{ p }}px</button>
            </div>

            <button class="btn-primary mt-6 w-full" :disabled="processing" @click="process">
              <span v-if="processing">处理中…</span>
              <span v-else>开始修改</span>
            </button>
            <button v-if="processedUrl" class="btn-secondary mt-2 w-full" @click="download">下载结果</button>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">原图</h3>
            <img v-if="previewUrl" :src="previewUrl" class="mb-3 max-h-64 w-full rounded-lg object-contain" alt="原图" />
            <div v-if="originalInfo" class="space-y-1 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">尺寸</span><span>{{ originalInfo.width }}×{{ originalInfo.height }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">大小</span><span>{{ fmt(originalInfo.size) }}</span></div>
            </div>
          </div>
          <div v-if="processedUrl" class="card mt-4 animate-fade-in">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">预览</h3>
            <img :src="processedUrl" class="max-h-64 w-full rounded-lg object-contain" alt="结果" />
            <div v-if="processedInfo" class="mt-3 space-y-1 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">尺寸</span><span>{{ processedInfo.width }}×{{ processedInfo.height }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">大小</span><span>{{ fmt(processedInfo.size) }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
