<script setup lang="ts">
import { ref, computed, onUnmounted, watch, watchEffect, shallowRef, markRaw } from 'vue'
import { RouterLink } from 'vue-router'
import Layout from '@/components/Layout.vue'
import PdfGrid from '@/components/PdfGrid.vue'
import {
  loadPdfFromFile,
  getPageInfos,
  renderPageToCanvas,
  mergePdfs,
  mergeInsertIntoTarget,
  splitPdfByRanges,
  splitPdfPerPage,
  removePdfPages,
  extractPdfPages,
  reSavePdf,
  compressPdf,
  pdfToImages,
  addPdfWatermark,
  bytesToBlob,
  COMPRESS_MODE_INFO,
  recommendCompressMode,
  type CompressMode,
  type WatermarkFont,
  type WatermarkPosition
} from '@/utils/pdfUtils'
import { docxToPdf } from '@/utils/docxUtils'
import { downloadBlob, formatSize, stripExt } from '@/utils/docUtils'
import JSZip from 'jszip'
import * as pdfjs from 'pdfjs-dist'

// ===== 通用：当前 PDF 预览 =====
type LoadedPdf = Awaited<ReturnType<typeof loadPdfFromFile>>
type PdfState = {
  file: File
  doc: LoadedPdf['doc']
  totalPages: number
  pageInfos: { index: number; width: number; height: number }[]
  selectedPages: Set<number>
}
// 用 shallowRef: PDFDocumentProxy 内部用了 ES private fields (#xxx),
// Vue 响应式 Proxy 包装后会拦截 getter,访问 private 字段报 "Cannot read from private field"。
// shallowRef 只跟踪引用赋值,不会深包装内部对象,保持 doc 原生形态。
const pdfState = shallowRef<PdfState | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const loading = ref(false)
const errorMsg = ref('')

async function loadFile(file: File) {
  errorMsg.value = ''
  loading.value = true
  try {
    if (pdfState.value) (pdfState.value.doc as unknown as { destroy: () => void }).destroy()
    const { doc, totalPages } = await loadPdfFromFile(file)
    const pageInfos = await getPageInfos(doc)
    pdfState.value = {
      file,
      doc: markRaw(doc),
      totalPages,
      pageInfos: markRaw(pageInfos),
      selectedPages: new Set<number>()
    }
  } catch (e) {
    errorMsg.value = 'PDF 加载失败: ' + (e as Error).message
  } finally {
    loading.value = false
  }
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadFile(f)
}
function openFile() {
  fileInput.value?.click()
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFile(f)
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}
function onDragLeave() {
  dragOver.value = false
}
function closeFile() {
  if (pdfState.value) {
    (pdfState.value.doc as unknown as { destroy: () => void }).destroy()
    pdfState.value = null
  }
}

// ===== Tabs =====
type Tab = 'merge' | 'split' | 'extract' | 'remove' | 'compress' | 'toImage' | 'watermark' | 'office2pdf'
const tabs: { id: Tab; label: string }[] = [
  { id: 'merge', label: '合并' },
  { id: 'split', label: '拆分' },
  { id: 'extract', label: '提取页' },
  { id: 'remove', label: '删除页' },
  { id: 'watermark', label: '添加水印' },
  { id: 'compress', label: 'PDF 压缩' },
  { id: 'toImage', label: '转图片' },
  { id: 'office2pdf', label: 'Office → PDF' }
]
const tab = ref<Tab>('merge')

// ===== 卡片首页 =====
const showHome = ref(true)
function openTab(t: Tab) {
  tab.value = t
  showHome.value = false
}
function backToHome() {
  showHome.value = true
  // 关闭文件状态以避免残留
  closeFile()
  clearMergeFile('A')
  clearMergeFile('B')
  clearOfficeFile()
  compressClear()
}
const pdfTools = [
  { id: 'merge' as Tab, title: '合并 PDF', desc: '把多个 PDF 按顺序合并为一个文件', tag: '常用', icon: 'merge' },
  { id: 'split' as Tab, title: '拆分 PDF', desc: '按页范围拆分,或每页单独成一个文件', icon: 'split' },
  { id: 'extract' as Tab, title: '提取页', desc: '勾选要保留的页,生成新 PDF', icon: 'extract' },
  { id: 'remove' as Tab, title: '删除页', desc: '勾选要删除的页,输出剩余内容', icon: 'remove' },
  { id: 'watermark' as Tab, title: '添加水印', desc: '文字水印,6 种位置 + 平铺,可调字号/颜色/旋转', tag: '新功能', icon: 'watermark' },
  { id: 'compress' as Tab, title: 'PDF 压缩', desc: '批量压缩,4 种模式,栅格化重打包,文件明显减小', tag: '升级', icon: 'compress' },
  { id: 'toImage' as Tab, title: 'PDF 转图片', desc: '把每页导出为 PNG/JPEG/WebP,可打包 ZIP', icon: 'toImage' },
  { id: 'office2pdf' as Tab, title: 'Office → PDF', desc: '把 Word .docx 转成 PDF,纯浏览器内处理', tag: '新功能', icon: 'office' }
]

// ===== 合并(插入式:目标 PDF 全部 + 源 PDF 选中的页)=====
type MergeSide = 'A' | 'B'
interface MergeSource {
  file: File | null
  totalPages: number
  thumbs: Map<number, string> // pageNo (1-based) -> dataURL
  loading: boolean
  loadError: string
}

const mergeSrcA = ref<MergeSource>({ file: null, totalPages: 0, thumbs: new Map(), loading: false, loadError: '' })
const mergeSrcB = ref<MergeSource>({ file: null, totalPages: 0, thumbs: new Map(), loading: false, loadError: '' })
const mergeSelectedA = ref<Set<number>>(new Set()) // 源 A 中已选的页(目标 A 时无意义,但仍用于兼容)
const mergeSelectedB = ref<Set<number>>(new Set()) // 源 B 中已选的页(目标 B 时无意义)
// 合并方向:AB = 从 A 选页 → 合并到 B(B 是目标);BA = 从 B 选页 → 合并到 A(A 是目标)
const mergeOrder = ref<'AB' | 'BA'>('AB')
const mergeBusy = ref(false)
const mergeLoadingSide = ref<MergeSide | null>(null)

/** 目标方(全部内容进输出) */
const mergeTarget = computed<MergeSide>(() => (mergeOrder.value === 'AB' ? 'B' : 'A'))
/** 源方(用户选页追加到目标末尾) */
const mergeDonor = computed<MergeSide>(() => (mergeOrder.value === 'AB' ? 'A' : 'B'))

function getMergeSrc(side: MergeSide) {
  return side === 'A' ? mergeSrcA : mergeSrcB
}
function getMergeSel(side: MergeSide) {
  return side === 'A' ? mergeSelectedA : mergeSelectedB
}

function pickMergeFile(side: MergeSide) {
  const i = document.createElement('input')
  i.type = 'file'
  i.accept = 'application/pdf'
  i.onchange = () => {
    const f = i.files?.[0]
    if (f) loadMergeFile(side, f)
  }
  i.click()
}

async function loadMergeFile(side: MergeSide, file: File) {
  const src = getMergeSrc(side)
  src.value = { file, totalPages: 0, thumbs: new Map(), loading: true, loadError: '' }
  getMergeSel(side).value = new Set()
  mergeLoadingSide.value = side

  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | null = null
  try {
    const buf = await file.arrayBuffer()
    pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise
    const totalPages = pdf.numPages
    if (mergeLoadingSide.value !== side || getMergeSrc(side).value.file !== file) {
      console.log('[merge] superseded before render start, abort', file.name)
      try { (pdf as unknown as { destroy: () => void }).destroy() } catch { /* noop */ }
      return
    }
    src.value = { file, totalPages, thumbs: new Map(), loading: false, loadError: '' }

    const canvas = document.createElement('canvas')
    const builtThumbs: Array<[number, string] | null> = new Array(totalPages + 1).fill(null)
    for (let p = 1; p <= totalPages; p++) {
      if (mergeLoadingSide.value !== side || getMergeSrc(side).value.file !== file) {
        console.log('[merge] superseded during render, abort at page', p)
        try { (pdf as unknown as { destroy: () => void }).destroy() } catch { /* noop */ }
        return
      }
      try {
        await renderPageToCanvas(pdf, p, canvas, 0.3)
        builtThumbs[p] = [p, canvas.toDataURL('image/png')]
      } catch (e) {
        console.warn('[merge] thumb page', p, 'failed:', e)
      }
    }
    const finalThumbs = new Map<number, string>()
    for (let p = 1; p <= totalPages; p++) {
      const entry = builtThumbs[p]
      if (entry) finalThumbs.set(entry[0], entry[1])
    }
    if (mergeLoadingSide.value === side && getMergeSrc(side).value.file === file) {
      src.value = { file, totalPages, thumbs: finalThumbs, loading: false, loadError: '' }
    }
  } catch (e) {
    console.error('[merge] load failed for', file.name, e)
    if (getMergeSrc(side).value.file === file) {
      src.value = {
        file,
        totalPages: 0,
        thumbs: new Map(),
        loading: false,
        loadError: (e as Error).message
      }
    }
  } finally {
    if (pdf) {
      try { (pdf as unknown as { destroy: () => void }).destroy() } catch { /* noop */ }
    }
    if (mergeLoadingSide.value === side) mergeLoadingSide.value = null
  }
}

function clearMergeFile(side: MergeSide) {
  if (mergeLoadingSide.value === side) mergeLoadingSide.value = null
  getMergeSrc(side).value = { file: null, totalPages: 0, thumbs: new Map(), loading: false, loadError: '' }
  getMergeSel(side).value = new Set()
}

/** 切换源方选页;目标方全部进输出,不允许单独取消 */
function toggleMergePage(side: MergeSide, pageNo: number) {
  if (mergeTarget.value === side) return
  const sel = getMergeSel(side).value
  const next = new Set(sel)
  if (next.has(pageNo)) next.delete(pageNo)
  else next.add(pageNo)
  if (side === 'A') mergeSelectedA.value = next
  else mergeSelectedB.value = next
}

function selectAllInSide(side: MergeSide) {
  if (mergeTarget.value === side) return
  const src = getMergeSrc(side).value
  if (side === 'A') mergeSelectedA.value = new Set(Array.from({ length: src.totalPages }, (_, i) => i + 1))
  else mergeSelectedB.value = new Set(Array.from({ length: src.totalPages }, (_, i) => i + 1))
}

function clearAllInSide(side: MergeSide) {
  if (mergeTarget.value === side) return
  if (side === 'A') mergeSelectedA.value = new Set()
  else mergeSelectedB.value = new Set()
}

/** 总输出页数 = 目标全部 + 源已选 */
const mergeTotalSelected = computed(() => {
  const t = getMergeSrc(mergeTarget.value).value.totalPages
  const dSel = getMergeSel(mergeDonor.value).value.size
  return t + dSel
})

// ===== 合并预览(先生成后下载)=====
interface MergePreviewPage {
  pageNo: number
  dataURL: string
  fromSide: 'A' | 'B'
  fromPageNo: number
  role: 'target' | 'donor'
}
const mergePreviewOpen = ref(false)
const mergePreviewLoading = ref(false)
const mergePreviewError = ref('')
const mergePreviewBytes = ref<Uint8Array | null>(null)
const mergePreviewPages = ref<MergePreviewPage[]>([])
const mergePreviewSelected = ref(1)
const mergePreviewSelectedDataURL = computed(
  () => mergePreviewPages.value.find((p) => p.pageNo === mergePreviewSelected.value)?.dataURL || ''
)
const mergePreviewSelectedSource = computed(() => {
  const p = mergePreviewPages.value.find((x) => x.pageNo === mergePreviewSelected.value)
  if (!p) return null
  return { side: p.fromSide, pageNo: p.fromPageNo, role: p.role }
})

async function doMergePreview() {
  const targetSrc = getMergeSrc(mergeTarget.value).value
  const donorSrc = getMergeSrc(mergeDonor.value).value
  if (!targetSrc.file) {
    errorMsg.value = `请先选择目标 PDF (${mergeTarget.value})`
    return
  }
  if (!donorSrc.file) {
    errorMsg.value = `请先选择源 PDF (${mergeDonor.value})`
    return
  }
  const donorPages = Array.from(getMergeSel(mergeDonor.value).value).sort((a, b) => a - b)
  if (donorPages.length === 0) {
    errorMsg.value = `请在源 (${mergeDonor.value}) 中至少选择 1 个页面`
    return
  }

  mergePreviewOpen.value = true
  mergePreviewLoading.value = true
  mergePreviewError.value = ''
  mergePreviewPages.value = []
  mergePreviewBytes.value = null
  mergePreviewSelected.value = 1

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | null = null
  try {
    // sourceMap:输出 PDF 第 N 页来自哪
    const sourceMap: Array<{ fromSide: MergeSide; fromPageNo: number; role: 'target' | 'donor' }> = []
    for (let p = 1; p <= targetSrc.totalPages; p++) {
      sourceMap.push({ fromSide: mergeTarget.value, fromPageNo: p, role: 'target' })
    }
    for (const p of donorPages) {
      sourceMap.push({ fromSide: mergeDonor.value, fromPageNo: p, role: 'donor' })
    }

    const bytes = await mergeInsertIntoTarget(targetSrc.file, donorSrc.file, donorPages)
    mergePreviewBytes.value = bytes

    doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise
    const total = doc.numPages
    const pages: MergePreviewPage[] = []
    const canvas = document.createElement('canvas')
    for (let p = 1; p <= total; p++) {
      const src = sourceMap[p - 1] || { fromSide: mergeTarget.value, fromPageNo: p, role: 'target' as const }
      try {
        await renderPageToCanvas(doc, p, canvas, 0.4)
        pages.push({
          pageNo: p,
          dataURL: canvas.toDataURL('image/png'),
          fromSide: src.fromSide,
          fromPageNo: src.fromPageNo,
          role: src.role
        })
        if (p === 1 || p === total || p % 5 === 0) {
          mergePreviewPages.value = [...pages]
        }
      } catch (e) {
        console.warn('[merge preview] page', p, 'failed:', e)
      }
    }
    mergePreviewPages.value = pages
    if (pages.length > 0) mergePreviewSelected.value = pages[0].pageNo
  } catch (e) {
    console.error('[merge preview] failed:', e)
    mergePreviewError.value = (e as Error).message
  } finally {
    mergePreviewLoading.value = false
    if (doc) {
      try {
        ;(doc as unknown as { destroy: () => void }).destroy()
      } catch {
        /* noop */
      }
    }
  }
}

function downloadMergePreview() {
  if (!mergePreviewBytes.value) return
  const tag = mergeOrder.value
  downloadBlob(bytesToBlob(mergePreviewBytes.value), `inserted-${tag}.pdf`)
}

function closeMergePreview() {
  mergePreviewOpen.value = false
  mergePreviewPages.value = []
  mergePreviewBytes.value = null
  mergePreviewError.value = ''
  mergePreviewSelected.value = 1
}

async function doMergePicked() {
  const targetSrc = getMergeSrc(mergeTarget.value).value
  const donorSrc = getMergeSrc(mergeDonor.value).value
  if (!targetSrc.file || !donorSrc.file) {
    errorMsg.value = '请先选择两份 PDF'
    return
  }
  const donorPages = Array.from(getMergeSel(mergeDonor.value).value).sort((a, b) => a - b)
  if (donorPages.length === 0) {
    errorMsg.value = `请在源 (${mergeDonor.value}) 中至少选择 1 个页面`
    return
  }
  mergeBusy.value = true
  errorMsg.value = ''
  try {
    const bytes = await mergeInsertIntoTarget(targetSrc.file, donorSrc.file, donorPages)
    downloadBlob(bytesToBlob(bytes), `inserted-${mergeOrder.value}.pdf`)
  } catch (e) {
    errorMsg.value = '合并失败: ' + (e as Error).message
  } finally {
    mergeBusy.value = false
  }
}

// ===== 拆分 =====
const splitMode = ref<'range' | 'perPage'>('range')
const splitRanges = ref('1-3, 4-6, 7-')
function parseRanges(input: string, total: number): Array<[number, number]> {
  return input
    .split(/[,，;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\d+)\s*[-~]\s*(\d+)?$/)
      if (m) {
        const from = parseInt(m[1])
        const to = m[2] ? parseInt(m[2]) : total
        return [Math.max(1, Math.min(from, total)), Math.max(1, Math.min(to, total))] as [number, number]
      }
      const n = parseInt(s)
      if (!isNaN(n)) return [Math.max(1, Math.min(n, total)), Math.max(1, Math.min(n, total))] as [number, number]
      return null
    })
    .filter((r): r is [number, number] => r !== null)
}
async function doSplit() {
  if (!pdfState.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    if (splitMode.value === 'perPage') {
      const parts = await splitPdfPerPage(pdfState.value.file)
      if (parts.length === 1) {
        downloadBlob(bytesToBlob(parts[0]), `${stripExt(pdfState.value.file.name)}-p1.pdf`)
      } else {
        const zip = new JSZip()
        parts.forEach((p, i) => {
          zip.file(`${stripExt(pdfState.value!.file.name)}-p${i + 1}.pdf`, p)
        })
        const blob = await zip.generateAsync({ type: 'blob' })
        downloadBlob(blob, `${stripExt(pdfState.value.file.name)}-pages.zip`)
      }
    } else {
      const ranges = parseRanges(splitRanges.value, pdfState.value.totalPages)
      if (ranges.length === 0) {
        errorMsg.value = '请输入有效的页范围,例如 1-3, 5, 7-'
        loading.value = false
        return
      }
      const parts = await splitPdfByRanges(pdfState.value.file, ranges)
      if (parts.length === 1) {
        downloadBlob(bytesToBlob(parts[0]), `${stripExt(pdfState.value.file.name)}-split.pdf`)
      } else {
        const zip = new JSZip()
        parts.forEach((p, i) => {
          zip.file(`${stripExt(pdfState.value!.file.name)}-part${i + 1}.pdf`, p)
        })
        const blob = await zip.generateAsync({ type: 'blob' })
        downloadBlob(blob, `${stripExt(pdfState.value.file.name)}-split.zip`)
      }
    }
  } catch (e) {
    errorMsg.value = '拆分失败: ' + (e as Error).message
  } finally {
    loading.value = false
  }
}

// ===== 提取/删除页 =====
async function doExtract() {
  if (!pdfState.value || pdfState.value.selectedPages.size === 0) {
    errorMsg.value = '请先勾选要提取的页'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const pages = Array.from(pdfState.value.selectedPages).sort((a, b) => a - b)
    const bytes = await extractPdfPages(pdfState.value.file, pages)
    downloadBlob(bytesToBlob(bytes), `${stripExt(pdfState.value.file.name)}-extracted.pdf`)
  } catch (e) {
    errorMsg.value = '提取失败: ' + (e as Error).message
  } finally {
    loading.value = false
  }
}
async function doRemove() {
  if (!pdfState.value || pdfState.value.selectedPages.size === 0) {
    errorMsg.value = '请先勾选要删除的页'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const pages = Array.from(pdfState.value.selectedPages).sort((a, b) => a - b)
    const bytes = await removePdfPages(pdfState.value.file, pages)
    downloadBlob(bytesToBlob(bytes), `${stripExt(pdfState.value.file.name)}-removed.pdf`)
  } catch (e) {
    errorMsg.value = '删除失败: ' + (e as Error).message
  } finally {
    loading.value = false
  }
}
function togglePage(n: number) {
  if (!pdfState.value) return
  if (pdfState.value.selectedPages.has(n)) pdfState.value.selectedPages.delete(n)
  else pdfState.value.selectedPages.add(n)
  // 触发响应式
  pdfState.value = { ...pdfState.value, selectedPages: new Set(pdfState.value.selectedPages) }
}
function selectAll() {
  if (!pdfState.value) return
  pdfState.value.selectedPages = new Set(
    Array.from({ length: pdfState.value.totalPages }, (_, i) => i + 1)
  )
  pdfState.value = { ...pdfState.value }
}
function selectNone() {
  if (!pdfState.value) return
  pdfState.value.selectedPages = new Set()
  pdfState.value = { ...pdfState.value }
}

// ===== 批量压缩(栅格化重打包)=====
type CompressItemStatus = 'pending' | 'processing' | 'done' | 'failed'
interface CompressItem {
  id: string
  file: File
  pageCount: number
  originalSize: number
  compressedSize: number | null
  progress: number
  status: CompressItemStatus
  result: Uint8Array | null
  error: string
}

const compressItems = ref<CompressItem[]>([])
const compressMode = ref<CompressMode>('lossless') // 默认"无损压缩"(避免文字型 PDF 变大)
const compressBusy = ref(false)
const compressOutputDest = ref<'download' | 'dir'>('download')
const compressOverwrite = ref(false)
const compressDirHandle = ref<any>(null) // FileSystemDirectoryHandle (Chrome/Edge only)
const compressDragOver = ref(false)
let compressIdCounter = 0

function makeCompressId() {
  return `c${Date.now()}-${++compressIdCounter}`
}

function addCompressFiles(files: File[]) {
  const valid = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
  if (valid.length === 0) return
  // 去重:同名不重复加
  for (const file of valid) {
    if (compressItems.value.some((it) => it.file.name === file.name && it.file.size === file.size)) continue
    compressItems.value.push({
      id: makeCompressId(),
      file,
      pageCount: 0,
      originalSize: file.size,
      compressedSize: null,
      progress: 0,
      status: 'pending',
      result: null,
      error: ''
    })
  }
  // 异步获取每份文件的页数
  for (const item of compressItems.value) {
    if (item.pageCount > 0 || item.status !== 'pending') continue
    void (async () => {
      try {
        const buf = await item.file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise
        item.pageCount = pdf.numPages
        try { (pdf as unknown as { destroy: () => void }).destroy() } catch { /* noop */ }
      } catch {
        item.pageCount = 0
      }
    })()
  }
}

function removeCompressItem(id: string) {
  compressItems.value = compressItems.value.filter((it) => it.id !== id)
}

function clearCompressDone() {
  compressItems.value = compressItems.value.filter((it) => it.status !== 'done')
}

function compressClear() {
  compressItems.value = []
  compressBusy.value = false
  compressDirHandle.value = null
}

function pickCompressFiles() {
  const i = document.createElement('input')
  i.type = 'file'
  i.accept = 'application/pdf'
  i.multiple = true
  i.onchange = () => {
    if (i.files) addCompressFiles(Array.from(i.files))
  }
  i.click()
}

async function pickCompressDir() {
  // File System Access API — Chrome/Edge only
  const w = window as any
  if (typeof w.showDirectoryPicker !== 'function') {
    errorMsg.value = '当前浏览器不支持选择输出目录(Safari/Firefox 不支持 File System Access API),请改用「下载到本地」'
    compressOutputDest.value = 'download'
    return
  }
  try {
    const handle = await w.showDirectoryPicker({ mode: 'readwrite' })
    compressDirHandle.value = handle
    compressOutputDest.value = 'dir'
  } catch (e) {
    // 用户取消
    console.log('[compress] dir pick cancelled')
  }
}

async function writeBytesToDir(dirHandle: any, fileName: string, bytes: Uint8Array) {
  // 覆盖原文件 或 写入子目录
  let targetDir = dirHandle
  if (!compressOverwrite.value) {
    targetDir = await dirHandle.getDirectoryHandle('compressed', { create: true })
  }
  const fileHandle = await targetDir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(bytes)
  await writable.close()
}

function downloadOne(item: CompressItem) {
  if (!item.result) return
  const name = stripExt(item.file.name) + '-compressed.pdf'
  downloadBlob(bytesToBlob(item.result), name)
}

function downloadAll() {
  for (const it of compressItems.value) {
    if (it.status === 'done' && it.result) downloadOne(it)
  }
}

async function startCompress() {
  const pending = compressItems.value.filter((it) => it.status === 'pending' || it.status === 'failed')
  if (pending.length === 0) return
  compressBusy.value = true
  errorMsg.value = ''

  // 串行处理(避免内存爆掉)
  for (const item of pending) {
    if (compressItems.value.indexOf(item) < 0) continue // 期间被移除
    item.status = 'processing'
    item.progress = 0
    item.error = ''
    item.compressedSize = null
    item.result = null
    try {
      const bytes = await compressPdf(item.file, {
        mode: compressMode.value,
        onProgress: (p) => {
          item.progress = Math.round(p * 100)
        }
      })
      item.result = bytes
      item.compressedSize = bytes.length
      item.status = 'done'
      item.progress = 100
      // 输出
      if (compressOutputDest.value === 'dir' && compressDirHandle.value) {
        try {
          await writeBytesToDir(compressDirHandle.value, item.file.name, bytes)
        } catch (e) {
          console.warn('[compress] write to dir failed for', item.file.name, e)
          // 写盘失败,fallback 下载
          downloadOne(item)
        }
      }
    } catch (e) {
      console.error('[compress] failed for', item.file.name, e)
      item.status = 'failed'
      item.error = (e as Error).message
    }
  }
  compressBusy.value = false
}

function formatSizeFile(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function compressRatio(item: CompressItem): number {
  if (item.compressedSize == null) return 0
  return (1 - item.compressedSize / item.originalSize) * 100
}

async function compressSingleItem(item: CompressItem) {
  if (item.status === 'processing') return
  compressBusy.value = true
  item.status = 'processing'
  item.progress = 0
  item.error = ''
  item.compressedSize = null
  item.result = null
  try {
    const bytes = await compressPdf(item.file, {
      mode: compressMode.value,
      onProgress: (p) => {
        item.progress = Math.round(p * 100)
      }
    })
    item.result = bytes
    item.compressedSize = bytes.length
    item.status = 'done'
    item.progress = 100
    if (compressOutputDest.value === 'dir' && compressDirHandle.value) {
      try {
        await writeBytesToDir(compressDirHandle.value, item.file.name, bytes)
      } catch (e) {
        console.warn('[compress] write to dir failed for', item.file.name, e)
        downloadOne(item)
      }
    }
  } catch (e) {
    item.status = 'failed'
    item.error = (e as Error).message
  }
  compressBusy.value = compressItems.value.some((it) => it.status === 'processing')
}

/** 智能推荐:按文件大小/页数启发式选最合适的模式 */
function autoRecommendMode() {
  if (compressItems.value.length === 0) return
  // 对每个文件跑推荐,取"保守"(lossless 优先)的众数
  const counts: Record<string, number> = {}
  for (const item of compressItems.value) {
    const m = recommendCompressMode(item.file, item.pageCount)
    counts[m] = (counts[m] || 0) + 1
  }
  // 优先选 lossless(避免误用栅格化模式把文字型 PDF 变大)
  // 只有当所有文件都是 'balanced' 时才用 balanced
  const modes = Object.keys(counts)
  if (modes.length === 1) {
    compressMode.value = modes[0] as CompressMode
  } else if (modes.includes('lossless')) {
    compressMode.value = 'lossless'
  } else {
    compressMode.value = (modes.sort((a, b) => counts[b] - counts[a])[0]) as CompressMode
  }
}

// ===== 转图片 =====
const imgScale = ref(2)
const imgFormat = ref<'png' | 'jpeg' | 'webp'>('png')
const imgQuality = ref(0.92)
const imgRange = ref('')
const imgBusy = ref(false)
async function doToImage() {
  if (!pdfState.value) return
  imgBusy.value = true
  errorMsg.value = ''
  try {
    let pageRange: [number, number] | undefined
    if (imgRange.value.trim()) {
      const r = parseRanges(imgRange.value, pdfState.value.totalPages)
      if (r.length) pageRange = [r[0][0], r[r.length - 1][1]]
    }
    const { blobs, pageNumbers } = await pdfToImages(pdfState.value.file, {
      scale: imgScale.value,
      format: imgFormat.value,
      quality: imgQuality.value,
      pageRange
    })
    if (blobs.length === 1) {
      const ext = imgFormat.value === 'jpeg' ? 'jpg' : imgFormat.value
      downloadBlob(blobs[0], `${stripExt(pdfState.value.file.name)}-p${pageNumbers[0]}.${ext}`)
    } else {
      const zip = new JSZip()
      const ext = imgFormat.value === 'jpeg' ? 'jpg' : imgFormat.value
      blobs.forEach((b, i) => {
        zip.file(`${stripExt(pdfState.value!.file.name)}-p${pageNumbers[i]}.${ext}`, b)
      })
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBlob, `${stripExt(pdfState.value.file.name)}-images.zip`)
    }
  } catch (e) {
    errorMsg.value = '转图片失败: ' + (e as Error).message
  } finally {
    imgBusy.value = false
  }
}

// ===== 水印 =====
const wmText = ref('CONFIDENTIAL')
const wmFont = ref<WatermarkFont>('HelveticaBold')
const wmPosition = ref<WatermarkPosition>('tile')
const wmSize = ref(60)
const wmColor = ref({ r: 220, g: 38, b: 38 })
const wmOpacity = ref(0.35)
const wmRotate = ref(-30)
const wmSelectedOnly = ref(false)
const wmBusy = ref(false)

const wmFonts: { id: WatermarkFont; label: string }[] = [
  { id: 'Helvetica', label: 'Helvetica' },
  { id: 'HelveticaBold', label: 'Helvetica Bold' },
  { id: 'TimesRoman', label: 'Times Roman' },
  { id: 'TimesRomanBold', label: 'Times Bold' },
  { id: 'Courier', label: 'Courier' },
  { id: 'CourierBold', label: 'Courier Bold' }
]

const wmPositions: { id: WatermarkPosition; label: string }[] = [
  { id: 'top-left', label: '左上' },
  { id: 'top-right', label: '右上' },
  { id: 'center', label: '居中' },
  { id: 'bottom-left', label: '左下' },
  { id: 'bottom-right', label: '右下' },
  { id: 'tile', label: '平铺' }
]

const wmColorPresets: { value: { r: number; g: number; b: number }; label: string }[] = [
  { value: { r: 220, g: 38, b: 38 }, label: '红' },
  { value: { r: 0, g: 0, b: 0 }, label: '黑' },
  { value: { r: 100, g: 116, b: 139 }, label: '灰' },
  { value: { r: 37, g: 99, b: 235 }, label: '蓝' },
  { value: { r: 202, g: 138, b: 4 }, label: '黄' },
  { value: { r: 22, g: 163, b: 74 }, label: '绿' }
]

const wmColorHex = computed(() => {
  const c = wmColor.value
  return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')
})

// ===== 水印效果实时预览（单页正常显示 + 滚动查看 + 分页器）=====
const watermarkPreviewCanvas = ref<HTMLCanvasElement | null>(null)
const wmPageIndex = ref(1) // 1-based

// 缓存:每页 PDF 渲染一次(避免参数变化时反复调 pdfjs)
type WmPdfCache = { totalPages: number; pages: Map<number, HTMLCanvasElement> }
let wmPdfCache: WmPdfCache | null = null

// PDF 文件切换 / 总页数变化时清缓存 + 重置到第 1 页
watch(
  () => pdfState.value,
  (s) => {
    wmPdfCache = null
    wmPageIndex.value = 1
    if (s) {
      wmPdfCache = { totalPages: s.totalPages, pages: new Map() }
    }
  }
)

// 渲染某页到独立 canvas,带缓存
async function getCachedPage(pageNo: number): Promise<HTMLCanvasElement | null> {
  if (!pdfState.value || !wmPdfCache) return null
  const cached = wmPdfCache.pages.get(pageNo)
  if (cached) return cached
  const c = document.createElement('canvas')
  try {
    const doc = pdfState.value.doc as Parameters<typeof renderPageToCanvas>[0]
    // scale 1.0: 物理像素 = pt 尺寸,A4 = 595x842 px,canvas 自然等比缩放
    await renderPageToCanvas(doc, pageNo, c, 1.0)
    wmPdfCache.pages.set(pageNo, c)
    return c
  } catch (e) {
    console.warn('wm cache page', pageNo, 'failed:', e)
    return null
  }
}

/** 在 ctx 上以"局部坐标"(0..w, 0..h) 画水印 */
function drawWatermarkOnCtx(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = wmSize.value
  const text = wmText.value || ' '
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`
  ctx.fillStyle = `rgba(${wmColor.value.r}, ${wmColor.value.g}, ${wmColor.value.b}, ${wmOpacity.value})`
  ctx.textBaseline = 'alphabetic'
  const textWidth = ctx.measureText(text).width
  ctx.textBaseline = 'middle'
  const padding = size * 0.6

  const pos = wmPosition.value
  if (pos === 'tile') {
    const stepX = textWidth + size * 1.5
    const stepY = size * 2
    const rot = (wmRotate.value * Math.PI) / 180
    const diag = Math.sqrt(w * w + h * h)
    for (let y = -diag; y < h + diag; y += stepY) {
      for (let x = -diag; x < w + diag; x += stepX) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.fillText(text, 0, 0)
        ctx.restore()
      }
    }
  } else {
    let x = padding
    let y = h / 2
    switch (pos) {
      case 'top-left':
        x = padding
        y = padding + size / 2
        break
      case 'top-right':
        x = w - textWidth - padding
        y = padding + size / 2
        break
      case 'center':
        x = (w - textWidth) / 2
        y = h / 2
        break
      case 'bottom-left':
        x = padding
        y = h - padding
        break
      case 'bottom-right':
        x = w - textWidth - padding
        y = h - padding
        break
    }
    if (wmRotate.value !== 0) {
      const cx = x + textWidth / 2
      const cy = y
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((wmRotate.value * Math.PI) / 180)
      ctx.fillText(text, -textWidth / 2, 0)
      ctx.restore()
    } else {
      ctx.fillText(text, x, y)
    }
  }
}

function drawBlankPreview(text = '加载 PDF 预览中…') {
  const canvas = watermarkPreviewCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = 360 * dpr
  canvas.height = 510 * dpr
  canvas.style.width = '100%'
  canvas.style.height = 'auto'
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, 360, 510)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 180, 255)
  ctx.textAlign = 'start'
}

async function drawWatermarkPreview() {
  const canvas = watermarkPreviewCanvas.value
  if (!canvas) return
  if (!pdfState.value) {
    drawBlankPreview()
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 范围保护
  const totalPages = pdfState.value.totalPages
  if (wmPageIndex.value < 1) wmPageIndex.value = 1
  if (wmPageIndex.value > totalPages) wmPageIndex.value = totalPages
  const pageNo = wmPageIndex.value

  // 取/缓存当前页
  const pageCanvas = await getCachedPage(pageNo)
  if (!pageCanvas) {
    drawBlankPreview('该页渲染失败')
    return
  }

  const dpr = window.devicePixelRatio || 1
  canvas.width = pageCanvas.width * dpr
  canvas.height = pageCanvas.height * dpr
  // CSS 关键: width: 100% + height: auto → canvas 等比缩放填满容器宽度,高度按比例
  canvas.style.width = '100%'
  canvas.style.height = 'auto'

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.drawImage(pageCanvas, 0, 0)

  // 叠加水印(局部坐标 = canvas 物理像素,scale 1.0 等于真实 PDF 像素)
  drawWatermarkOnCtx(ctx, pageCanvas.width, pageCanvas.height)
}

// 防抖重绘
let wmDrawTimer: ReturnType<typeof setTimeout> | null = null
function scheduleWatermarkDraw() {
  if (wmDrawTimer) clearTimeout(wmDrawTimer)
  wmDrawTimer = setTimeout(drawWatermarkPreview, 50)
}

// 监听水印参数变化重绘
watchEffect(() => {
  void wmText.value
  void wmSize.value
  void wmPosition.value
  void wmColor.value
  void wmOpacity.value
  void wmRotate.value
  if (watermarkPreviewCanvas.value) scheduleWatermarkDraw()
})

// 切换页时也重绘
watch(wmPageIndex, () => {
  if (watermarkPreviewCanvas.value) scheduleWatermarkDraw()
})

async function doWatermark() {
  if (!pdfState.value) return
  if (!wmText.value.trim()) {
    errorMsg.value = '请输入水印文字'
    return
  }
  wmBusy.value = true
  errorMsg.value = ''
  try {
    const pages = wmSelectedOnly.value
      ? Array.from(pdfState.value.selectedPages).sort((a, b) => a - b)
      : undefined
    const bytes = await addPdfWatermark(pdfState.value.file, {
      text: wmText.value,
      font: wmFont.value,
      position: wmPosition.value,
      fontSize: wmSize.value,
      color: wmColor.value,
      opacity: wmOpacity.value,
      rotate: wmRotate.value,
      pages
    })
    downloadBlob(bytesToBlob(bytes), `${stripExt(pdfState.value.file.name)}-watermarked.pdf`)
  } catch (e) {
    errorMsg.value = '水印失败: ' + (e as Error).message
  } finally {
    wmBusy.value = false
  }
}

// ===== Office → PDF =====
const officeFile = ref<File | null>(null)
const officeBusy = ref(false)
const officeInput = ref<HTMLInputElement | null>(null)
function openOfficeFile() {
  officeInput.value?.click()
}
function onOfficeChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) officeFile.value = f
}
function clearOfficeFile() {
  officeFile.value = null
  if (officeInput.value) officeInput.value.value = ''
}
const officeDragOver = ref(false)
function onOfficeDrop(e: DragEvent) {
  e.preventDefault()
  officeDragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) officeFile.value = f
}
function onOfficeDragOver(e: DragEvent) {
  e.preventDefault()
  officeDragOver.value = true
}
function onOfficeDragLeave() {
  officeDragOver.value = false
}

async function doOfficeToPdf() {
  if (!officeFile.value) return
  officeBusy.value = true
  errorMsg.value = ''
  try {
    const bytes = await docxToPdf(officeFile.value)
    downloadBlob(bytesToBlob(bytes), `${stripExt(officeFile.value.name)}.pdf`)
  } catch (e) {
    errorMsg.value = 'Office → PDF 失败: ' + (e as Error).message
  } finally {
    officeBusy.value = false
  }
}

// 缩略图渲染
const canvasRefs = ref<(HTMLCanvasElement | null)[]>([])
const previewCanvas = ref<HTMLCanvasElement | null>(null)

// 监听 [pdfState, previewCanvas] 两个值,任一变化且都有效时渲染预览
watch(
  () => [pdfState.value, previewCanvas.value] as const,
  async ([s, canvas]) => {
    if (!s || !canvas) return
    try {
      await renderPageToCanvas(s.doc, 1, canvas, 0.3)
    } catch (e) {
      console.warn('[preview] render failed:', e)
    }
  },
  { immediate: true, flush: 'post' }
)

// 全部缩略图(extract/remove tab 用的网格)
watch(
  () => pdfState.value,
  async (s) => {
    canvasRefs.value = []
    if (!s) return
    // 等 DOM 把 canvas refs 数组里的位置占好
    await new Promise((r) => requestAnimationFrame(r))
    const doc = s.doc as Parameters<typeof renderPageToCanvas>[0]
  canvasRefs.value = new Array(s.totalPages).fill(null)
    for (let i = 1; i <= s.totalPages; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      const canvas = canvasRefs.value[i - 1]
      if (canvas) {
        try {
          await renderPageToCanvas(doc, i, canvas, 0.4)
        } catch {
          /* 忽略单页错误 */
        }
      }
    }
  },
  { immediate: true, flush: 'post' }
)

onUnmounted(() => {
  if (pdfState.value) (pdfState.value.doc as unknown as { destroy: () => void }).destroy()
})
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-7xl px-4 py-6">
      <RouterLink v-if="showHome" to="/doc" class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
        返回文档工具
      </RouterLink>

      <!-- ===== 卡片首页 ===== -->
      <div v-if="showHome">
        <div class="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-3xl font-bold text-slate-900 dark:text-white">PDF 工具</h1>
            <p class="mt-1 text-slate-500 dark:text-slate-400">8 个功能,所有处理在浏览器内完成,文件不上传</p>
          </div>
        </div>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="t in pdfTools"
            :key="t.id"
            class="group relative block cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
            @click="openTab(t.id)"
          >
            <div
              v-if="t.tag"
              class="absolute right-4 top-4 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-brand-950 dark:group-hover:text-brand-300"
            >
              {{ t.tag }}
            </div>
            <div
              class="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 dark:from-brand-950 dark:to-brand-900 dark:text-brand-400"
            >
              <svg v-if="t.icon === 'merge'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="11" height="11" rx="2" />
                <rect x="10" y="10" width="11" height="11" rx="2" />
              </svg>
              <svg v-else-if="t.icon === 'split'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="6" y="3" width="12" height="18" rx="2" />
                <path d="M12 3v18" stroke-dasharray="2 2" />
              </svg>
              <svg v-else-if="t.icon === 'extract'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="m12 11 3 3-3 3" />
                <path d="M15 14H9" />
              </svg>
              <svg v-else-if="t.icon === 'remove'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="m12 11-3 3 3 3" />
                <path d="M9 14h6" />
              </svg>
              <svg v-else-if="t.icon === 'watermark'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 8h10" />
                <path d="M7 12h10" />
                <path d="M7 16h6" />
              </svg>
              <svg v-else-if="t.icon === 'compress'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12 A10 10 0 1 1 12 2" />
                <path d="M22 2 12 12" />
                <path d="M16 2h6v6" />
              </svg>
              <svg v-else-if="t.icon === 'toImage'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <svg v-else-if="t.icon === 'office'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h6" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <h3 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">{{ t.title }}</h3>
            <p class="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{{ t.desc }}</p>
            <div class="mt-4 flex items-center text-sm font-medium text-brand-600 dark:text-brand-400">
              打开
              <svg class="ml-1 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 子视图 ===== -->
      <div v-else>
        <button class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="backToHome">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          返回 PDF 工具
        </button>

        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ pdfTools.find((p) => p.id === tab)?.title || 'PDF 工具' }}</h1>
            <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{{ pdfTools.find((p) => p.id === tab)?.desc || '' }}</p>
          </div>
          <div v-if="tab !== 'merge' && tab !== 'office2pdf' && tab !== 'compress'" class="flex items-center gap-2">
            <input ref="fileInput" type="file" accept="application/pdf" class="hidden" @change="onFileChange" />
            <button class="btn-primary" @click="openFile">选择 PDF</button>
          </div>
        </div>

        <div v-if="errorMsg" class="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {{ errorMsg }}
        </div>

      <!-- 合并 tab:插入式合并 — 目标 PDF 全部 + 源 PDF 选中的页 -->
      <div v-if="tab === 'merge'" class="space-y-4">
        <!-- 顶部:合并方向 + 两份 PDF 状态 -->
        <div class="card space-y-3">
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <span class="text-slate-500">合并方向:</span>
            <div class="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
              <button
                class="rounded-md px-3 py-1 text-xs"
                :class="mergeOrder === 'AB' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
                @click="mergeOrder = 'AB'"
              >A → B(从 A 选 → 合并到 B)</button>
              <button
                class="rounded-md px-3 py-1 text-xs"
                :class="mergeOrder === 'BA' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
                @click="mergeOrder = 'BA'"
              >B → A(从 B 选 → 合并到 A)</button>
            </div>
            <span class="text-xs text-slate-500">
              输出 =
              <span class="rounded bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{{ mergeTarget }} 全部</span>
              +
              <span class="rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{{ mergeDonor }} 选中</span>
            </span>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex items-center gap-2">
              <span
                class="rounded-md px-2 py-1 text-xs font-semibold"
                :class="mergeTarget === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'"
              >
                {{ mergeTarget === 'A' ? '目标 A' : '源 A' }}
              </span>
              <button class="btn-secondary" @click="pickMergeFile('A')">选择 A</button>
              <button v-if="mergeSrcA.file" class="text-xs text-slate-500 hover:text-rose-500" @click="clearMergeFile('A')">清除</button>
              <div v-if="mergeSrcA.file" class="min-w-0 flex-1 truncate text-sm" :title="mergeSrcA.file.name">
                {{ mergeSrcA.file.name }}
                <span class="ml-1 text-xs text-slate-500">
                  ({{ mergeSrcA.totalPages }} 页 · {{ mergeTarget === 'A' ? '全部进输出' : `已选 ${mergeSelectedA.size}` }})
                </span>
              </div>
              <div v-else class="text-xs text-slate-400">未选择</div>
            </div>
            <div class="flex items-center gap-2">
              <span
                class="rounded-md px-2 py-1 text-xs font-semibold"
                :class="mergeTarget === 'B' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'"
              >
                {{ mergeTarget === 'B' ? '目标 B' : '源 B' }}
              </span>
              <button class="btn-secondary" @click="pickMergeFile('B')">选择 B</button>
              <button v-if="mergeSrcB.file" class="text-xs text-slate-500 hover:text-rose-500" @click="clearMergeFile('B')">清除</button>
              <div v-if="mergeSrcB.file" class="min-w-0 flex-1 truncate text-sm" :title="mergeSrcB.file.name">
                {{ mergeSrcB.file.name }}
                <span class="ml-1 text-xs text-slate-500">
                  ({{ mergeSrcB.totalPages }} 页 · {{ mergeTarget === 'B' ? '全部进输出' : `已选 ${mergeSelectedB.size}` }})
                </span>
              </div>
              <div v-else class="text-xs text-slate-400">未选择</div>
            </div>
          </div>
        </div>

        <!-- 主体:两份 PDF 的页网格,左右两栏 -->
        <div class="grid gap-4 lg:grid-cols-2">
          <!-- A 列 -->
          <div
            class="card flex min-h-0 flex-col"
            :class="mergeTarget === 'A' ? 'border-emerald-200 dark:border-emerald-900' : 'border-amber-200 dark:border-amber-900'"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <span
                  class="rounded-md px-1.5 py-0.5 text-xs"
                  :class="mergeTarget === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'"
                >{{ mergeTarget === 'A' ? '目标 A' : '源 A' }}</span>
                <span class="truncate">{{ mergeSrcA.file?.name || '未选择 PDF' }}</span>
              </h3>
              <div v-if="mergeSrcA.file && mergeTarget !== 'A'" class="flex items-center gap-2 text-xs">
                <button class="text-slate-500 hover:text-brand-500" @click="selectAllInSide('A')">全选</button>
                <button class="text-slate-500 hover:text-brand-500" @click="clearAllInSide('A')">全不选</button>
              </div>
              <div v-else-if="mergeSrcA.file && mergeTarget === 'A'" class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>全部进输出</span>
              </div>
            </div>
            <div v-if="!mergeSrcA.file" class="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              点击上方「选择 A」按钮
            </div>
            <div v-else-if="mergeSrcA.loading" class="flex h-40 items-center justify-center text-sm text-slate-500">
              加载中…
            </div>
            <div v-else-if="mergeSrcA.loadError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              加载失败: {{ mergeSrcA.loadError }}
            </div>
            <div v-else class="grid max-h-[60vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-4 md:grid-cols-5">
              <template v-for="p in mergeSrcA.totalPages" :key="`A-${p}`">
                <!-- 源:可点击 -->
                <button
                  v-if="mergeTarget !== 'A'"
                  class="group relative flex flex-col items-center gap-1 rounded-lg border-2 p-1 transition-all"
                  :class="mergeSelectedA.has(p) ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-200 bg-white hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900'"
                  @click="toggleMergePage('A', p)"
                >
                  <div class="aspect-[3/4] w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <img v-if="mergeSrcA.thumbs.get(p)" :src="mergeSrcA.thumbs.get(p)!" class="h-full w-full object-contain" :alt="`A 第 ${p} 页`" />
                  </div>
                  <div class="flex items-center gap-1 text-xs">
                    <span
                      class="grid h-3.5 w-3.5 place-items-center rounded border"
                      :class="mergeSelectedA.has(p) ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 dark:border-slate-600'"
                    >
                      <svg v-if="mergeSelectedA.has(p)" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span class="text-slate-600 dark:text-slate-300">第 {{ p }} 页</span>
                  </div>
                </button>
                <!-- 目标:全部锁定,灰色 + 锁图标 -->
                <div
                  v-else
                  class="relative flex flex-col items-center gap-1 rounded-lg border-2 border-emerald-300 bg-emerald-50/50 p-1 dark:border-emerald-800 dark:bg-emerald-950/30"
                >
                  <div class="aspect-[3/4] w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <img v-if="mergeSrcA.thumbs.get(p)" :src="mergeSrcA.thumbs.get(p)!" class="h-full w-full object-contain opacity-90" :alt="`A 第 ${p} 页`" />
                  </div>
                  <div class="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>第 {{ p }} 页</span>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- B 列 -->
          <div
            class="card flex min-h-0 flex-col"
            :class="mergeTarget === 'B' ? 'border-emerald-200 dark:border-emerald-900' : 'border-amber-200 dark:border-amber-900'"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <span
                  class="rounded-md px-1.5 py-0.5 text-xs"
                  :class="mergeTarget === 'B' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'"
                >{{ mergeTarget === 'B' ? '目标 B' : '源 B' }}</span>
                <span class="truncate">{{ mergeSrcB.file?.name || '未选择 PDF' }}</span>
              </h3>
              <div v-if="mergeSrcB.file && mergeTarget !== 'B'" class="flex items-center gap-2 text-xs">
                <button class="text-slate-500 hover:text-brand-500" @click="selectAllInSide('B')">全选</button>
                <button class="text-slate-500 hover:text-brand-500" @click="clearAllInSide('B')">全不选</button>
              </div>
              <div v-else-if="mergeSrcB.file && mergeTarget === 'B'" class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>全部进输出</span>
              </div>
            </div>
            <div v-if="!mergeSrcB.file" class="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              点击上方「选择 B」按钮
            </div>
            <div v-else-if="mergeSrcB.loading" class="flex h-40 items-center justify-center text-sm text-slate-500">
              加载中…
            </div>
            <div v-else-if="mergeSrcB.loadError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              加载失败: {{ mergeSrcB.loadError }}
            </div>
            <div v-else class="grid max-h-[60vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-4 md:grid-cols-5">
              <template v-for="p in mergeSrcB.totalPages" :key="`B-${p}`">
                <!-- 源:可点击 -->
                <button
                  v-if="mergeTarget !== 'B'"
                  class="group relative flex flex-col items-center gap-1 rounded-lg border-2 p-1 transition-all"
                  :class="mergeSelectedB.has(p) ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-200 bg-white hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900'"
                  @click="toggleMergePage('B', p)"
                >
                  <div class="aspect-[3/4] w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <img v-if="mergeSrcB.thumbs.get(p)" :src="mergeSrcB.thumbs.get(p)!" class="h-full w-full object-contain" :alt="`B 第 ${p} 页`" />
                  </div>
                  <div class="flex items-center gap-1 text-xs">
                    <span
                      class="grid h-3.5 w-3.5 place-items-center rounded border"
                      :class="mergeSelectedB.has(p) ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 dark:border-slate-600'"
                    >
                      <svg v-if="mergeSelectedB.has(p)" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span class="text-slate-600 dark:text-slate-300">第 {{ p }} 页</span>
                  </div>
                </button>
                <!-- 目标:全部锁定,灰色 + 锁图标 -->
                <div
                  v-else
                  class="relative flex flex-col items-center gap-1 rounded-lg border-2 border-emerald-300 bg-emerald-50/50 p-1 dark:border-emerald-800 dark:bg-emerald-950/30"
                >
                  <div class="aspect-[3/4] w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <img v-if="mergeSrcB.thumbs.get(p)" :src="mergeSrcB.thumbs.get(p)!" class="h-full w-full object-contain opacity-90" :alt="`B 第 ${p} 页`" />
                  </div>
                  <div class="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>第 {{ p }} 页</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- 合并后输出预览区(预览后展开) -->
        <div
          v-if="mergePreviewOpen"
          class="space-y-3 rounded-2xl border-2 border-brand-300 bg-gradient-to-br from-brand-50/50 to-white p-4 dark:border-brand-700 dark:from-brand-950/30 dark:to-slate-900"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-brand-500">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                合并后输出预览
              </h3>
              <p class="mt-1 text-xs text-slate-500">
                已按
                <span class="font-semibold text-brand-600 dark:text-brand-400">{{ mergeOrder === 'AB' ? 'A → B' : 'B → A' }}</span>
                顺序合并 ·
                共 <span class="font-semibold text-brand-600 dark:text-brand-400">{{ mergePreviewPages.length }}</span> 页
                <span v-if="mergeSelectedA.size">(来自 A {{ mergeSelectedA.size }} 页)</span>
                <span v-if="mergeSelectedB.size">(来自 B {{ mergeSelectedB.size }} 页)</span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button class="btn-secondary text-sm" @click="closeMergePreview">关闭预览</button>
              <button
                class="btn-primary text-sm"
                :disabled="!mergePreviewBytes"
                @click="downloadMergePreview"
              >
                下载 picked-{{ mergeOrder }}.pdf
              </button>
            </div>
          </div>

          <div v-if="mergePreviewError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            预览失败: {{ mergePreviewError }}
          </div>

          <div v-if="mergePreviewLoading" class="flex items-center justify-center py-12 text-sm text-slate-500">
            <svg class="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            正在生成预览…
          </div>

          <div v-else-if="mergePreviewPages.length > 0" class="space-y-3">
            <!-- 大图预览 -->
            <div class="flex max-h-[55vh] items-start justify-center overflow-auto rounded-lg bg-white p-4 shadow-inner dark:bg-slate-800">
              <div class="flex flex-col items-center gap-2">
                <img
                  v-if="mergePreviewSelectedDataURL"
                  :src="mergePreviewSelectedDataURL"
                  class="max-h-[50vh] w-auto rounded shadow-lg"
                  :alt="`输出第 ${mergePreviewSelected} 页`"
                />
                <div v-if="mergePreviewSelectedSource" class="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="mergePreviewSelectedSource.role === 'target' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'"
                  >{{ mergePreviewSelectedSource.role === 'target' ? '目标' : '源' }}</span>
                  <span>来自 {{ mergePreviewSelectedSource.side }} 第 {{ mergePreviewSelectedSource.pageNo }} 页</span>
                  <span class="text-slate-400">·</span>
                  <span>输出第 {{ mergePreviewSelected }} 页</span>
                </div>
              </div>
            </div>
            <!-- 缩略图列表 -->
            <div class="grid max-h-[28vh] grid-cols-4 gap-2 overflow-auto sm:grid-cols-6 md:grid-cols-8">
              <button
                v-for="pg in mergePreviewPages"
                :key="`prev-${pg.pageNo}`"
                class="group flex flex-col items-center gap-1 rounded-lg border-2 p-1 transition-all"
                :class="mergePreviewSelected === pg.pageNo ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40' : 'border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900'"
                @click="mergePreviewSelected = pg.pageNo"
              >
                <div class="aspect-[3/4] w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                  <img :src="pg.dataURL" class="h-full w-full object-contain" :alt="`输出第 ${pg.pageNo} 页`" />
                </div>
                <div class="flex items-center gap-1 text-[10px]">
                  <span
                    class="rounded px-1 text-[9px] font-semibold"
                    :class="pg.role === 'target' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'"
                  >{{ pg.role === 'target' ? '目' : '源' }}</span>
                  <span class="text-slate-500">{{ pg.fromPageNo }}</span>
                  <span class="text-slate-400">→</span>
                  <span class="font-semibold text-slate-700 dark:text-slate-200">{{ pg.pageNo }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="card flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-slate-500">
            输出共 <span class="font-semibold text-brand-600 dark:text-brand-400">{{ mergeTotalSelected }}</span> 页
            <span class="ml-1">
              ({{ mergeTarget }} 全部 {{ getMergeSrc(mergeTarget).value.totalPages }} 页
              + {{ mergeDonor }} 选中 {{ getMergeSel(mergeDonor).value.size }} 页)
            </span>
          </p>
          <div class="flex items-center gap-2">
            <button
              class="btn-secondary"
              :disabled="mergeBusy || mergeTotalSelected === 0 || getMergeSel(mergeDonor).value.size === 0"
              @click="doMergePreview"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              预览合并结果
            </button>
            <button
              class="btn-primary"
              :disabled="mergeBusy || mergeTotalSelected === 0 || getMergeSel(mergeDonor).value.size === 0"
              @click="doMergePicked"
            >
              {{ mergeBusy ? '合并中…' : `下载 inserted-${mergeOrder}.pdf` }}
            </button>
          </div>
        </div>
      </div>

      <!-- Office → PDF (不需要打开 PDF) -->
      <div v-else-if="tab === 'office2pdf'" class="space-y-4">
        <div
          class="card"
          :class="{ 'ring-2 ring-brand-400': officeDragOver }"
          @drop="onOfficeDrop"
          @dragover="onOfficeDragOver"
          @dragleave="onOfficeDragLeave"
        >
          <input ref="officeInput" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hidden" @change="onOfficeChange" />
          <div
            v-if="!officeFile"
            class="rounded-2xl border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-slate-900"
            :class="officeDragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-600'"
          >
            <div class="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h6" />
              </svg>
            </div>
            <p class="text-base font-medium text-slate-700 dark:text-slate-200">点击或拖拽 .docx 文件</p>
            <button class="btn-primary mt-4" @click="openOfficeFile">选择 .docx</button>
            <p class="mt-2 text-xs text-slate-500">仅支持 Word .docx,不支持 .xlsx / .pptx</p>
          </div>
          <div v-else class="flex items-center justify-between gap-3 p-3">
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium text-slate-900 dark:text-white">{{ officeFile.name }}</div>
              <div class="mt-0.5 text-xs text-slate-500">{{ formatSize(officeFile.size) }}</div>
            </div>
            <button class="text-xs text-slate-500 hover:text-rose-500" @click="clearOfficeFile">移除</button>
          </div>
        </div>
        <button class="btn-primary w-full" :disabled="!officeFile || officeBusy" @click="doOfficeToPdf">
          {{ officeBusy ? '生成中…' : '转换为 PDF 并下载' }}
        </button>
        <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <div class="font-semibold">限制说明</div>
          <ul class="mt-1 list-disc pl-5 leading-5">
            <li>浏览器内 PDF 库只内置拉丁字体(Helvetica),<b>中文/日文/韩文会渲染为方块</b>。如需 CJK 字体,需引入额外字体文件。</li>
            <li>不保留原始 .docx 的图片、表格样式、复杂排版,只保留标题/段落/列表/代码块/引用/表格的文本结构。</li>
            <li>适合"快速把纯文字稿件转成 PDF"的场景。复杂排版请用桌面 Word 导出。</li>
          </ul>
        </div>
      </div>

      <!-- PDF 压缩(独立批量 UI,不走通用 "打开 PDF" 流程) -->
      <div v-else-if="tab === 'compress'" class="space-y-4">
        <!-- 顶部操作栏 -->
        <div class="card flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">PDF 压缩</h2>
            <span class="text-xs text-slate-500">批量栅格化重打包 · 4 种压缩模式</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn-secondary text-sm" :disabled="compressItems.length === 0" @click="clearCompressDone">清空已完成</button>
            <button class="btn-primary text-sm" @click="pickCompressFiles">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
                <path d="M12 5v14M5 12h14" />
              </svg>
              添加文件
            </button>
          </div>
        </div>

        <!-- 拖放区(无文件时) -->
        <div
          v-if="compressItems.length === 0"
          class="card flex h-72 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50 transition-colors hover:border-brand-400 hover:bg-brand-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-700 dark:hover:bg-brand-950/20"
          :class="{ 'border-brand-500 bg-brand-50/50 dark:border-brand-700 dark:bg-brand-950/30': compressDragOver }"
          @click="pickCompressFiles"
          @dragenter.prevent="compressDragOver = true"
          @dragover.prevent="compressDragOver = true"
          @dragleave.prevent="compressDragOver = false"
          @drop.prevent="(e) => { compressDragOver = false; if (e.dataTransfer?.files) addCompressFiles(Array.from(e.dataTransfer.files)) }"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p class="mt-3 text-base text-slate-600 dark:text-slate-300">PDF 文件拖拽到此处</p>
          <p class="mt-1 text-sm text-slate-500">或点击添加文件</p>
        </div>

        <!-- 文件列表(有文件时) -->
        <div v-else class="card overflow-hidden p-0">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                  <th class="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      :checked="compressItems.every(it => it.status === 'done' || it.status === 'failed')"
                      class="h-4 w-4 rounded border-slate-300"
                      @change="(e) => { const checked = (e.target as HTMLInputElement).checked; compressItems.forEach(it => { if (it.status === 'done' || it.status === 'failed') it.status = checked ? 'pending' : 'done' }) }"
                    />
                  </th>
                  <th class="min-w-[180px] px-3 py-2 text-left font-medium">文件名称</th>
                  <th class="w-20 px-3 py-2 text-left font-medium">页数</th>
                  <th class="w-24 px-3 py-2 text-left font-medium">文件大小</th>
                  <th class="w-28 px-3 py-2 text-left font-medium">压缩后大小</th>
                  <th class="w-44 px-3 py-2 text-left font-medium">状态</th>
                  <th class="w-32 px-3 py-2 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in compressItems"
                  :key="item.id"
                  class="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                >
                  <td class="px-3 py-2">
                    <input
                      type="checkbox"
                      :checked="item.status === 'done' || item.status === 'failed'"
                      :disabled="item.status === 'processing'"
                      class="h-4 w-4 rounded border-slate-300"
                      @change="(e) => { const checked = (e.target as HTMLInputElement).checked; if (item.status === 'done' || item.status === 'failed') item.status = checked ? 'pending' : 'done' }"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-rose-500">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span class="truncate" :title="item.file.name">{{ item.file.name }}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-slate-600 dark:text-slate-300">
                    <span v-if="item.pageCount > 0">{{ item.pageCount }}</span>
                    <span v-else class="text-slate-400">…</span>
                  </td>
                  <td class="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{{ formatSizeFile(item.originalSize) }}</td>
                  <td class="px-3 py-2 font-mono text-xs">
                    <div v-if="item.compressedSize != null" :class="compressRatio(item) > 5 ? 'text-emerald-600 dark:text-emerald-400' : compressRatio(item) < -5 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'">
                      <div>
                        {{ formatSizeFile(item.compressedSize) }}
                        <span class="ml-1 text-[10px]">({{ compressRatio(item) > 0 ? '↓' : '↑' }} {{ Math.abs(compressRatio(item)).toFixed(0) }}%)</span>
                      </div>
                      <div
                        v-if="compressRatio(item) < -5"
                        class="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400"
                        :title="'当前模式是栅格化,文字型 PDF 会被转成图片,通常会变大。建议改用「无损压缩」。'"
                      >
                        ⚠️ 文字型 PDF?
                      </div>
                      <div
                        v-else-if="compressRatio(item) >= 0 && compressRatio(item) <= 2"
                        class="mt-0.5 text-[10px] text-slate-500"
                        :title="'文件本身已接近最优压缩比,无损空间有限。要大幅减小建议:① 改用栅格化模式(文字会丢) ② 桌面 PDF 工具(Adobe / Foxit / mupdf)'"
                      >
                        ≈ 文件已接近最优
                      </div>
                    </div>
                    <span v-else class="text-slate-400">-</span>
                  </td>
                  <td class="px-3 py-2">
                    <div v-if="item.status === 'pending'" class="text-xs text-slate-500">等待</div>
                    <div v-else-if="item.status === 'processing'" class="space-y-1">
                      <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div class="h-full bg-brand-500 transition-all" :style="{ width: item.progress + '%' }" />
                      </div>
                      <div class="text-[10px] text-slate-500">{{ item.progress }}%</div>
                    </div>
                    <div v-else-if="item.status === 'done'" class="text-xs text-emerald-600 dark:text-emerald-400">完成</div>
                    <div v-else class="text-xs text-rose-600 dark:text-rose-400" :title="item.error">失败</div>
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-1">
                      <button
                        v-if="item.status === 'done'"
                        class="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                        title="下载"
                        @click="downloadOne(item)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                      <button
                        v-if="item.status === 'pending' || item.status === 'failed'"
                        class="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                        :disabled="compressBusy"
                        title="开始"
                        @click="compressSingleItem(item)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                      <button
                        class="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
                        :disabled="item.status === 'processing'"
                        title="删除"
                        @click="removeCompressItem(item.id)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
            共 {{ compressItems.length }} 个文件 · 已完成 {{ compressItems.filter(it => it.status === 'done').length }} 个 · 失败 {{ compressItems.filter(it => it.status === 'failed').length }} 个
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="card space-y-3">
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <span class="text-slate-500">压缩模式:</span>
            <label
              v-for="m in (['lossless','quality','balanced','size','min'] as CompressMode[])"
              :key="m"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
              :class="compressMode === m ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'"
            >
              <input type="radio" :value="m" v-model="compressMode" class="sr-only" />
              <span class="font-medium">{{ COMPRESS_MODE_INFO[m].label }}</span>
              <span v-if="COMPRESS_MODE_INFO[m].method === 'rasterize'" class="text-[10px] text-slate-500">scale {{ COMPRESS_MODE_INFO[m].scale }} · q{{ COMPRESS_MODE_INFO[m].jpegQuality }}</span>
              <span v-else class="text-[10px] text-emerald-600 dark:text-emerald-400">保留文字</span>
            </label>
            <button
              v-if="compressItems.length > 0"
              class="text-xs text-brand-600 hover:underline dark:text-brand-400"
              @click="autoRecommendMode"
              title="根据文件大小/页数自动选模式"
            >
              ✨ 智能推荐
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <span class="text-slate-500">输出目录:</span>
            <select
              v-model="compressOutputDest"
              class="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="download">下载到本地</option>
              <option value="dir">保存到指定目录(Chrome/Edge)</option>
            </select>
            <button
              v-if="compressOutputDest === 'dir'"
              class="btn-secondary text-xs"
              @click="pickCompressDir"
            >
              {{ compressDirHandle ? '✓ ' + compressDirHandle.name : '选择目录' }}
            </button>
            <label class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" v-model="compressOverwrite" :disabled="compressOutputDest !== 'dir'" class="h-3.5 w-3.5 rounded border-slate-300" />
              <span>覆盖原文件</span>
              <span class="text-amber-500">(*谨慎选择)</span>
            </label>
            <div class="ml-auto">
              <button
                class="btn-primary"
                :disabled="compressBusy || compressItems.filter(it => it.status === 'pending' || it.status === 'failed').length === 0"
                @click="startCompress"
              >
                {{ compressBusy ? '压缩中…' : '开始压缩' }}
              </button>
            </div>
          </div>
          <p v-if="compressItems.some(it => it.status === 'done')" class="text-xs text-slate-500">
            已完成 {{ compressItems.filter(it => it.status === 'done').length }} 个文件
            <button class="ml-2 text-brand-600 hover:underline dark:text-brand-400" @click="downloadAll">全部下载</button>
          </p>
          <details class="text-xs text-slate-500">
            <summary class="cursor-pointer">⚠️ 浏览器内 PDF 压缩的副作用</summary>
            <div class="mt-2 space-y-1 leading-relaxed">
              <p>· 文字会丢失(变成纯图片 PDF,不可选/搜索/复制),仅适合"扫描版"或"图片型" PDF</p>
              <p>· 处理耗时:每页约 100-500ms,100 页文件约 30s-1min</p>
              <p>· 内存峰值:每页约 4MB(200dpi JPEG),100 页约 400MB</p>
              <p>· 输出模式:scale(2.0/1.5/1.2/0.9) × jpegQuality(0.92/0.78/0.62/0.42)</p>
            </div>
          </details>
        </div>
      </div>

      <!-- 需要打开 PDF 的 tabs -->
      <template v-else>
        <div v-if="!pdfState" class="card">
          <div
            class="rounded-2xl border-2 border-dashed bg-white p-12 text-center transition-colors dark:bg-slate-900"
            :class="dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-600'"
            @drop="onDrop"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
          >
            <p class="text-base font-medium text-slate-700 dark:text-slate-200">点击「选择 PDF」按钮或拖拽 PDF 到这里</p>
            <p class="mt-1 text-sm text-slate-500">只支持单个 PDF 文件</p>
          </div>
        </div>
        <div v-else class="space-y-4">
          <!-- 文件信息条:水印 tab 用自己右栏的 PDF 预览代替,这里不显示 -->
          <div v-if="tab !== 'watermark'" class="card flex flex-wrap items-center gap-4 p-3 text-sm">
            <canvas
              ref="previewCanvas"
              class="h-20 w-auto flex-shrink-0 rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium text-slate-900 dark:text-white">{{ pdfState.file.name }}</div>
              <div class="mt-0.5 text-xs text-slate-500">
                {{ formatSize(pdfState.file.size) }} · {{ pdfState.totalPages }} 页
              </div>
            </div>
            <button class="flex-shrink-0 text-xs text-slate-500 hover:text-rose-500" @click="closeFile">关闭</button>
          </div>

          <!-- 拆分 -->
          <div v-if="tab === 'split'" class="card space-y-4">
            <div class="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900">
              <button class="rounded-md px-3 py-1" :class="splitMode === 'range' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'" @click="splitMode = 'range'">按范围</button>
              <button class="rounded-md px-3 py-1" :class="splitMode === 'perPage' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'" @click="splitMode = 'perPage'">每页一个</button>
            </div>
            <div v-if="splitMode === 'range'">
              <label class="label">页范围 (逗号或换行分隔,例 1-3, 5, 7-)</label>
              <input v-model="splitRanges" class="input font-mono" placeholder="1-3, 5, 7-10" />
              <p class="mt-1 text-xs text-slate-500">每个范围生成一个 PDF,多文件自动打包 ZIP</p>
            </div>
            <button class="btn-primary w-full" :disabled="loading" @click="doSplit">
              {{ loading ? '处理中…' : '执行拆分' }}
            </button>
          </div>

          <!-- 提取页 -->
          <div v-if="tab === 'extract'" class="card space-y-4">
            <p class="text-sm text-slate-600 dark:text-slate-300">勾选要保留的页,点击提取。共 {{ pdfState.totalPages }} 页,已选 {{ pdfState.selectedPages.size }} 页。</p>
            <div class="flex flex-wrap gap-2 text-sm">
              <button class="btn-secondary" @click="selectAll">全选</button>
              <button class="btn-secondary" @click="selectNone">全不选</button>
            </div>
            <PdfGrid :pages="pdfState.pageInfos" :selected="pdfState.selectedPages" :canvas-refs="canvasRefs" @toggle="togglePage" />
            <button class="btn-primary w-full" :disabled="loading || pdfState.selectedPages.size === 0" @click="doExtract">
              {{ loading ? '处理中…' : `提取 ${pdfState.selectedPages.size} 页` }}
            </button>
          </div>

          <!-- 删除页 -->
          <div v-if="tab === 'remove'" class="card space-y-4">
            <p class="text-sm text-slate-600 dark:text-slate-300">勾选要删除的页,点击删除。共 {{ pdfState.totalPages }} 页,已选 {{ pdfState.selectedPages.size }} 页。</p>
            <div class="flex flex-wrap gap-2 text-sm">
              <button class="btn-secondary" @click="selectAll">全选</button>
              <button class="btn-secondary" @click="selectNone">全不选</button>
            </div>
            <PdfGrid :pages="pdfState.pageInfos" :selected="pdfState.selectedPages" :canvas-refs="canvasRefs" @toggle="togglePage" />
            <button class="btn-primary w-full" :disabled="loading || pdfState.selectedPages.size === 0" @click="doRemove">
              {{ loading ? '处理中…' : `删除 ${pdfState.selectedPages.size} 页` }}
            </button>
          </div>

          <!-- 转图片 -->
          <div v-if="tab === 'toImage'" class="card space-y-4">
            <div class="grid gap-3 sm:grid-cols-3">
              <div>
                <label class="label">缩放倍率 ({{ imgScale }}x)</label>
                <input type="range" min="0.5" max="4" step="0.5" v-model.number="imgScale" class="w-full accent-brand-600" />
              </div>
              <div>
                <label class="label">格式</label>
                <div class="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <button v-for="f in (['png','jpeg','webp'] as const)" :key="f" class="rounded-md px-3 py-1" :class="imgFormat === f ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'" @click="imgFormat = f">{{ f }}</button>
                </div>
              </div>
              <div v-if="imgFormat !== 'png'">
                <label class="label">质量 ({{ Math.round(imgQuality * 100) }}%)</label>
                <input type="range" min="0.1" max="1" step="0.05" v-model.number="imgQuality" class="w-full accent-brand-600" />
              </div>
            </div>
            <div>
              <label class="label">页范围 (留空=全部,例 1-3 或 5)</label>
              <input v-model="imgRange" class="input font-mono" placeholder="留空表示全部" />
            </div>
            <button class="btn-primary w-full" :disabled="imgBusy" @click="doToImage">
              {{ imgBusy ? '处理中…' : '导出图片' }}
            </button>
            <p class="text-xs text-slate-500">多页自动打包 ZIP。PNG 无损但体积大,JPEG/WebP 体积小。</p>
          </div>

          <!-- 添加水印 -->
          <div v-if="tab === 'watermark'" class="grid gap-4 lg:grid-cols-[2fr_3fr]">
            <!-- 左栏:工具 -->
            <div class="card space-y-4">
              <p class="text-sm text-slate-600 dark:text-slate-300">
                在 PDF 上添加文字水印。
                <span class="text-amber-600 dark:text-amber-400">注意:浏览器内 PDF 库只内置拉丁字体 (Helvetica / Times / Courier),中文/日文/韩文会渲染为方块,建议用英文或数字。</span>
              </p>

              <div>
                <label class="label">水印文字</label>
                <input v-model="wmText" class="input font-mono" placeholder="CONFIDENTIAL" />
              </div>

              <div>
                <label class="label">字体</label>
                <select v-model="wmFont" class="input">
                  <option v-for="f in wmFonts" :key="f.id" :value="f.id">{{ f.label }}</option>
                </select>
              </div>

              <div>
                <label class="label">位置</label>
                <div class="grid grid-cols-3 gap-1">
                  <button
                    v-for="p in wmPositions"
                    :key="p.id"
                    class="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs transition-colors dark:border-slate-700 dark:bg-slate-900"
                    :class="wmPosition === p.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'text-slate-600 hover:border-brand-300 dark:text-slate-300'"
                    @click="wmPosition = p.id"
                  >{{ p.label }}</button>
                </div>
              </div>

              <div>
                <label class="label">字体大小 ({{ wmSize }}pt)</label>
                <input type="range" min="12" max="200" step="2" v-model.number="wmSize" class="w-full accent-brand-600" />
              </div>

              <div>
                <label class="label">不透明度 ({{ Math.round(wmOpacity * 100) }}%)</label>
                <input type="range" min="0.05" max="1" step="0.05" v-model.number="wmOpacity" class="w-full accent-brand-600" />
              </div>

              <div>
                <label class="label">颜色</label>
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    v-for="cp in wmColorPresets"
                    :key="cp.label"
                    class="h-7 w-7 rounded-md border-2 transition-all"
                    :style="{ backgroundColor: `rgb(${cp.value.r},${cp.value.g},${cp.value.b})` }"
                    :class="wmColor.r === cp.value.r && wmColor.g === cp.value.g && wmColor.b === cp.value.b ? 'border-brand-500 ring-2 ring-brand-300' : 'border-slate-200 dark:border-slate-700'"
                    :title="cp.label"
                    @click="wmColor = { ...cp.value }"
                  />
                  <span class="ml-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
                    当前
                    <span class="inline-block h-4 w-4 rounded border border-slate-300" :style="{ backgroundColor: wmColorHex }" />
                    <span class="font-mono">{{ wmColorHex }}</span>
                  </span>
                </div>
              </div>

              <div>
                <label class="label">旋转角度 ({{ wmRotate }}°)</label>
                <input type="range" min="-90" max="90" step="5" v-model.number="wmRotate" class="w-full accent-brand-600" />
                <p class="mt-1 text-xs text-slate-500">非平铺模式下生效;平铺模式按此角度均匀铺满整页</p>
              </div>

              <div v-if="pdfState.selectedPages.size > 0">
                <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" v-model="wmSelectedOnly" class="rounded accent-brand-600" />
                  仅应用到已选页 (已选 {{ pdfState.selectedPages.size }} 页)
                </label>
              </div>

              <button class="btn-primary w-full" :disabled="wmBusy || !wmText.trim()" @click="doWatermark">
                {{ wmBusy ? '处理中…' : '应用水印并下载' }}
              </button>
            </div>

            <!-- 右栏:实时预览(单页正常显示 + 滚动) -->
            <div class="card flex min-h-0 flex-col">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label class="label !mb-0">实时预览</label>
                <div class="flex items-center gap-1.5">
                  <button
                    class="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                    :disabled="wmPageIndex <= 1"
                    @click="wmPageIndex--"
                  >← 上一页</button>
                  <span class="px-2 text-sm tabular-nums text-slate-600 dark:text-slate-300">
                    {{ wmPageIndex }} / {{ pdfState.totalPages }}
                  </span>
                  <button
                    class="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                    :disabled="wmPageIndex >= pdfState.totalPages"
                    @click="wmPageIndex++"
                  >下一页 →</button>
                </div>
              </div>
              <div class="flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800">
                <canvas
                  ref="watermarkPreviewCanvas"
                  class="block w-full rounded shadow-sm"
                  style="height: auto;"
                />
              </div>
              <p class="mt-2 text-xs text-slate-500">页内高度超出可视区会显示滚动条;切换页时缓存,拖动滑块实时刷新</p>
            </div>
          </div>
        </div>
      </template>
      </div>
    </section>
  </Layout>
</template>
