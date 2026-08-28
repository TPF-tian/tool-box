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

  // 留 8% 顶部边距, 让人物头靠上
  const topMargin = 0.08
  const maxH = targetH * (1 - topMargin - 0.04) // 顶部 8% + 底部 4% 留白
  const maxW = targetW * 0.96

  // 缩放: 同时受宽高约束
  const scale = Math.min(maxH / bounds.h, maxW / bounds.w)
  const drawW = bounds.w * scale
  const drawH = bounds.h * scale
  const offsetX = (targetW - drawW) / 2
  const offsetY = topMargin * targetH

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
