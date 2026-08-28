<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { useImageFile } from '@/composables/useImageFile'
import { compressImage, getImageInfo, type ImageInfo } from '@/utils/imageTools'

const { file, previewUrl, originalInfo, dragOver, onFileChange, onDrop, onDragOver, onDragLeave, reset } = useImageFile()

const quality = ref(80)
const maxWidth = ref(1920)
const keepOriginalSize = ref(false)
const processing = ref(false)

const processedUrl = ref('')
const processedInfo = ref<ImageInfo | null>(null)

const reduction = computed(() => {
  if (!originalInfo.value || !processedInfo.value) return null
  return ((originalInfo.value.size - processedInfo.value.size) / originalInfo.value.size) * 100
})

async function process() {
  if (!file.value) return
  processing.value = true
  try {
    const blob = await compressImage(file.value, {
      quality: quality.value / 100,
      maxWidth: keepOriginalSize.value ? undefined : maxWidth.value
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
  a.download = file.value.name.replace(/\.[^.]+$/, '') + '-compressed.' + ext
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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">图片压缩</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">调节质量与最大宽度，减小文件体积，视觉尽量无损</p>

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

      <div v-else class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="card">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">设置</h3>
              <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="fullReset">重新选择</button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="label">质量: {{ quality }}%</label>
                <input type="range" min="10" max="100" v-model.number="quality" class="w-full accent-brand-600" />
                <p class="mt-1 text-xs text-slate-500">PNG 无损压缩,质量滑块对 PNG 不生效</p>
              </div>
              <div>
                <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" v-model="keepOriginalSize" class="rounded accent-brand-600" />
                  保持原图尺寸
                </label>
                <div v-if="!keepOriginalSize" class="mt-2">
                  <label class="label">最大宽度: {{ maxWidth }}px</label>
                  <input type="range" min="320" max="3840" step="10" v-model.number="maxWidth" class="w-full accent-brand-600" />
                </div>
              </div>
            </div>
            <button class="btn-primary mt-6 w-full" :disabled="processing" @click="process">
              <span v-if="processing">处理中…</span>
              <span v-else>开始压缩</span>
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
            <img v-if="previewUrl" :src="previewUrl" class="mb-3 max-h-64 w-full rounded-lg object-contain" alt="原图" />
            <div v-if="originalInfo" class="space-y-1 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">大小</span><span>{{ fmt(originalInfo.size) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">尺寸</span><span>{{ originalInfo.width }}×{{ originalInfo.height }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">格式</span><span>{{ originalInfo.mime.split('/')[1].toUpperCase() }}</span></div>
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
