declare module 'gif.js' {
  interface GIFOptions {
    workers?: number
    quality?: number
    width?: number
    height?: number
    workerScript?: string
    repeat?: number
    background?: string
    transparency?: number | null
    dither?: boolean | string
    debug?: boolean
  }

  interface AddFrameOptions {
    copy?: boolean
    delay?: number
    dispose?: number
  }

  class GIF {
    constructor(options?: GIFOptions)
    addFrame(image: HTMLImageElement | HTMLCanvasElement | CanvasRenderingContext2D, options?: AddFrameOptions): void
    on(event: 'start' | 'abort' | 'finished' | 'progress', callback: (...args: any[]) => void): void
    render(): void
    abort(): void
  }

  export default GIF
}
