import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/Home.vue'),
      meta: { title: 'Kevin 工具箱' }
    },
    {
      path: '/image',
      name: 'image-home',
      component: () => import('@/views/ImageHome.vue'),
      meta: { title: '图像工具 · Kevin 工具箱' }
    },
    {
      path: '/image/compress',
      name: 'image-compress',
      component: () => import('@/views/image/Compress.vue'),
      meta: { title: '图片压缩 · Kevin 工具箱' }
    },
    {
      path: '/image/resize',
      name: 'image-resize',
      component: () => import('@/views/image/Resize.vue'),
      meta: { title: '尺寸修改 · Kevin 工具箱' }
    },
    {
      path: '/image/watermark',
      name: 'image-watermark',
      component: () => import('@/views/image/Watermark.vue'),
      meta: { title: '添加水印 · Kevin 工具箱' }
    },
    {
      path: '/image/grid',
      name: 'image-grid',
      component: () => import('@/views/image/Grid.vue'),
      meta: { title: '九宫格切图 · Kevin 工具箱' }
    },
    {
      path: '/image/base64',
      name: 'image-base64',
      component: () => import('@/views/image/Base64.vue'),
      meta: { title: 'Base64 转换 · Kevin 工具箱' }
    },
    {
      path: '/image/gif',
      name: 'image-gif',
      component: () => import('@/views/image/Gif.vue'),
      meta: { title: 'GIF 拆帧 · Kevin 工具箱' }
    },
    {
      path: '/image/idphoto',
      name: 'image-idphoto',
      component: () => import('@/views/image/IdPhoto.vue'),
      meta: { title: '证件照生成 · Kevin 工具箱' }
    },
    {
      path: '/image/to-gif',
      name: 'image-to-gif',
      component: () => import('@/views/image/ToGif.vue'),
      meta: { title: '图片转 GIF · Kevin 工具箱' }
    },
    {
      path: '/image/to-video',
      name: 'image-to-video',
      component: () => import('@/views/image/ToVideo.vue'),
      meta: { title: '图片 / GIF 转视频 · Kevin 工具箱' }
    },
    {
      path: '/json',
      name: 'json',
      component: () => import('@/views/JsonFormatter.vue'),
      meta: { title: 'JSON 工具 · Kevin 工具箱' }
    },
    {
      path: '/ip',
      name: 'ip',
      component: () => import('@/views/IpLookup.vue'),
      meta: { title: 'IP 解析 · Kevin 工具箱' }
    },
    {
      path: '/doc',
      name: 'doc-home',
      component: () => import('@/views/DocHome.vue'),
      meta: { title: '文档工具 · Kevin 工具箱' }
    },
    {
      path: '/doc/markdown',
      name: 'doc-markdown',
      component: () => import('@/views/doc/MarkdownEditor.vue'),
      meta: { title: 'Markdown 编辑器 · Kevin 工具箱' }
    },
    {
      path: '/doc/text',
      name: 'doc-text',
      component: () => import('@/views/doc/TextTools.vue'),
      meta: { title: '文本处理 · Kevin 工具箱' }
    },
    {
      path: '/doc/pdf',
      name: 'doc-pdf',
      component: () => import('@/views/doc/PdfTools.vue'),
      meta: { title: 'PDF 工具 · Kevin 工具箱' }
    },
    {
      path: '/doc/word',
      name: 'doc-word',
      component: () => import('@/views/doc/WordTools.vue'),
      meta: { title: 'Word 文档 · Kevin 工具箱' }
    }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

router.afterEach((to) => {
  if (to.meta.title) {
    document.title = String(to.meta.title)
  }
})

export { router }
