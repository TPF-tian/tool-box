<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { useImageFile } from '@/composables/useImageFile'
import { ID_PHOTO_PRESETS, ID_PHOTO_BG_COLORS, composeIdPhoto, canvasToJpegBlob } from '@/utils/idPhoto'

const { file, previewUrl, originalInfo, dragOver, onFileChange, onDrop, onDragOver, onDragLeave, reset } = useImageFile()

const presetId = ref('cn-1inch')
const bgColor = ref('#ffffff')
const customColor = ref('#3b82f6')
const useCustomColor = ref(false)
const customWidthMm = ref(35)
const customHeightMm = ref(45)
const processing = ref(false)
const error = ref('')
const progressText = ref('')
const progressPct = ref(0)
const resultUrl = ref('')
const resultInfo = ref<{ size: number; width: number; height: number } | null>(null)
const previewMode = ref<'actual' | 'fit'>('actual')

const MM_TO_PX_300DPI = 300 / 25.4

const currentPreset = computed(() => {
  if (presetId.value === 'custom') {
    return {
      id: 'custom',
      name: '自定义',
      group: '自定义',
      widthMm: customWidthMm.value,
      heightMm: customHeightMm.value,
      widthPx: Math.max(1, Math.round(customWidthMm.value * MM_TO_PX_300DPI)),
      heightPx: Math.max(1, Math.round(customHeightMm.value * MM_TO_PX_300DPI))
    }
  }
  return ID_PHOTO_PRESETS.find((p) => p.id === presetId.value)!
})
const finalBgColor = computed(() => (useCustomColor.value ? customColor.value : bgColor.value))

const groupedPresets = computed(() => {
  return {
    中国: ID_PHOTO_PRESETS.filter((p) => p.group === '中国'),
    国际: ID_PHOTO_PRESETS.filter((p) => p.group === '国际')
  }
})

// 改变尺寸相关设置时, 清掉旧结果 (尺寸已经不匹配)
watch([presetId, customWidthMm, customHeightMm, finalBgColor], () => {
  if (resultUrl.value) {
    URL.revokeObjectURL(resultUrl.value)
    resultUrl.value = ''
    resultInfo.value = null
  }
})

async function process() {
  if (!file.value) return
  processing.value = true
  error.value = ''
  progressText.value = '加载 AI 模型...'
  progressPct.value = 0
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultUrl.value = ''
  resultInfo.value = null
  try {
    const { removeBackground } = await import('@imgly/background-removal')
    const noBgBlob = await removeBackground(file.value, {
      progress: (key, current, total) => {
        if (key.startsWith('fetch:')) {
          if (total > 0) {
            progressText.value = `下载模型 (${(current / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB)`
            progressPct.value = (current / total) * 70
          } else {
            progressText.value = '准备模型...'
            progressPct.value = 5
          }
        } else if (key.startsWith('compute:')) {
          progressText.value = 'AI 推理中...'
          progressPct.value = 70 + (current / Math.max(total, 1)) * 25
        }
      }
    })
    progressText.value = '合成证件照...'
    progressPct.value = 90

    const personImg = await blobToImage(noBgBlob)
    const personCanvas = document.createElement('canvas')
    personCanvas.width = personImg.naturalWidth
    personCanvas.height = personImg.naturalHeight
    const pctx = personCanvas.getContext('2d')!
    pctx.drawImage(personImg, 0, 0)

    const result = await composeIdPhoto(
      personCanvas,
      currentPreset.value.widthPx,
      currentPreset.value.heightPx,
      finalBgColor.value
    )
    const jpegBlob = await canvasToJpegBlob(result, 0.95)
    resultUrl.value = URL.createObjectURL(jpegBlob)
    resultInfo.value = { size: jpegBlob.size, width: result.width, height: result.height }
    progressPct.value = 100
    progressText.value = '完成'
  } catch (e) {
    error.value = '处理失败: ' + (e as Error).message
  } finally {
    processing.value = false
  }
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e instanceof Error ? e : new Error('图片加载失败'))
    }
    img.src = url
  })
}

function download() {
  if (!resultUrl.value || !file.value) return
  const a = document.createElement('a')
  a.href = resultUrl.value
  a.download = `${file.value.name.replace(/\.[^.]+$/, '')}-${currentPreset.value.name}.jpg`
  a.click()
}

function fullReset() {
  reset()
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultUrl.value = ''
  resultInfo.value = null
  error.value = ''
  progressText.value = ''
  progressPct.value = 0
}

const fmt = (n: number) => (n / 1024).toFixed(1) + ' KB'

onUnmounted(() => {
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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">证件照生成</h1>
      <p class="mb-8 text-slate-500 dark:text-slate-400">AI 自动抠图 + 标准尺寸 + 自定义背景色</p>

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
          <p class="text-base font-medium text-slate-700 dark:text-slate-200">上传人像照片</p>
          <p class="mt-1 text-sm text-slate-500">建议正面照、人物居中、露出肩膀</p>
        </label>
      </div>

      <div v-else class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="card">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="font-semibold text-slate-900 dark:text-white">设置</h3>
              <button class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="fullReset">重新选择</button>
            </div>

            <div class="mb-4">
              <label class="label">尺寸预设</label>
              <div v-for="(items, group) in groupedPresets" :key="group" class="mb-3">
                <div class="mb-1.5 text-xs text-slate-500">{{ group }}</div>
                <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  <button
                    v-for="p in items"
                    :key="p.id"
                    class="rounded-lg border px-2 py-2 text-left text-xs transition-colors"
                    :class="presetId === p.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'"
                    @click="presetId = p.id"
                  >
                    <div class="font-medium">{{ p.name }}</div>
                    <div class="text-[10px] text-slate-500">{{ p.widthMm }}×{{ p.heightMm }}mm</div>
                  </button>
                  <!-- 在最后一组后插入"自定义"按钮 -->
                  <button
                    v-if="group === '国际'"
                    class="rounded-lg border border-dashed px-2 py-2 text-left text-xs transition-colors"
                    :class="presetId === 'custom' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500'"
                    @click="presetId = 'custom'"
                  >
                    <div class="font-medium">+ 自定义</div>
                    <div class="text-[10px] text-slate-500">自填 W×H</div>
                  </button>
                </div>
              </div>
            </div>

            <div v-if="presetId === 'custom'" class="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">宽 (mm)</label>
                  <input type="number" min="5" max="200" step="0.1" v-model.number="customWidthMm" class="input" />
                </div>
                <div>
                  <label class="label">高 (mm)</label>
                  <input type="number" min="5" max="200" step="0.1" v-model.number="customHeightMm" class="input" />
                </div>
              </div>
              <div class="mt-2 text-xs text-slate-500">
                @ 300dpi = {{ currentPreset.widthPx }} × {{ currentPreset.heightPx }} px · 比例 {{ (customWidthMm / customHeightMm).toFixed(3) }}
              </div>
            </div>

            <div class="mb-4">
              <label class="label">背景色</label>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  v-for="c in ID_PHOTO_BG_COLORS"
                  :key="c.id"
                  class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
                  :class="!useCustomColor && bgColor === c.hex ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                  @click="useCustomColor = false; bgColor = c.hex"
                >
                  <span class="inline-block h-3 w-3 rounded-sm border border-slate-300 align-middle" :style="{ backgroundColor: c.hex }"></span>
                  <span class="ml-1.5">{{ c.name }}</span>
                </button>
                <label
                  class="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors"
                  :class="useCustomColor ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'"
                >
                  <input type="checkbox" v-model="useCustomColor" class="rounded accent-brand-600" />
                  <input
                    type="color"
                    :value="customColor"
                    @input="useCustomColor = true; customColor = ($event.target as HTMLInputElement).value"
                    class="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span>自定义</span>
                </label>
              </div>
            </div>

            <button class="btn-primary w-full" :disabled="processing" @click="process">
              <span v-if="processing">处理中…</span>
              <span v-else>生成证件照 ({{ currentPreset.widthPx }}×{{ currentPreset.heightPx }})</span>
            </button>

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

          <div v-if="resultInfo" class="card mt-4 animate-fade-in">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-semibold text-slate-900 dark:text-white">
                结果 · {{ currentPreset.name }}
                <span class="ml-2 text-xs font-normal text-slate-500">
                  {{ resultInfo.width }}×{{ resultInfo.height }} px ({{ currentPreset.widthMm }}×{{ currentPreset.heightMm }} mm) · {{ fmt(resultInfo.size) }}
                </span>
              </h3>
              <div class="flex items-center gap-1 text-xs">
                <button
                  class="rounded px-2 py-1 transition-colors"
                  :class="previewMode === 'actual' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'"
                  @click="previewMode = 'actual'"
                >1:1 实际尺寸</button>
                <button
                  class="rounded px-2 py-1 transition-colors"
                  :class="previewMode === 'fit' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'"
                  @click="previewMode = 'fit'"
                >适合窗口</button>
                <button class="ml-2 rounded bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" @click="download">下载</button>
              </div>
            </div>
            <!-- 1:1 实际尺寸 (CSS 像素 = 实际像素, 跟图片真实大小一致) -->
            <div
              v-if="previewMode === 'actual'"
              class="overflow-auto rounded-lg border border-slate-200 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22><rect width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/><rect x=%228%22 y=%228%22 width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/></svg>')] p-3 dark:border-slate-700"
              style="max-height: 520px"
            >
              <img
                v-if="resultUrl"
                :src="resultUrl"
                :width="resultInfo.width"
                :height="resultInfo.height"
                :style="{ width: resultInfo.width + 'px', height: resultInfo.height + 'px' }"
                alt="证件照结果"
                class="block"
              />
              <p class="mt-2 text-center text-xs text-slate-500">
                图片以 {{ resultInfo.width }}×{{ resultInfo.height }} CSS 像素显示 (≈ 实际尺寸)
              </p>
            </div>
            <!-- 适合窗口 (缩放填满预览区) -->
            <div v-else class="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <img
                v-if="resultUrl"
                :src="resultUrl"
                class="mx-auto block max-h-96 rounded object-contain"
                alt="证件照结果"
              />
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 class="mb-3 font-semibold text-slate-900 dark:text-white">原图</h3>
            <img v-if="previewUrl" :src="previewUrl" class="mb-3 max-h-72 w-full rounded-lg object-contain" alt="原图" />
            <div v-if="originalInfo" class="space-y-1 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">尺寸</span><span>{{ originalInfo.width }}×{{ originalInfo.height }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">大小</span><span>{{ fmt(originalInfo.size) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">格式</span><span>{{ originalInfo.mime.split('/')[1].toUpperCase() }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </Layout>
</template>
