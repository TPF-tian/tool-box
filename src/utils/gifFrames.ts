import { parseGIF, decompressFrames } from 'gifuct-js'

export type ExtractedGifFrame = {
  bitmap: ImageBitmap
  delay: number
  index: number
}

export type GifInfo = {
  width: number
  height: number
  frameCount: number
  totalDurationMs: number
}

export async function readGifInfo(blob: Blob): Promise<GifInfo> {
  const ab = await blob.arrayBuffer()
  const gif = parseGIF(ab)
  const rawFrames = decompressFrames(gif, true)
  const totalMs = rawFrames.reduce((sum, f) => sum + (f.delay || 10) * 10, 0)
  return {
    width: gif.lsd.width,
    height: gif.lsd.height,
    frameCount: rawFrames.length,
    totalDurationMs: totalMs
  }
}

/**
 * 把 GIF 拆成一组独立帧 PNG。
 * 用 canvas 顺序合成,按 disposalType 处理每帧之间的清理。
 */
export async function extractGifFrames(blob: Blob): Promise<{
  frames: ExtractedGifFrame[]
  width: number
  height: number
}> {
  const ab = await blob.arrayBuffer()
  const gif = parseGIF(ab)
  const rawFrames = decompressFrames(gif, true)

  const canvas = document.createElement('canvas')
  canvas.width = gif.lsd.width
  canvas.height = gif.lsd.height
  const ctx = canvas.getContext('2d')!

  const frames: ExtractedGifFrame[] = []

  for (let i = 0; i < rawFrames.length; i++) {
    const frame = rawFrames[i]
    // 备份当前 canvas 状态 (用于 disposalType === 3 "restore to previous")
    const preState = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // 把当前帧的 patch 贴到 canvas
    const patch = new ImageData(
      new Uint8ClampedArray(frame.patch),
      frame.dims.width,
      frame.dims.height
    )
    ctx.putImageData(patch, frame.dims.left, frame.dims.top)

    // 捕获为独立图片
    const bitmap = await createImageBitmap(canvas)
    frames.push({
      bitmap,
      delay: (frame.delay || 10) * 10, // gifuct-js 返回 1/100s,转毫秒
      index: i
    })

    // 应用 disposal (给下一帧用)
    if (frame.disposalType === 2) {
      // 还原成背景色 (canvas 是透明的,所以直接 clear)
      ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height)
    } else if (frame.disposalType === 3) {
      // 还原到本帧绘制前的状态
      ctx.putImageData(preState, 0, 0)
    }
    // disposalType 0/1: 保持不变 (无需操作)
  }

  return { frames, width: gif.lsd.width, height: gif.lsd.height }
}

export async function bitmapToBlob(
  bitmap: ImageBitmap,
  type = 'image/png',
  quality?: number
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
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
