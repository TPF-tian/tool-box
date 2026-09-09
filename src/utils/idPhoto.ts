import { createWorker, type Worker as TesseractWorker } from 'tesseract.js'

export type IdPhotoPreset = {
  id: string
  name: string
  group: '中国' | '国际'
  widthMm: number
  heightMm: number
  widthPx: number
  heightPx: number
  description?: string
}

export const ID_PHOTO_PRESETS: IdPhotoPreset[] = [
  // 中国标准
  { id: 'cn-1inch', name: '一寸', group: '中国', widthMm: 25, heightMm: 35, widthPx: 295, heightPx: 413, description: '最常用' },
  { id: 'cn-1inch-small', name: '小一寸', group: '中国', widthMm: 22, heightMm: 32, widthPx: 260, heightPx: 378 },
  { id: 'cn-1inch-large', name: '大一寸', group: '中国', widthMm: 33, heightMm: 48, widthPx: 390, heightPx: 567 },
  { id: 'cn-2inch', name: '二寸', group: '中国', widthMm: 35, heightMm: 49, widthPx: 413, heightPx: 579 },
  { id: 'cn-passport', name: '护照', group: '中国', widthMm: 33, heightMm: 48, widthPx: 390, heightPx: 567 },
  { id: 'cn-idcard', name: '身份证', group: '中国', widthMm: 26, heightMm: 32, widthPx: 358, heightPx: 441 },
  { id: 'cn-driver', name: '驾照', group: '中国', widthMm: 22, heightMm: 32, widthPx: 260, heightPx: 378 },
  { id: 'cn-hkmacao', name: '港澳通行证', group: '中国', widthMm: 33, heightMm: 48, widthPx: 390, heightPx: 567 },
  // 国际标准
  { id: 'intl-schengen', name: '申根签证 (35×45mm)', group: '国际', widthMm: 35, heightMm: 45, widthPx: 413, heightPx: 531 },
  { id: 'intl-us-visa', name: '美国签证 (2×2in)', group: '国际', widthMm: 51, heightMm: 51, widthPx: 600, heightPx: 600 },
  { id: 'intl-jp-visa', name: '日本签证 (35×45mm)', group: '国际', widthMm: 35, heightMm: 45, widthPx: 413, heightPx: 531 }
]

export const ID_PHOTO_BG_COLORS: { id: string; name: string; hex: string }[] = [
  { id: 'white', name: '白色', hex: '#ffffff' },
  { id: 'blue', name: '蓝色', hex: '#438edb' },
  { id: 'red', name: '红色', hex: '#cc0000' }
]

/**
 * 找非透明像素的 bounding box
 * 返回 {x, y, w, h} (1-indexed inclusive)
 */
function findNonTransparentBounds(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const data = ctx.getImageData(0, 0, w, h).data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3]
      if (a > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * 把去背景后的人物图合成到指定尺寸的证件照底板上
 */
export async function composeIdPhoto(
  personCanvas: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  bgColor: string
): Promise<HTMLCanvasElement> {
  const bounds = findNonTransparentBounds(personCanvas)
  if (!bounds) throw new Error('未检测到人物')

  // 整体人像占画布宽度 96%, 高度最多 96% (留 2% 底边距)
  const maxW = targetW * 0.96
  const maxH = targetH * 0.96
  const bottomMargin = 0.02

  // 缩放: 同时受宽高约束
  const scale = Math.min(maxH / bounds.h, maxW / bounds.w)
  const drawW = bounds.w * scale
  const drawH = bounds.h * scale
  const offsetX = (targetW - drawW) / 2

  // 整体人像底部贴近画布底部 (留 2% 底边距)
  // 横构图时 drawH 较小, 整体贴底后头部自然在画面中上, 不会再留大片白
  const offsetY = Math.max(0, targetH - drawH - bottomMargin * targetH)

  const result = document.createElement('canvas')
  result.width = targetW
  result.height = targetH
  const rctx = result.getContext('2d')!
  rctx.fillStyle = bgColor
  rctx.fillRect(0, 0, targetW, targetH)
  rctx.imageSmoothingEnabled = true
  rctx.imageSmoothingQuality = 'high'
  rctx.drawImage(
    personCanvas,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    offsetX,
    offsetY,
    drawW,
    drawH
  )
  return result
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob 返回空'))
      },
      'image/jpeg',
      quality
    )
  })
}

// ---------- OCR 水印去除 ----------

// 共享 worker (首次加载 ~10MB 总资源, 浏览器缓存后秒开)
let _ocrWorker: TesseractWorker | null = null
let _ocrInitPromise: Promise<TesseractWorker> | null = null

async function getOcrWorker(
  onProgress?: (pct: number, status: string) => void
): Promise<TesseractWorker> {
  if (_ocrWorker) return _ocrWorker
  if (_ocrInitPromise) return _ocrInitPromise

  _ocrInitPromise = (async () => {
    // 走自己服务器资源, 不走 jsDelivr (国内访问 jsDelivr 慢)
    // 资源由 scripts/download-tesseract-assets.mjs 放到 public/tesseract/
    const worker = await createWorker(['chi_sim', 'eng'], 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core/tesseract-core-simd-lstm.wasm.js',
      langPath: '/tesseract/lang-data',
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (onProgress && typeof m.progress === 'number') {
          onProgress(Math.round(m.progress * 100), m.status)
        }
      }
    })
    _ocrWorker = worker
    return worker
  })()

  return _ocrInitPromise
}

/**
 * 跑 OCR 识别 canvas 上的文字, 把识别出的文字区域涂透明
 * 用于去除照片上的水印/字样
 * 失败/超时/无文字 时返回原 canvas
 */
export async function removeTextByOcr(
  canvas: HTMLCanvasElement,
  onProgress?: (pct: number, status: string) => void
): Promise<HTMLCanvasElement> {
  type TWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
  let words: TWord[] = []
  try {
    const worker = await getOcrWorker(onProgress)
    const { data } = await worker.recognize(canvas)
    // v7 结构: data.blocks -> paragraphs -> lines -> words
    const collect = (blocks: any[] | null | undefined): TWord[] => {
      const out: TWord[] = []
      if (!blocks) return out
      for (const b of blocks) {
        for (const p of b.paragraphs || []) {
          for (const l of p.lines || []) {
            for (const w of l.words || []) {
              if (w.text && w.text.trim().length > 0 && w.bbox) {
                out.push({
                  text: w.text,
                  confidence: w.confidence,
                  bbox: w.bbox
                })
              }
            }
          }
        }
      }
      return out
    }
    words = collect(data.blocks as any)
  } catch (e) {
    console.warn('OCR 失败, 跳过水印去除:', e)
    return canvas
  }

  if (words.length === 0) return canvas

  // 过滤: 置信度太低的不涂 (避免误伤)
  const valid = words.filter((w) => w.confidence >= 50)
  if (valid.length === 0) return canvas

  // 复制 canvas, 涂掉文字区域
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)

  for (const w of valid) {
    const { x0, y0, x1, y1 } = w.bbox
    const w0 = Math.max(0, x0)
    const y0c = Math.max(0, y0)
    const w1 = Math.min(canvas.width, x1)
    const h1 = Math.min(canvas.height, y1)
    if (w1 > w0 && h1 > y0c) {
      // 略扩展一点, 确保文字边缘也涂掉
      const pad = 2
      ctx.clearRect(
        Math.max(0, w0 - pad),
        Math.max(0, y0c - pad),
        w1 - w0 + pad * 2,
        h1 - y0c + pad * 2
      )
    }
  }

  return out
}
