/**
 * Markdown 渲染工具
 * - markdown-it: MD → HTML
 * - highlight.js: 代码高亮
 *
 * 注意：MD → HTML 已由 Markdown 编辑器内的「导出 HTML」按钮覆盖，
 * 独立的「HTML → MD」工具已移除（场景太少且编辑器也能完成 MD→HTML）。
 */
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

type MdInstance = InstanceType<typeof MarkdownIt>

// 用 common 包：体积小，覆盖主流语言（JS/TS/Java/Python/Go/Rust/SQL/HTML/CSS/JSON/Bash/...）
let cachedMd: MdInstance | null = null

export function getMarkdownIt(): MdInstance {
  if (cachedMd) return cachedMd
  cachedMd = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${
            hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
          }</code></pre>`
        } catch {
          // 忽略高亮错误，走默认
        }
      }
      // 默认转义
      return `<pre class="hljs"><code>${cachedMd!.utils.escapeHtml(str)}</code></pre>`
    }
  })
  return cachedMd
}

/** MD → HTML 字符串 */
export function markdownToHtml(md: string): string {
  return getMarkdownIt().render(md)
}

/** 简单提取纯文本（去 HTML 标签） */
export function htmlToText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || '').trim()
}
