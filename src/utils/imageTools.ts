export type ImageInfo = {
  size: number
  width: number
  height: number
  mime: string
}

export type ProcessOptions = {
  quality?: number
  maxWidth?: number
  type?: string
}

export type WatermarkOptions = {
  text: string
  fontSize?: number
  color?: string
  /** 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'tile' */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'tile'
  opacity?: number
  /** 旋转角度 (仅 tile 模式生效) */
  rotate?: number
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob 返回空'))
      },
      type,
      quality
    )
  })
}

function computeTargetSize(srcW: number, srcH: number, maxW?: number): { w: number; h: number } {
  if (!maxW || srcW <= maxW) return { w: srcW, h: srcH }
  const ratio = maxW / srcW
  return { w: maxW, h: Math.round(srcH * ratio) }
}

export async function getImageInfo(blob: Blob): Promise<ImageInfo> {
  const img = await loadImage(blob)
  return {
    size: blob.size,
    width: img.naturalWidth,
    height: img.naturalHeight,
    mime: blob.type || 'image/png'
  }
}

export async function compressImage(blob: Blob, opts: ProcessOptions = {}): Promise<Blob> {
  const img = await loadImage(blob)
  const { w, h } = computeTargetSize(img.naturalWidth, img.naturalHeight, opts.maxWidth)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  // PNG 是无损,无法用 quality 压缩;保留 PNG 走 toBlob 默认路径
  const outType = blob.type === 'image/png' ? 'image/png' : opts.type || blob.type || 'image/jpeg'
  return canvasToBlob(canvas, outType, opts.quality ?? 0.8)
}

export async function resizeImage(blob: Blob, opts: ProcessOptions & { height?: number }): Promise<Blob> {
  const img = await loadImage(blob)
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (opts.maxWidth) w = opts.maxWidth
  if (opts.height) h = opts.height
  if (!opts.maxWidth && !opts.height) {
    // 默认不变
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return canvasToBlob(canvas, opts.type || blob.type || 'image/png', opts.quality ?? 0.92)
}

export async function convertImage(blob: Blob, opts: ProcessOptions): Promise<Blob> {
  const img = await loadImage(blob)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  // 转为 JPEG 时填白底,避免透明区域变黑
  if (opts.type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0)
  return canvasToBlob(canvas, opts.type || 'image/png', opts.quality ?? 0.92)
}

// ===== 水印 =====

export async function addTextWatermark(blob: Blob, options: WatermarkOptions): Promise<Blob> {
  const img = await loadImage(blob)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const fontSize = options.fontSize ?? Math.max(16, Math.floor(img.naturalWidth / 30))
  const text = options.text || 'Watermark'
  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.fillStyle = options.color ?? 'rgba(255, 255, 255, 0.85)'
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.lineWidth = Math.max(1, Math.floor(fontSize / 14))
  ctx.textBaseline = 'alphabetic'
  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = options.opacity ?? 0.9

  const padding = fontSize
  const metrics = ctx.measureText(text)
  const textW = metrics.width
  const textH = fontSize

  function drawText(x: number, y: number) {
    if (ctx.lineWidth > 0) ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
  }

  const pos = options.position ?? 'bottom-right'
  if (pos === 'tile') {
    const stepX = textW + padding * 2
    const stepY = textH + padding * 1.5
    const rot = ((options.rotate ?? -30) * Math.PI) / 180
    ctx.save()
    for (let y = -img.naturalHeight; y < img.naturalHeight * 2; y += stepY) {
      for (let x = -img.naturalWidth; x < img.naturalWidth * 2; x += stepX) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        drawText(0, 0)
        ctx.restore()
      }
    }
    ctx.restore()
  } else {
    let x = padding
    let y = padding + textH
    if (pos === 'top-right') x = img.naturalWidth - textW - padding
    else if (pos === 'bottom-left') y = img.naturalHeight - padding
    else if (pos === 'bottom-right') {
      x = img.naturalWidth - textW - padding
      y = img.naturalHeight - padding
    } else if (pos === 'center') {
      x = (img.naturalWidth - textW) / 2
      y = (img.naturalHeight + textH) / 2
    }
    drawText(x, y)
  }
  ctx.globalAlpha = prevAlpha
  return canvasToBlob(canvas, blob.type || 'image/png', 0.92)
}

// ===== 九宫格切图 =====

export async function splitNineGrid(blob: Blob): Promise<{ blobs: Blob[]; cellWidth: number; cellHeight: number }> {
  const img = await loadImage(blob)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const cellW = Math.floor(w / 3)
  const cellH = Math.floor(h / 3)
  const blobs: Blob[] = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const canvas = document.createElement('canvas')
      canvas.width = cellW
      canvas.height = cellH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH)
      blobs.push(await canvasToBlob(canvas, blob.type || 'image/png', 0.92))
    }
  }
  return { blobs, cellWidth: cellW, cellHeight: cellH }
}

// ===== Base64 转换 =====

export function imageToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(blob)
  })
}

export function base64ToBlob(base64: string): Blob {
  const m = base64.match(/^data:([^;,]+);base64,(.*)$/s)
  let mime = 'application/octet-stream'
  let data = base64.trim()
  if (m) {
    mime = m[1]
    data = m[2]
  }
  // 去掉可能存在的换行/空白
  data = data.replace(/\s/g, '')
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
