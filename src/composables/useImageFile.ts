import { ref, onUnmounted } from 'vue'
import { getImageInfo, type ImageInfo } from '@/utils/imageTools'

export function useImageFile() {
  const file = ref<File | null>(null)
  const previewUrl = ref('')
  const originalInfo = ref<ImageInfo | null>(null)
  const dragOver = ref(false)

  function cleanup() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }

  async function loadFile(f: File) {
    cleanup()
    file.value = f
    // HEIC/HEIF: 浏览器 <img> 标签可能不渲染, 走 canvas 转成 JPEG 预览
    // 原始 file 保持不动, 后续上传时还是用原 HEIC bytes
    if (f.type === 'image/heic' || f.type === 'image/heif' ||
        (!f.type && f.name.toLowerCase().endsWith('.heic'))) {
      try {
        const url = URL.createObjectURL(f)
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image()
          i.onload = () => resolve(i)
          i.onerror = () => reject(new Error('browser cannot decode HEIC'))
          i.src = url
        })
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        const jpegBlob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92)
        )
        URL.revokeObjectURL(url)
        if (jpegBlob && jpegBlob.size > 0) {
          previewUrl.value = URL.createObjectURL(jpegBlob)
          originalInfo.value = await getImageInfo(jpegBlob as File)
          return
        }
      } catch (e) {
        // 浏览器解不了 HEIC, preview 留空, 用户看不到原图但上传还能走
        console.warn('HEIC preview conversion failed:', e)
        previewUrl.value = ''
        originalInfo.value = null
        return
      }
    }
    previewUrl.value = URL.createObjectURL(f)
    originalInfo.value = await getImageInfo(f)
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (f && f.type.startsWith('image/')) loadFile(f)
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

  function reset() {
    cleanup()
    file.value = null
    originalInfo.value = null
  }

  onUnmounted(() => cleanup())

  return {
    file,
    previewUrl,
    originalInfo,
    dragOver,
    onFileChange,
    onDrop,
    onDragOver,
    onDragLeave,
    reset,
    loadFile
  }
}
