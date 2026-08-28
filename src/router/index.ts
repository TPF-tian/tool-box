import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/Home.vue'),
      meta: { title: 'ToolBox · 在线小工具集合' }
    },
    {
      path: '/image',
      name: 'image-home',
      component: () => import('@/views/ImageHome.vue'),
      meta: { title: '图像工具 · ToolBox' }
    },
    {
      path: '/image/compress',
      name: 'image-compress',
      component: () => import('@/views/image/Compress.vue'),
      meta: { title: '图片压缩 · ToolBox' }
    },
    {
      path: '/image/resize',
      name: 'image-resize',
      component: () => import('@/views/image/Resize.vue'),
      meta: { title: '尺寸修改 · ToolBox' }
    },
    {
      path: '/image/watermark',
      name: 'image-watermark',
      component: () => import('@/views/image/Watermark.vue'),
      meta: { title: '添加水印 · ToolBox' }
    },
    {
      path: '/image/grid',
      name: 'image-grid',
      component: () => import('@/views/image/Grid.vue'),
      meta: { title: '九宫格切图 · ToolBox' }
    },
    {
      path: '/image/base64',
      name: 'image-base64',
      component: () => import('@/views/image/Base64.vue'),
      meta: { title: 'Base64 转换 · ToolBox' }
    },
    {
      path: '/image/gif',
      name: 'image-gif',
      component: () => import('@/views/image/Gif.vue'),
      meta: { title: 'GIF 拆帧 · ToolBox' }
    },
    {
      path: '/image/idphoto',
      name: 'image-idphoto',
      component: () => import('@/views/image/IdPhoto.vue'),
      meta: { title: '证件照生成 · ToolBox' }
    },
    {
      path: '/image/to-gif',
      name: 'image-to-gif',
      component: () => import('@/views/image/ToGif.vue'),
      meta: { title: '图片转 GIF / 视频 · ToolBox' }
    },
    {
      path: '/json',
      name: 'json',
      component: () => import('@/views/JsonFormatter.vue'),
      meta: { title: 'JSON 工具 · ToolBox' }
    },
    {
      path: '/ip',
      name: 'ip',
      component: () => import('@/views/IpLookup.vue'),
      meta: { title: 'IP 解析 · ToolBox' }
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
