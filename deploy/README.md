# 部署指南

## 项目架构

```
浏览器 ──HTTP──▶ nginx (静态托管 + 反代)
                  ├─ /         → dist/  (前端 SPA)
                  ├─ /models/  → dist/models/  (AI 模型, 1 年缓存)
                  ├─ /tesseract/ → dist/tesseract/  (OCR 资源, 1 年缓存)
                  └─ /api/remove-bg → 127.0.0.1:8000  (Python 抠图服务, 仅本机)
```

## 资源文件说明

| 资源 | 用途 | 大小 | 下载脚本 |
| --- | --- | --- | --- |
| `public/models/` | rembg 抠图模型 | ~56 MB | (部署到 nginx 时由 `server/install.sh` 自动下载) |
| `public/tesseract/` | tesseract.js OCR worker + WASM + 语言包 | ~11 MB | `node scripts/download-tesseract-assets.mjs` |

两个资源都已在 `.gitignore`，不会进入 git 仓库。
脚本都是幂等的，已存在的文件会自动跳过。

### tesseract 资源说明

证件照工具用 `tesseract.js@7` 跑 OCR 去水印，需要：

- `worker.min.js`（109 KB）— Web Worker 入口
- `core/tesseract-core-simd-lstm.wasm.js` + `.wasm`（6.6 MB）— Tesseract C++ 核心
- `lang-data/chi_sim.traineddata.gz`（1.6 MB）— 中文简体
- `lang-data/eng.traineddata.gz`（2.8 MB）— 英文

默认从 jsDelivr CDN 拉（被墙的话自己改 `scripts/download-tesseract-assets.mjs` 里的 `LANG_BASE`）。

## 部署流程

### 1. 构建前端

```bash
pnpm install
pnpm run build
```

构建产物在 `dist/`，可直接静态托管。

### 2. 上传到服务器

```bash
rsync -avz --delete dist/ user@your-server:/var/www/tool-box/
```

把 `your-server` 和 `/var/www/tool-box/` 替换成你自己的环境。

### 3. nginx 配置

参考 `nginx-models-cache.conf`，核心规则：

- 静态资源长缓存（`/models/` `/tesseract/` `*.js` `*.css` `*.woff2`）
- `/api/remove-bg` 反代到 `127.0.0.1:8000`
- SPA fallback：`try_files $uri $uri/ /index.html`

### 4. （可选）部署 AI 抠图后端

证件照功能需要后端跑 ONNX 推理。轻量方案见 `server/install.sh`：

```bash
# 在服务器上
git clone <repo-url>
cd tool-box/server
sudo bash install.sh
```

服务会：

- 装 Python venv + onnxruntime + Pillow + pillow-heif
- 写 systemd unit，开机自启
- 内存限制 1G，CPU 限 100%（一个核）

## 性能与缓存

- **首次访问**：从服务器下载 56MB rembg 模型 + 11MB tesseract 资源（10-30 秒）
- **第二次起**：浏览器 HTTP 缓存命中，0 等待（除非用户清缓存）
- **同 session 内多次生成**：库内部单例，模型驻留内存，秒处理

## 切换 rembg 模型

如果想换更准的模型（`isnet_fp16` 84MB / `isnet` 168MB），编辑 `server/install.sh` 里的下载 URL，重新跑 `bash install.sh` 即可。
