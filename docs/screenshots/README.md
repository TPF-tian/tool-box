# 截图拍摄指南

README 里的截图都在这里维护。按文件名归类，存到对应子目录即可。

## 拍摄规范

| 项 | 建议 |
| --- | --- |
| 浏览器宽度 | **1440px**（桌面主流） |
| 视口高度 | 900px，需要滚动到关键内容 |
| 缩放 | 100%（系统 DPI 不要 125%/150%） |
| 格式 | **PNG**（无损）；动效用 **GIF** 或 **WebP** |
| 单图大小 | 控制在 **< 500KB**（用 [TinyPNG](https://tinypng.com/) 或 `pngquant` 压缩） |
| 主题 | 默认浅色；暗色单独拍一张 `*-dark.png` |
| 隐私 | 截图中不要出现真实人脸 / 真实 IP / 真实邮箱（demo 数据即可） |

## 拍摄工具

- **macOS**：`Cmd + Shift + 4`（选区截图）或 `Cmd + Shift + 5`（带录制）
- **跨平台**：[Cleanshot X](https://cleanshot.com/) / [Shottr](https://shottr.cc/)（免费）
- **浏览器扩展**：[GoFullPage](https://gofullpage.com/)（整页截图）/[Screenity](https://screenity.io/)（录屏）

## 文件清单

### 🎯 必拍（4 张）— ✅ 已完成 3 张

| 文件 | 路径 | 状态 |
| --- | --- | --- |
| 首页 | `home.png` | ✅ |
| 证件照生成（设置页） | `image/idphoto-settings.png` | ✅ |
| 证件照生成（结果页） | `image/idphoto-result.png` | ✅ |
| JSON diff（输入） | `json/diff-input.png` | ✅ |
| JSON diff（结果） | `json/diff-result.png` | ✅ |
| PDF 工具 | `doc/pdf.png` | ❌ **缺失** |

### ⭐ 推荐（5 张）— ✅ 已完成 2 张

| 文件 | 路径 | 状态 |
| --- | --- | --- |
| 图片转 GIF（配置） | `image/to-gif.png` | ✅ |
| 图片转 GIF（结果） | `image/to-gif-result.png` | ✅ |
| 图片压缩 | `image/compress.png` | ❌ |
| Markdown 编辑器 | `doc/markdown.png` | ❌ |
| JSON 格式化 | `json/formatter.png` | ❌ |
| IP 解析 | `ip/lookup.png` | ❌ |

### ✨ 加分

| 文件 | 路径 | 状态 |
| --- | --- | --- |
| 暗色首页 | `home-dark.png` | ❌ |
| 证件照流程录屏 | `image/idphoto-workflow.gif` | ❌ |
| 九宫格切图流程录屏 | `image/grid-workflow.gif` | ❌ |

## 缺失项拍摄步骤

### `doc/pdf.png`

1. 打开 `/doc/pdf`
2. 拖入任意 3-5 页 PDF
3. 等待缩略图加载完成
4. 截图包含：合并/拆分/删除按钮 + 缩略图网格

### `image/compress.png`

1. 打开 `/image/compress`
2. 上传任意照片
3. 调节质量滑块到 80
4. 截图"压缩前/压缩后"对比区 + 文件大小

### `doc/markdown.png`

1. 打开 `/doc/markdown`
2. 左侧粘贴一段带代码块的 Markdown
3. 等待预览渲染
4. 截图左右分栏

### `json/formatter.png`

1. 打开 `/json`，切到「格式化 / 压缩」标签
2. 粘贴一段嵌套 JSON
3. 截图格式化结果（带语法高亮）

### `ip/lookup.png`

1. 打开 `/ip`
2. 点「查询我的 IP」
3. 截图结果区（地图坐标 + ASN + ISP）

## 添加新截图流程

1. 按上面规范拍图，命名按清单
2. 丢到对应子目录
3. （如有）压缩到 < 500KB
4. 提交 PR，README 自动引用
