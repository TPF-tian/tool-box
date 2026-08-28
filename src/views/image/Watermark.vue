<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { useImageFile } from '@/composables/useImageFile'
import { addTextWatermark, getImageInfo, type ImageInfo } from '@/utils/imageTools'

const { file, previewUrl, originalInfo, dragOver, onFileChange, onDrop, onDragOver, onDragLeave, reset } = useImageFile()

const text = ref('ToolBox')
const fontSize = ref(32)
const color = ref('#ffffff')
const opacity = ref(0.85)
const position = ref<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'tile'>('bottom-right')
const rotate = ref(-30)
const processing = ref(false)
const processedUrl = ref('')
const processedInfo = ref<ImageInfo | null>(null)

const positions = [
  { value: 'top-left', label: '左上' },
  { value: 'top-right', label: '右上' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-right', label: '右下' },
  { value: 'center', label: '居中' },
  { value: 'tile', label: '平铺' }
] as const

async function process() {
  if (!file.value) return
  processing.value = true
  try {
    const blob = await addTextWatermark(file.value, {
      text: text.value,
      fontSize: fontSize.value,
      color: color.value,
      opacity: opacity.value,
      position: position.value,
      rotate: rotate.value
    })
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
  a.download = file.value.name.replace(/\.[^.]+$/, '') + '-watermarked.' + ext
  a.click()
}

function fullReset() {
  reset()
  if (processedUrl.value) URL.revokeObjectURL(processedUrl.value)
  processedUrl.value = ''
  processedInfo.value = null
}

const fmt = (n: number) => (n / 1024).toFixed(1) + ' KB'

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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">添加水印</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">文字水印，6 种位置，支持平铺 + 旋转角度</p>

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
              <h3 class="font-semibold text-slate-900 dark:text-white">水印设置</h3>
              <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="fullReset">重新选择</button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="label">水印文字</label>
                <input v-model="text" type="text" class="input" maxlength="50" />
              </div>
              <div>
                <label class="label">位置</label>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="p in positions"
                    :key="p.value"
                    class="rounded-lg px-3 py-1.5 text-sm transition-colors"
                    :class="position === p.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
                    @click="position = p.value"
                  >{{ p.label }}</button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">字号: {{ fontSize }}px</label>
                  <input type="range" min="12" max="200" v-model.number="fontSize" class="w-full accent-brand-600" />
                </div>
                <div>
                  <label class="label">透明度: {{ Math.round(opacity * 100) }}%</label>
                  <input type="range" min="0.1" max="1" step="0.05" v-model.number="opacity" class="w-full accent-brand-600" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">颜色</label>
                  <input v-model="color" type="color" class="h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
                </div>
                <div v-if="position === 'tile'">
                  <label class="label">旋转: {{ rotate }}°</label>
                  <input type="range" min="-90" max="90" v-model.number="rotate" class="w-full accent-brand-600" />
                </div>
              </div>
            </div>
            <button class="btn-primary mt-6 w-full" :disabled="processing" @click="process">
              <span v-if="processing">处理中…</span>
              <span v-else>添加水印</span>
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
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
