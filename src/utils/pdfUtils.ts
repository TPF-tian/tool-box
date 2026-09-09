/**
 * PDF 工具
 * - pdf-lib: 合并/拆分/删除页/重新保存（去 metadata）
 * - pdfjs-dist: 渲染预览 + 转图片
 *
 * 注意：pdf-lib 不会重新编码内容流，"压缩"只能通过去 metadata / 重新打包实现。
 * 想真正压缩需要先把 PDF 渲染为图片再用 pdf-lib 重新打包（这里是另一条独立路径）。
 */
import * as pdfjs from 'pdfjs-dist'
// Vite 友好的 worker 加载：把 worker 文件作为 URL 引入
// 用 .mjs 但 vite.config.ts 已配置固定输出为 pdf.worker.min.js(避免 CDN MIME/hash 问题)
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

// 用结构化类型避开 #private 严格匹配问题(TS 5.7+)
type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>

export type PdfPageInfo = {
  index: number
  width: number
  height: number
}

// ===== 加载/解析 =====

/** 加载 PDF 文件，返回 { doc, totalPages } */
export async function loadPdfFromFile(file: File): Promise<{ doc: PdfDoc; totalPages: number }> {
  const buf = await file.arrayBuffer()
  // pdfjs 会转移 buffer 所有权,所以这里 copy 一份避免外部失效
  const copy = buf.slice(0)
  const doc = await pdfjs.getDocument({ data: copy }).promise
  return { doc, totalPages: doc.numPages }
}

/** 加载 PDF ArrayBuffer */
export async function loadPdfFromBuffer(buf: ArrayBuffer): Promise<{ doc: PdfDoc; totalPages: number }> {
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
  return { doc, totalPages: doc.numPages }
}

/** 获取每页尺寸（pt） */
export async function getPageInfos(doc: PdfDoc): Promise<PdfPageInfo[]> {
  const infos: PdfPageInfo[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    infos.push({ index: i, width: vp.width, height: vp.height })
    page.cleanup()
  }
  return infos
}

/** 渲染指定页为 canvas */
export async function renderPageToCanvas(
  doc: PdfDoc,
  pageNo: number,
  canvas: HTMLCanvasElement,
  scale = 1.5
): Promise<void> {
  const page = await doc.getPage(pageNo)
  const viewport = page.getViewport({ scale })
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  page.cleanup()
}

// ===== 合并 =====

/**
 * 合并多个 PDF 文件
 * @param files PDF 文件数组
 * @param pageRanges 每个文件要取的页范围（1-based, 包含两端）。空数组/未配置=取全部
 *   例如 [[1,3], [2,5]] 表示第一个文件取第 1-3 页,第二个文件取第 2-5 页
 */
export async function mergePdfs(
  files: File[],
  pageRanges: Array<[number, number] | null> = []
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (let i = 0; i < files.length; i++) {
    const bytes = await files[i].arrayBuffer()
    const src = await PDFDocument.load(bytes)
    const range = pageRanges[i]
    let indices: number[]
    if (range) {
      const [from, to] = range
      indices = []
      for (let p = from; p <= to; p++) {
        if (p >= 1 && p <= src.getPageCount()) indices.push(p - 1)
      }
    } else {
      indices = src.getPageIndices()
    }
    const copied = await out.copyPages(src, indices)
    copied.forEach((p) => out.addPage(p))
  }
  return out.save()
}

// ===== 拆分 =====

/** 按范围拆分：每个范围一个输出文件 */
export async function splitPdfByRanges(
  file: File,
  ranges: Array<[number, number]>
): Promise<Uint8Array[]> {
  const bytes = await file.arrayBuffer()
  const src = await PDFDocument.load(bytes)
  const results: Uint8Array[] = []
  for (const [from, to] of ranges) {
    const doc = await PDFDocument.create()
    const indices: number[] = []
    for (let p = from; p <= to; p++) {
      if (p >= 1 && p <= src.getPageCount()) indices.push(p - 1)
    }
    const copied = await doc.copyPages(src, indices)
    copied.forEach((p) => doc.addPage(p))
    results.push(await doc.save())
  }
  return results
}

/** 每页拆成一个文件 */
export async function splitPdfPerPage(file: File): Promise<Uint8Array[]> {
  const bytes = await file.arrayBuffer()
  const src = await PDFDocument.load(bytes)
  const total = src.getPageCount()
  const results: Uint8Array[] = []
  for (let i = 0; i < total; i++) {
    const doc = await PDFDocument.create()
    const [page] = await doc.copyPages(src, [i])
    doc.addPage(page)
    results.push(await doc.save())
  }
  return results
}

// ===== 删除页 =====

/** 删除指定页（1-based） */
export async function removePdfPages(file: File, pagesToRemove: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer()
  const src = await PDFDocument.load(bytes)
  const removeSet = new Set(pagesToRemove.map((p) => p - 1))
  // 从后往前删,避免索引错位
  for (let i = src.getPageCount() - 1; i >= 0; i--) {
    if (removeSet.has(i)) src.removePage(i)
  }
  return src.save()
}

// ===== 提取页 =====

/** 提取指定页生成新 PDF */
export async function extractPdfPages(file: File, pages: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer()
  const src = await PDFDocument.load(bytes)
  const doc = await PDFDocument.create()
  const indices = pages.map((p) => p - 1).filter((i) => i >= 0 && i < src.getPageCount())
  const copied = await doc.copyPages(src, indices)
  copied.forEach((p) => doc.addPage(p))
  return doc.save()
}

// ===== 挑页合并(支持不连续页码)=====

export type MergeOrder = 'AB' | 'BA'

/**
 * 把两份 PDF 中各自勾选的页合并成新 PDF
 * @param fileA PDF A 文件
 * @param pagesA A 中选中的 1-based 页码列表(按列表顺序输出)
 * @param fileB PDF B 文件
 * @param pagesB B 中选中的 1-based 页码列表
 * @param order 输出顺序: 'AB' = A 在前, 'BA' = B 在前
 */
/**
 * 插入式合并:把 donor 选中的页追加到 target 全部页之后
 * 输出顺序 = target 全部页(按原顺序) + donor 已选页(按用户勾选顺序)
 *
 * 这是当前 UI 用的合并方式:
 *   - A→B 方向:target = B(全部),donor = A(选页) → 输出 = B 全部 + A 已选
 *   - B→A 方向:target = A(全部),donor = B(选页) → 输出 = A 全部 + B 已选
 */
export async function mergeInsertIntoTarget(
  targetFile: File,
  donorFile: File,
  donorPages: number[]
): Promise<Uint8Array> {
  const out = await PDFDocument.create()

  // 1. target 全部页
  const tBytes = await targetFile.arrayBuffer()
  const tDoc = await PDFDocument.load(tBytes)
  const tCopied = await out.copyPages(tDoc, tDoc.getPageIndices())
  tCopied.forEach((p) => out.addPage(p))

  // 2. donor 已选页
  if (donorPages.length > 0) {
    const dBytes = await donorFile.arrayBuffer()
    const dDoc = await PDFDocument.load(dBytes)
    const total = dDoc.getPageCount()
    const indices = donorPages
      .map((p) => p - 1)
      .filter((i) => i >= 0 && i < total)
    if (indices.length > 0) {
      const dCopied = await out.copyPages(dDoc, indices)
      dCopied.forEach((p) => out.addPage(p))
    }
  }

  return out.save()
}

export async function mergePickedPages(
  fileA: File | null,
  pagesA: number[],
  fileB: File | null,
  pagesB: number[],
  order: MergeOrder = 'AB'
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const sources: Array<{ file: File; pages: number[] }> =
    order === 'AB'
      ? [
          { file: fileA!, pages: pagesA },
          { file: fileB!, pages: pagesB }
        ]
      : [
          { file: fileB!, pages: pagesB },
          { file: fileA!, pages: pagesA }
        ]
  for (const { file, pages } of sources) {
    if (!file || !pages.length) continue
    const bytes = await file.arrayBuffer()
    const src = await PDFDocument.load(bytes)
    const total = src.getPageCount()
    const indices = pages
      .map((p) => p - 1)
      .filter((i) => i >= 0 && i < total)
    if (!indices.length) continue
    const copied = await out.copyPages(src, indices)
    copied.forEach((p) => out.addPage(p))
  }
  return out.save()
}

// ===== 重新保存（去 metadata，"简单压缩"）=====

/** 重新保存 PDF：去除 metadata（Title/Author/...），通常会小一些 */
export async function reSavePdf(file: File): Promise<{ bytes: Uint8Array; meta: Record<string, unknown> }> {
  const bytes = await file.arrayBuffer()
  const src = await PDFDocument.load(bytes)
  const meta: Record<string, unknown> = {
    Title: src.getTitle(),
    Author: src.getAuthor(),
    Subject: src.getSubject(),
    Keywords: src.getKeywords(),
    Producer: src.getProducer(),
    Creator: src.getCreator(),
    CreationDate: src.getCreationDate()?.toISOString(),
    ModificationDate: src.getModificationDate()?.toISOString()
  }
  src.setTitle('')
  src.setAuthor('')
  src.setSubject('')
  src.setKeywords([])
  src.setProducer('')
  src.setCreator('')
  src.setCreationDate(new Date(0))
  src.setModificationDate(new Date(0))
  const out = await src.save({ useObjectStreams: true })
  return { bytes: out, meta }
}

// ===== 压缩(无损 / 栅格化)=====

/** 压缩模式:
 *  - lossless  无损重打包(保留文字流,适合文字型 PDF,通常减小 5-20%)
 *  - quality/balanced/size/min  栅格化重打包(变成图片,文字丢失,适合扫描版/图片型)
 */
export type CompressMode = 'lossless' | 'quality' | 'balanced' | 'size' | 'min'

export const COMPRESS_MODE_INFO: Record<CompressMode, { label: string; desc: string; method: 'lossless' | 'rasterize'; scale?: number; jpegQuality?: number }> = {
  lossless: { label: '无损压缩', desc: '保留文字流,适合文字型 PDF,通常减小 5-20%', method: 'lossless' },
  quality: { label: '清晰度优先', desc: '高分辨率+高画质,体积稍减', method: 'rasterize', scale: 2.0, jpegQuality: 0.92 },
  balanced: { label: '均衡压缩', desc: '质量与体积平衡', method: 'rasterize', scale: 1.5, jpegQuality: 0.78 },
  size: { label: '缩小优先', desc: '中等画质,体积明显减小', method: 'rasterize', scale: 1.2, jpegQuality: 0.62 },
  min: { label: '压到最小', desc: '低画质,体积最小', method: 'rasterize', scale: 0.9, jpegQuality: 0.42 }
}

export interface CompressOptions {
  mode: CompressMode
  /** 进度回调 (0-1) */
  onProgress?: (p: number) => void
  /** 每页渲染后回调,用于单页级别进度 */
  onPageRendered?: (pageNo: number, totalPages: number) => void
}

/**
 * 无损压缩:用 pdf-lib 重新加载并保存,清理 metadata,启用对象流压缩
 * 保留所有文字流、图片原数据 — 适合"文字型" PDF
 * 典型效果:5-20% 体积下降,文本仍可选/搜索
 * 对"图片型" PDF(扫描版)几乎无效
 * ⚠️ 已经接近最优压缩比的小 PDF(< 200KB)几乎压不动,这是物理限制
 */
export async function losslessCompressPdf(
  file: File,
  options: CompressOptions
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer()
  // updateMetadata:false 保留原 modDate 不动(否则每次压缩都更新)
  const src = await PDFDocument.load(bytes, { updateMetadata: false })
  // 清理冗余 metadata
  src.setTitle('')
  src.setAuthor('')
  src.setSubject('')
  src.setKeywords([])
  src.setProducer('tool-box-pdf-compress')
  src.setCreator('tool-box')
  // 报告单步进度
  options.onProgress?.(0.5)
  const out = await src.save({
    useObjectStreams: true, // 关键:启用对象流,合并多个对象到一个流,通常省 5-15%
    addDefaultPage: false,
    objectsPerTick: 50,
    updateFieldAppearances: false // 没表单的 PDF 跳过这步,省一点点
  })
  options.onProgress?.(1)
  return out
}

/**
 * 智能推荐压缩模式
 * - 小文件(< 500KB)且是文字型:lossless
 * - 大文件 + 看起来是扫描版(页数 > 5 + 文件大小/页 > 200KB):balanced
 * - 其他:balanced 默认
 *
 * 启发式判断:不打开 PDF 内容,只看 size/page 比例
 */
export function recommendCompressMode(file: File, pageCount: number): CompressMode {
  if (pageCount <= 0) return 'balanced'
  const sizePerPage = file.size / pageCount
  // 极小文件:用 lossless
  if (file.size < 200 * 1024) return 'lossless'
  // 高 KB/页:可能含大图(扫描版),用栅格化
  if (sizePerPage > 200 * 1024 && pageCount > 5) return 'balanced'
  // 中等:用 lossless
  if (sizePerPage < 50 * 1024) return 'lossless'
  // 默认:均衡栅格化
  return 'balanced'
}

/**
 * 通用 PDF 压缩入口:根据 mode 选无损或栅格化
 */
export async function compressPdf(
  file: File,
  options: CompressOptions
): Promise<Uint8Array> {
  const cfg = COMPRESS_MODE_INFO[options.mode]
  if (cfg.method === 'lossless') {
    return losslessCompressPdf(file, options)
  }
  return compressPdfByRasterize(file, options)
}

/**
 * 把 PDF 栅格化重打包成新 PDF,从而实现真压缩
 *
 * 流程:pdfjs 渲染每页到 canvas → toBlob('image/jpeg', q) → pdf-lib 嵌入 JPEG 成新 PDF
 *
 * ⚠️ 副作用:
 *   1. 文字丢失,变成纯图片 PDF(不可选/搜索/复制)
 *   2. 仅适合"扫描版"或"图片型"PDF;文字型 PDF 用此压缩后体验变差
 *   3. 大文件(几百 MB)处理较慢且吃内存
 */
export async function compressPdfByRasterize(
  file: File,
  options: CompressOptions
): Promise<Uint8Array> {
  const cfg = COMPRESS_MODE_INFO[options.mode]
  if (cfg.method !== 'rasterize' || cfg.scale == null || cfg.jpegQuality == null) {
    throw new Error(`compressPdfByRasterize 不支持模式 ${options.mode}`)
  }
  const scale = cfg.scale
  const jpegQuality = cfg.jpegQuality
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise
  const total = pdf.numPages

  const out = await PDFDocument.create()
  // 设个标记,识别是 tool-box 压缩产物
  out.setProducer('tool-box-pdf-compress')
  out.setCreator('tool-box')

  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise

    const jpegBlob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 返回 null'))),
        'image/jpeg',
        jpegQuality
      )
    })
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
    const jpegImage = await out.embedJpg(jpegBytes)
    const newPage = out.addPage([vp.width, vp.height])
    newPage.drawImage(jpegImage, { x: 0, y: 0, width: vp.width, height: vp.height })
    page.cleanup()
    options.onPageRendered?.(p, total)
    options.onProgress?.(p / total)
  }

  try { (pdf as unknown as { destroy: () => void }).destroy() } catch { /* noop */ }
  return out.save()
}

// ===== 转图片 =====

export type PdfImageExportOptions = {
  /** 缩放倍率,默认 2（高分辨率） */
  scale?: number
  /** 输出格式 */
  format?: 'png' | 'jpeg' | 'webp'
  /** JPEG/WebP 质量 0-1 */
  quality?: number
  /** 渲染页范围（1-based，包含两端）。默认全部 */
  pageRange?: [number, number]
}

/** 把 PDF 的指定页（或全部）渲染为图片 Blob */
export async function pdfToImages(
  file: File,
  opts: PdfImageExportOptions = {}
): Promise<{ blobs: Blob[]; pageNumbers: number[] }> {
  const { scale = 2, format = 'png', quality = 0.92, pageRange } = opts
  const { doc } = await loadPdfFromFile(file)
  const from = pageRange?.[0] ?? 1
  const to = pageRange?.[1] ?? doc.numPages
  const blobs: Blob[] = []
  const pageNumbers: number[] = []
  for (let p = from; p <= to; p++) {
    if (p < 1 || p > doc.numPages) continue
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp'
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 返回空'))),
        mime,
        format === 'png' ? undefined : quality
      )
    )
    blobs.push(blob)
    pageNumbers.push(p)
    page.cleanup()
  }
  // destroy 在类型上没暴露,运行时存在
  ;(doc as unknown as { destroy: () => void }).destroy()
  return { blobs, pageNumbers }
}

// ===== 字节工具 =====

/** Uint8Array → Blob */
export function bytesToBlob(bytes: Uint8Array, mime = 'application/pdf'): Blob {
  // 用 Uint8Array 包装 ArrayBuffer 创建 Blob,避免类型问题
  return new Blob([bytes], { type: mime })
}

// ===== 水印 =====

export type WatermarkFont = 'Helvetica' | 'HelveticaBold' | 'TimesRoman' | 'TimesRomanBold' | 'Courier' | 'CourierBold'
export type WatermarkPosition = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right' | 'tile'

export type WatermarkOptions = {
  text: string
  fontSize?: number
  /** RGB 0-255 */
  color?: { r: number; g: number; b: number }
  opacity?: number
  /** 旋转角度(度),仅在 position !== 'tile' 时生效;tile 模式固定用此值 */
  rotate?: number
  position?: WatermarkPosition
  font?: WatermarkFont
  /** 1-based 页码;不传=全部页 */
  pages?: number[]
}

/**
 * 在 PDF 上添加文字水印。
 * 注意:浏览器内 PDF 库只内置 StandardFonts(Helvetica/Times/Courier 等拉丁字体),
 * 中文/韩文/日文等 CJK 字符会渲染为方块或乱码。
 */
export async function addPdfWatermark(file: File, options: WatermarkOptions): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer()
  const pdf = await PDFDocument.load(bytes)

  const fontMap: Record<WatermarkFont, StandardFonts> = {
    Helvetica: StandardFonts.Helvetica,
    HelveticaBold: StandardFonts.HelveticaBold,
    TimesRoman: StandardFonts.TimesRoman,
    TimesRomanBold: StandardFonts.TimesRomanBold,
    Courier: StandardFonts.Courier,
    CourierBold: StandardFonts.CourierBold
  }
  const font = await pdf.embedFont(fontMap[options.font || 'HelveticaBold'])
  const size = options.fontSize || 50
  const c = options.color || { r: 220, g: 38, b: 38 }
  const opacity = options.opacity ?? 0.4
  const rotationDeg = options.rotate ?? -30
  const position = options.position || 'tile'
  const pdfColor = rgb(c.r / 255, c.g / 255, c.b / 255)

  const totalPages = pdf.getPageCount()
  const targetPages = options.pages && options.pages.length
    ? options.pages.filter((p) => p >= 1 && p <= totalPages)
    : Array.from({ length: totalPages }, (_, i) => i + 1)

  const textWidth = font.widthOfTextAtSize(options.text, size)

  for (const pageNo of targetPages) {
    const page = pdf.getPage(pageNo - 1)
    const { width, height } = page.getSize()

    if (position === 'tile') {
      // 平铺: 网格覆盖整页
      const stepX = textWidth + size * 1.5
      const stepY = size * 2
      const rot = degrees(rotationDeg)
      // 用对角线范围循环,确保旋转后也能盖住整页
      const diag = Math.sqrt(width * width + height * height)
      for (let y = -diag; y < height + diag; y += stepY) {
        for (let x = -diag; x < width + diag; x += stepX) {
          page.drawText(options.text, {
            x,
            y,
            size,
            font,
            color: pdfColor,
            opacity,
            rotate: rot
          })
        }
      }
    } else {
      // 6 种单点位置
      const margin = size * 0.6
      let x = margin
      let y = margin
      switch (position) {
        case 'top-left':
          x = margin
          y = height - size - margin
          break
        case 'top-right':
          x = width - textWidth - margin
          y = height - size - margin
          break
        case 'center':
          x = (width - textWidth) / 2
          y = (height - size) / 2
          break
        case 'bottom-left':
          x = margin
          y = margin
          break
        case 'bottom-right':
          x = width - textWidth - margin
          y = margin
          break
      }
      page.drawText(options.text, {
        x,
        y,
        size,
        font,
        color: pdfColor,
        opacity,
        rotate: degrees(rotationDeg)
      })
    }
  }

  return pdf.save()
}
