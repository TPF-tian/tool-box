# 更新日志

所有版本变更记录在此文件。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- 文档工具集：Markdown 编辑器、Markdown ↔ HTML、文本处理、PDF 工具、Word 文档
- JSON 工具：格式化 / 压缩 / 字段级 diff / 树形视图可编辑 / JSONPath 查询 / JSON 修复 / 转表格 / 转类型定义
- 图像工具：图片转 GIF、图片 / GIF 转 WebM 视频
- 暗色模式（跟随系统或手动切换）
- 端到端中文界面

### 变更
- README 重写为双语（中文 + 英文），与代码实际功能对齐
- 部署文档泛化（移除个人域名示例）
- `.gitignore` 补齐 `server/*.onnx` / `public/tesseract/` / 构建产物

### 修复
- README 中提到的 `@imgly/background-removal` 与 `download-bg-model.mjs` 实际未使用，已纠正

## [0.1.0] - 2024-08-29

### 新增
- 图像工具：压缩、尺寸修改、水印、九宫格切图、Base64 转换、GIF 拆帧、证件照生成
- JSON 工具：格式化 / 压缩
- IP 解析
- 顶栏布局 + 工具卡片首页
