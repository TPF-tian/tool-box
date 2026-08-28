# ToolBox · 在线小工具集合

纯前端的浏览器内工具集：图像处理、JSON 工具、IP 解析。所有计算在本地完成，文件不上传服务器。

## ✨ 包含工具

### 图像工具（`/image`）

| 工具 | 路径 | 说明 |
| --- | --- | --- |
| 图片压缩 | `/image/compress` | 调节质量与最大宽度，减小体积 |
| 尺寸修改 | `/image/resize` | 精确宽高 / 按比例缩放，支持纵横比锁定 |
| 添加水印 | `/image/watermark` | 文字水印，6 种位置 + 平铺 + 旋转 |
| 九宫格切图 | `/image/grid` | 3×3 等分，原图预览 + 单张下载 + 打包 ZIP |
| Base64 转换 | `/image/base64` | 图片 ↔ Base64 字符串互转 |
| GIF 拆帧 | `/image/gif` | 拆出每帧为独立 PNG，ZIP 打包 |
| 证件照生成 | `/image/idphoto` | AI 自动抠图 + 11 种标准尺寸 + 自定义 |
| 图片转 GIF/视频 | `/image/to-gif` | 多图合成动画，GIF 或 WebM 视频输出 |

### JSON 工具（`/json`）

- 格式化 / 压缩（缩进 2 / 4 / Tab）
- 字段级差异对比（git 风格双侧行号）
- 树形视图可编辑删除

### IP 解析（`/ip`）

- 查询 IP 地理位置、ASN、运营商（ip-api.com）
- 支持本机 IP 自动识别

## 🛠 技术栈

- **框架**：Vue 3.5 + TypeScript
- **路由**：Vue Router 4
- **构建**：Vite 6
- **样式**：Tailwind CSS 3 + 自定义 CSS 变量
- **核心库**：
  - `diff` — JSON 行级 diff
  - `gifuct-js` — GIF 拆帧
  - `jszip` — 打包下载
  - `@imgly/background-removal` — 证件照 AI 抠图（ONNX Runtime，模型约 40MB，首次使用浏览器缓存）

## 📁 目录结构

```
src/
├── App.vue                  # 根组件 + 路由出口
├── main.ts                  # 入口，挂载路由 + 主题初始化
├── style.css                # 全局样式 + Tailwind 指令
├── components/              # 通用组件
│   ├── Layout.vue           # 顶栏 + 暗色切换
│   ├── ToolCard.vue         # 工具卡片（首页/导航页用）
│   ├── JsonNode.vue         # 树形视图节点（递归）
│   └── JsonTreeView.vue     # 树形视图外壳
├── composables/             # 组合式函数
│   └── useImageFile.ts      # 图片上传/预览/清理
├── router/
│   └── index.ts             # 路由表
├── types/
│   └── gif.js.d.ts          # gif.js 第三方模块类型声明
├── utils/                   # 纯函数工具
│   ├── imageTools.ts        # 压缩/缩放/水印/切图/Base64
│   ├── gifFrames.ts         # GIF 拆帧
│   ├── idPhoto.ts           # 证件照预设 + 合成
│   ├── jsonDiff.ts          # JSON 格式化 + diff
│   └── jsonValue.ts         # JsonValue 递归类型
└── views/
    ├── Home.vue             # 首页
    ├── ImageHome.vue        # 图像工具导航
    ├── JsonFormatter.vue    # JSON 工具
    ├── IpLookup.vue         # IP 解析
    └── image/
        ├── Compress.vue
        ├── Resize.vue
        ├── Watermark.vue
        ├── Grid.vue
        ├── Base64.vue
        ├── Gif.vue
        ├── IdPhoto.vue
        └── ToGif.vue
```

## 🚀 本地开发

环境要求：**Node.js ≥ 20**，**pnpm ≥ 9**（npm/yarn 也可，但锁文件是 pnpm 格式）

```bash
# 1. 克隆
git clone https://gitee.com/tpfav/tool-box.git
cd tool-box

# 2. 安装依赖
pnpm install

# 3. 启动 dev server
pnpm dev
# → http://localhost:5173

# 4. 类型检查
pnpm exec vue-tsc --noEmit

# 5. 生产构建
pnpm build

# 6. 预览构建产物
pnpm preview
```

## 🧩 添加新工具

1. 在 `src/utils/` 加业务逻辑（纯函数最好，方便测试）
2. 在 `src/views/` 或 `src/views/image/` 加 Vue 页面
3. 在 `src/router/index.ts` 加路由
4. 在对应的导航页（`Home.vue` / `ImageHome.vue`）加 `ToolCard`

参考 `Compress.vue` / `imageTools.ts` 的结构。

## 📝 设计取舍

- **不引入 UI 组件库**（Element Plus / Naive UI 等）：单文件组件 + Tailwind 已够，避免依赖膨胀
- **AI 模型本地化**：证件照用 `@imgly/background-removal` ONNX 推理，模型浏览器缓存（首次约 40MB）
- **图像处理全 Canvas API**：不依赖第三方图像库，控制权在自己手里
- **WebM 视频而非 MP4**：`MediaRecorder` 浏览器原生输出 WebM（VP8/VP9），要 MP4 需要 ffmpeg.wasm（约 30MB）做转码

## 📄 License

MIT
