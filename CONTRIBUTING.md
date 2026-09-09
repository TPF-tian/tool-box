# 贡献指南

感谢你有兴趣为 ToolBox 贡献代码！🎉

## 行为准则

请保持友善与专业。所有参与者都应被尊重，不容忍任何形式的骚扰或歧视。

## 提 Issue

- **Bug 报告**：使用 [Bug Report 模板](.github/ISSUE_TEMPLATE/bug_report.md)，附上复现步骤、浏览器版本、报错截图
- **功能请求**：使用 [Feature Request 模板](.github/ISSUE_TEMPLATE/feature_request.md)，描述场景与期望
- **问题咨询**：先搜一下 [已有 Issue](https://github.com/TPF-tian/tool-box/issues)，避免重复

## 提 Pull Request

1. **Fork** 仓库，从 `main` 切特性分支（`git checkout -b feat/your-feature`）
2. **本地开发**：参考 README 的 [本地开发](#-本地开发) 一节
3. **代码规范**：
   - TypeScript 严格模式，不要 `any` 滥用
   - Vue 组件用 `<script setup lang="ts">`
   - 工具函数优先写纯函数，单独放在 `src/utils/`，方便后续加测试
   - 提交前跑 `pnpm exec vue-tsc --noEmit` 确保无类型错误
4. **Commit message**：用 [Conventional Commits](https://www.conventionalcommits.org/) 风格（`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`）
5. **PR 描述**：说明改了什么、为什么改、关联哪些 Issue，最好附截图/录屏

## 添加新工具

参考 README 的 [🧩 添加新工具](#-添加新工具) 一节。简单来说：

1. `src/utils/` 加业务逻辑（纯函数）
2. `src/views/` 或 `src/views/image/` 加 Vue 页面
3. `src/router/index.ts` 注册路由
4. 对应的导航页（`Home.vue` / `ImageHome.vue` 等）加 `ToolCard`

## 不接受的内容

- 与工具集主题无关的功能（电商、社交、CRM 等）
- 需要后端账号体系的功能（保持纯前端 / 自托管后端的轻量定位）
- 引入大型依赖（如 ffmpeg.wasm ~30MB），除非有充分理由

## 许可

提交 PR 即视为同意按 [MIT License](LICENSE) 协议开源你的贡献。
