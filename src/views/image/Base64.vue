<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { useImageFile } from '@/composables/useImageFile'
import { imageToBase64, base64ToBlob } from '@/utils/imageTools'

const mode = ref<'to-base64' | 'from-base64'>('to-base64')

// image -> base64
const { file, previewUrl, originalInfo, dragOver, onFileChange, onDrop, onDragOver, onDragLeave, reset } = useImageFile()
const base64Out = ref('')
const error = ref('')

// base64 -> image
const base64Input = ref('')
const decodedUrl = ref('')
const decodedInfo = ref<{ size: number; mime: string } | null>(null)
const decodeError = ref('')

watch(file, async (f) => {
  base64Out.value = ''
  error.value = ''
  if (f) {
    try {
      base64Out.value = await imageToBase64(f)
    } catch (e) {
      error.value = (e as Error).message
    }
  }
})

async function copyBase64() {
  if (!base64Out.value) return
  await navigator.clipboard.writeText(base64Out.value)
}

async function decode() {
  decodeError.value = ''
  if (decodedUrl.value) URL.revokeObjectURL(decodedUrl.value)
  decodedUrl.value = ''
  decodedInfo.value = null
  if (!base64Input.value.trim()) {
    decodeError.value = '请粘贴 Base64 字符串'
    return
  }
  try {
    const blob = base64ToBlob(base64Input.value)
    if (!blob.type.startsWith('image/')) {
      decodeError.value = '解码结果不是图片 (mime: ' + blob.type + ')'
      return
    }
    decodedUrl.value = URL.createObjectURL(blob)
    decodedInfo.value = { size: blob.size, mime: blob.type }
  } catch (e) {
    decodeError.value = '解析失败: ' + (e as Error).message
  }
}

function downloadDecoded() {
  if (!decodedUrl.value || !decodedInfo.value) return
  const a = document.createElement('a')
  a.href = decodedUrl.value
  const ext = decodedInfo.value.mime.split('/')[1] || 'png'
  a.download = `decoded.${ext}`
  a.click()
}

function fullReset() {
  reset()
  base64Out.value = ''
  error.value = ''
  base64Input.value = ''
  if (decodedUrl.value) URL.revokeObjectURL(decodedUrl.value)
  decodedUrl.value = ''
  decodedInfo.value = null
  decodeError.value = ''
}

watch(base64Input, () => {
  if (decodedUrl.value) URL.revokeObjectURL(decodedUrl.value)
  decodedUrl.value = ''
  decodedInfo.value = null
  decodeError.value = ''
})

onUnmounted(() => {
  if (decodedUrl.value) URL.revokeObjectURL(decodedUrl.value)
})

const fmt = (n: number) => (n / 1024).toFixed(1) + ' KB'
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
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">Base64 转换</h1>
      <p class="mb-6 text-slate-500 dark:text-slate-400">图片 ↔ Base64 字符串互转，支持 data URL 和纯 base64</p>

      <div class="mb-6 flex gap-2">
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="mode === 'to-base64' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
          @click="mode = 'to-base64'"
        >图片 → Base64</button>
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="mode === 'from-base64' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'"
          @click="mode = 'from-base64'"
        >Base64 → 图片</button>
      </div>

      <!-- 图片 → Base64 -->
      <div v-if="mode === 'to-base64'" class="grid gap-4 lg:grid-cols-2">
        <div class="card">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white">上传图片</h3>
            <button v-if="file" class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="fullReset">清空</button>
          </div>
          <div
            v-if="!file"
            class="rounded-xl border-2 border-dashed p-8 text-center transition-colors"
            :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-600'"
            @drop="onDrop"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
          >
            <input type="file" id="file-input" accept="image/*" class="hidden" @change="onFileChange" />
            <label for="file-input" class="cursor-pointer text-sm text-slate-600 dark:text-slate-400">点击或拖拽上传</label>
          </div>
          <div v-else>
            <img v-if="previewUrl" :src="previewUrl" class="mb-2 max-h-64 w-full rounded-lg object-contain" alt="原图" />
            <div v-if="originalInfo" class="text-sm text-slate-500">
              {{ originalInfo.width }}×{{ originalInfo.height }} · {{ originalInfo.mime.split('/')[1].toUpperCase() }} · {{ fmt(originalInfo.size) }}
            </div>
          </div>
          <div v-if="error" class="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {{ error }}
          </div>
        </div>
        <div class="card">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white">Base64 结果</h3>
            <button v-if="base64Out" class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="copyBase64">复制</button>
          </div>
          <textarea
            v-model="base64Out"
            readonly
            class="input h-80 resize-none font-mono text-[10px] leading-tight"
            placeholder="上传图片后这里会显示 data:image/...;base64,..."
            spellcheck="false"
          />
          <div v-if="base64Out" class="mt-2 text-xs text-slate-500">
            共 {{ base64Out.length.toLocaleString() }} 字符
          </div>
        </div>
      </div>

      <!-- Base64 → 图片 -->
      <div v-else class="grid gap-4 lg:grid-cols-2">
        <div class="card">
          <h3 class="mb-2 font-semibold text-slate-900 dark:text-white">粘贴 Base64</h3>
          <textarea
            v-model="base64Input"
            class="input h-80 resize-none font-mono text-[10px] leading-tight"
            placeholder="粘贴 data:image/png;base64,iVBORw0KGgo... 或纯 base64 字符串"
            spellcheck="false"
          />
          <button class="btn-primary mt-3 w-full" @click="decode">解析为图片</button>
          <div v-if="decodeError" class="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {{ decodeError }}
          </div>
        </div>
        <div class="card">
          <h3 class="mb-2 font-semibold text-slate-900 dark:text-white">预览</h3>
          <div v-if="decodedUrl" class="rounded-lg bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22><rect width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/><rect x=%228%22 y=%228%22 width=%228%22 height=%228%22 fill=%22%23f1f5f9%22/></svg>')]">
            <img :src="decodedUrl" class="block max-h-80 w-full rounded-lg object-contain" alt="解码结果" />
          </div>
          <div v-else class="grid h-80 place-items-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400 dark:border-slate-800">
            粘贴后点击「解析为图片」
          </div>
          <div v-if="decodedInfo" class="mt-3 space-y-1 text-sm">
            <div class="flex justify-between"><span class="text-slate-500">格式</span><span>{{ decodedInfo.mime }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">大小</span><span>{{ fmt(decodedInfo.size) }}</span></div>
          </div>
          <button v-if="decodedUrl" class="btn-primary mt-3 w-full" @click="downloadDecoded">下载图片</button>
        </div>
      </div>
    </section>
  </Layout>
</template>
