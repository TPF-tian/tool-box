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
