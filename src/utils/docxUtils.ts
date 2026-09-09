/**
 * Word 文档工具
 * - mammoth: .docx → HTML（带图片 base64）
 * - docx: HTML → .docx（轻量解析,覆盖常用块级/行内标签）
 */
import mammoth from 'mammoth'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType
} from 'docx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// ===== docx → HTML =====

export type DocxToHtmlResult = {
  html: string
  /** 内嵌的图片（base64 data URL），mammoth 直接嵌进 HTML 里 */
  messages: string[]
}

export async function docxToHtml(file: File): Promise<DocxToHtmlResult> {
  const buf = await file.arrayBuffer()
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buf },
    {
      // 图片转 base64 内嵌,纯前端处理
      convertImage: mammoth.images.imgElement(async (image) => {
        const dataBuffer = await image.read('base64')
        return { src: `data:${image.contentType};base64,${dataBuffer}` }
      })
    }
  )
  return { html: result.value, messages: result.messages.map((m) => m.message) }
}

export async function docxToMarkdown(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  // mammoth.convertToMarkdown 在 1.8+ 存在,但 .d.ts 没声明,这里用 any cast
  const fn = (mammoth as unknown as {
    convertToMarkdown: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }).convertToMarkdown
  const result = await fn({ arrayBuffer: buf })
  return result.value
}

export async function docxToText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

// ===== HTML → docx =====

type InlineNode = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  code?: boolean
  /** 真实的图片(由 parseBlocks 在预处理时抽出) */
  image?: { data: Uint8Array; ext: string; alt: string }
}
type Block = Paragraph | Table

/** 段间距默认值(磅 * 20 = twip),普通段落前后 */
const SPACING = {
  paraAfter: 120, // 6pt 段后
  paraBefore: 0,
  headingBefore: 240, // 12pt 标题前
  headingAfter: 120,
  listAfter: 60, // 列表项之间 3pt
  blockquoteBorder: true,
  codeBlockBefore: 120,
  codeBlockAfter: 120
} as const

/** 极简 HTML → docx children 转换(行内) */
function parseInline(node: ChildNode, opts: { bold?: boolean; italic?: boolean; underline?: boolean; code?: boolean } = {}): InlineNode[] {
  const result: InlineNode[] = []
  function walk(n: ChildNode, o: typeof opts) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent || ''
      if (text) result.push({ text, ...o })
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      result.push({ text: '\n', ...o })
      return
    }
    if (tag === 'strong' || tag === 'b') {
      el.childNodes.forEach((c) => walk(c, { ...o, bold: true }))
      return
    }
    if (tag === 'em' || tag === 'i') {
      el.childNodes.forEach((c) => walk(c, { ...o, italic: true }))
      return
    }
    if (tag === 'u') {
      el.childNodes.forEach((c) => walk(c, { ...o, underline: true }))
      return
    }
    if (tag === 'code' && !el.closest('pre')) {
      el.childNodes.forEach((c) => walk(c, { ...o, code: true }))
      return
    }
    if (tag === 'a') {
      const href = (el as HTMLAnchorElement).href || ''
      const text = el.textContent || ''
      result.push({ text: `${text} (${href})`, ...o })
      return
    }
    if (tag === 'img') {
      // 已经被预处理抽走的话,这里就是占位 span
      const alt = (el as HTMLImageElement).alt || '图片'
      result.push({ text: `[图片:${alt}]`, ...o })
      return
    }
    el.childNodes.forEach((c) => walk(c, o))
  }
  walk(node, opts)
  return result
}

function inlineToRuns(nodes: InlineNode[]): (TextRun | ImageRun)[] {
  const result: (TextRun | ImageRun)[] = []
  for (const n of nodes) {
    if (n.image) {
      result.push(
        new ImageRun({
          data: n.image.data,
          transformation: { width: 400, height: 300 },
          type: n.image.ext === 'png' ? 'png' : n.image.ext === 'gif' ? 'gif' : n.image.ext === 'jpg' || n.image.ext === 'jpeg' ? 'jpg' : 'png'
        })
      )
      continue
    }
    result.push(
      new TextRun({
        text: n.text,
        bold: n.bold,
        italics: n.italic,
        underline: n.underline ? {} : undefined,
        font: n.code ? 'Consolas' : undefined
      })
    )
  }
  return result
}

/**
 * 从 HTML 中抽取所有 data: 图片并替换成占位 span,
 * 让后续 parseInline / parseBlocks 走纯文本路径。
 * 解析后的 image data 通过闭包返回。
 */
type ExtractedImage = { data: Uint8Array; ext: string; alt: string }
function extractImages(root: HTMLElement): InlineNode['image'][] {
  const imgs = Array.from(root.querySelectorAll('img'))
  const extracted: InlineNode['image'][] = []
  for (const img of imgs) {
    const src = (img as HTMLImageElement).src
    const alt = (img as HTMLImageElement).alt || '图片'
    if (!src.startsWith('data:image/')) {
      // 非 base64 图片,留 alt 文字占位
      const span = document.createElement('span')
      span.textContent = `[图片:${alt}]`
      img.replaceWith(span)
      continue
    }
    const m = src.match(/^data:image\/([\w+]+);base64,(.*)$/)
    if (!m) continue
    try {
      const extRaw = m[1].toLowerCase()
      const ext = extRaw === 'jpg' || extRaw === 'jpeg' ? 'jpg' : extRaw === 'png' || extRaw === 'gif' || extRaw === 'webp' ? extRaw : 'png'
      const data = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))
      const record: ExtractedImage = { data, ext, alt }
      extracted.push(record)
      const span = document.createElement('span')
      span.dataset.imgIndex = String(extracted.length - 1)
      span.textContent = `[图片:${alt}]`
      img.replaceWith(span)
    } catch {
      const span = document.createElement('span')
      span.textContent = `[图片:${alt}]`
      img.replaceWith(span)
    }
  }
  return extracted
}

/** 把已经被替换成占位 span 的图片 index 反查回 InlineNode.image */
function decorateInlineWithImages(nodes: InlineNode[], images: InlineNode['image'][]): InlineNode[] {
  return nodes.map((n) => {
    const m = n.text.match(/^\[图片:([^\]]+)\]$/)
    if (m) {
      // 简单情况: 整段就是一个图片占位,无法从 inline 节点本身知道 index
      // 我们让 parseInline 返回的就是普通文字,真正的 image 嵌入由
      // parseBlocks 在处理"只有图片的段落"时直接构造
      return n
    }
    return n
  })
}

/**
 * 解析列表(ul/ol),递归处理嵌套 li,返回 paragraph 列表
 * - 用 • 或 数字编号做项目符号
 * - 嵌套层级用 indent.left 体现
 * - 列表项之间用小段间距
 */
function parseListItems(listEl: HTMLElement, isOrdered: boolean, depth: number, blocks: Block[]): void {
  const items = Array.from(listEl.children).filter((c) => c.tagName.toLowerCase() === 'li') as HTMLElement[]
  items.forEach((li, i) => {
    // 收集 li 的直接行内内容(不递归进嵌套 ul/ol)
    const inlineChildren: Node[] = []
    let nestedLists: HTMLElement[] = []
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName.toLowerCase()
        if (tag === 'ul' || tag === 'ol') {
          nestedLists.push(el)
        } else {
          inlineChildren.push(child)
        }
      } else {
        inlineChildren.push(child)
      }
    }
    // 把 inlineChildren 包成临时容器解析
    const tmp = document.createElement('div')
    for (const c of inlineChildren) tmp.appendChild(c.cloneNode(true))
    const bullet = isOrdered ? `${i + 1}.` : '•'
    const indent = { left: 360 + depth * 360 } // 0.25 inch + 嵌套加深
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${bullet} ` }),
          ...inlineToRuns(parseInline(tmp))
        ],
        indent,
        spacing: { after: SPACING.listAfter }
      })
    )
    // 递归嵌套列表
    for (const nl of nestedLists) {
      parseListItems(nl, nl.tagName.toLowerCase() === 'ol', depth + 1, blocks)
    }
  })
}

/** 解析 block-level 元素(根节点或 fragment) → docx 块 */
function parseBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = []
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent || '').trim()
      if (text) {
        blocks.push(
          new Paragraph({
            children: [new TextRun({ text })],
            spacing: { after: SPACING.paraAfter }
          })
        )
      }
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()

    // 标题 h1-h6
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6
      const headingMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6
      } as const
      blocks.push(
        new Paragraph({
          heading: headingMap[level],
          children: inlineToRuns(parseInline(el)),
          spacing: { before: SPACING.headingBefore, after: SPACING.headingAfter }
        })
      )
      continue
    }

    // 段落
    if (tag === 'p') {
      // 整段是图片占位: <p><span data-img-index="0">图片描述</span></p>
      const imgSpan = el.querySelector('span[data-img-index]')
      if (imgSpan && el.textContent && el.children.length === 1) {
        const idx = parseInt((imgSpan as HTMLElement).dataset.imgIndex || '-1')
        if (idx >= 0 && images[idx]) {
          blocks.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: images[idx].data,
                  transformation: { width: 400, height: 300 },
                  type: images[idx].ext === 'png' ? 'png' : images[idx].ext === 'gif' ? 'gif' : images[idx].ext === 'jpg' || images[idx].ext === 'jpeg' ? 'jpg' : 'png'
                })
              ],
              spacing: { before: SPACING.paraBefore, after: SPACING.paraAfter }
            })
          )
          continue
        }
      }
      const runs = inlineToRuns(parseInline(el))
      blocks.push(
        new Paragraph({
          children: runs.length ? runs : [new TextRun('')],
          spacing: { after: SPACING.paraAfter }
        })
      )
      continue
    }

    // 列表
    if (tag === 'ul' || tag === 'ol') {
      parseListItems(el, tag === 'ol', 0, blocks)
      // 列表结束后再加一个小段间距,让后面的内容有空气感
      blocks.push(
        new Paragraph({
          children: [new TextRun('')],
          spacing: { after: 0 }
        })
      )
      continue
    }

    // 代码块
    if (tag === 'pre') {
      const code = el.querySelector('code') || el
      const text = (code.textContent || '').replace(/\n$/, '')
      const lines = text.split('\n')
      blocks.push(
        new Paragraph({
          children: lines.map(
            (line, idx) =>
              new TextRun({
                text: line,
                break: idx < lines.length - 1 ? 1 : 0,
                font: 'Consolas'
              })
          ),
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' },
          spacing: { before: SPACING.codeBlockBefore, after: SPACING.codeBlockAfter }
        })
      )
      continue
    }

    // 引用
    if (tag === 'blockquote') {
      const text = (el.textContent || '').trim()
      blocks.push(
        new Paragraph({
          indent: { left: 720 },
          border: {
            left: { color: '94A3B8', space: 8, style: BorderStyle.SINGLE, size: 18 }
          },
          children: [new TextRun({ text, italics: true, color: '475569' })],
          spacing: { after: SPACING.paraAfter }
        })
      )
      continue
    }

    // 分隔线
    if (tag === 'hr') {
      blocks.push(
        new Paragraph({
          border: { bottom: { color: '999999', space: 1, style: BorderStyle.SINGLE, size: 6 } },
          children: [new TextRun('')],
          spacing: { before: 120, after: 120 }
        })
      )
      continue
    }

    // 表格
    if (tag === 'table') {
      const rows: TableRow[] = []
      for (const tr of Array.from(el.querySelectorAll('tr'))) {
        const cells: TableCell[] = []
        for (const td of Array.from(tr.querySelectorAll('th,td'))) {
          const isTh = td.tagName.toLowerCase() === 'th'
          cells.push(
            new TableCell({
              children: [
                new Paragraph({
                  children: inlineToRuns(parseInline(td as HTMLElement)),
                  spacing: { after: 0 }
                })
              ],
              shading: isTh
                ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E2E8F0' }
                : undefined,
              width: { size: 25, type: WidthType.PERCENTAGE }
            })
          )
        }
        if (cells.length) rows.push(new TableRow({ children: cells }))
      }
      if (rows.length) {
        blocks.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
              insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' }
            }
          })
        )
        // 表格后空一行
        blocks.push(
          new Paragraph({
            children: [new TextRun('')],
            spacing: { after: SPACING.paraAfter }
          })
        )
      }
      continue
    }

    // 默认:当作段落处理
    const text = (el.textContent || '').trim()
    if (text) {
      blocks.push(
        new Paragraph({
          children: inlineToRuns(parseInline(el)),
          spacing: { after: SPACING.paraAfter }
        })
      )
    }
  }
  return blocks
}

/** 闭包共享:parseBlocks 内部依赖 images,这里用闭包变量从外面注入 */
let images: InlineNode['image'][] = []

/**
 * HTML → docx blocks(带图片提取)
 * - 先抽 img data: 出来换成占位 span
 * - 再走 parseBlocks
 */
function htmlToDocxBlocks(html: string): Block[] {
  const root = document.createElement('div')
  root.innerHTML = html
  images = extractImages(root)
  return parseBlocks(root)
}

/** HTML 字符串 → .docx Blob(支持 data: 图片) */
export async function htmlToDocx(html: string, title = 'Document'): Promise<Blob> {
  const blocks = htmlToDocxBlocks(html)
  const doc = new Document({
    creator: 'ToolBox',
    title,
    sections: [
      {
        properties: {},
        children: blocks.length
          ? blocks
          : [new Paragraph({ children: [new TextRun({ text: '' })] })]
      }
    ]
  })
  return await Packer.toBlob(doc)
}

/** HTML（含 <img src="data:...">）→ docx,图片真正嵌入(同 htmlToDocx) */
export async function htmlToDocxWithImages(html: string, title = 'Document'): Promise<Blob> {
  return htmlToDocx(html, title)
}

// ===== .docx → .pdf =====

/**
 * 把 .docx 转成 PDF。
 * 内部走 mammoth → HTML,再把 HTML 流式写入 PDF (A4, Latin 字体)。
 *
 * 限制:
 * - 只支持 .docx (Word)。.xlsx / .pptx 不在范围。
 * - 浏览器内 PDF 库只内置拉丁字体,中文字符会渲染为方块。
 * - 不嵌入原始 .docx 的图片/复杂样式;只保留标题/段落/列表/代码块/引用/表格的文本结构。
 *
 * 适合"简单文字稿件快速转 PDF"的场景。复杂排版请用桌面 Word 导出。
 */
export async function docxToPdf(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })

  const root = document.createElement('div')
  root.innerHTML = html

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 595 // A4 portrait
  const pageHeight = 842
  const margin = 60
  const lineHeight = 16
  const maxWidth = pageWidth - margin * 2

  let page = pdf.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  function newPageIfNeeded(extra = 0) {
    if (y - extra < margin) {
      page = pdf.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
  }

  function drawWrapped(text: string, opts: { size?: number; bold?: boolean; indent?: number; color?: { r: number; g: number; b: number } } = {}) {
    const size = opts.size ?? 11
    const f = opts.bold ? fontBold : font
    const c = opts.color ? rgb(opts.color.r / 255, opts.color.g / 255, opts.color.b / 255) : rgb(0, 0, 0)
    const indent = opts.indent ?? 0
    const availableWidth = maxWidth - indent
    // 按空白拆词(包含中文时按字拆)
    const tokens: string[] = []
    const tmp = text.split(/(\s+)/)
    for (const t of tmp) {
      if (/^\s+$/.test(t)) {
        tokens.push(t)
        continue
      }
      if (f.widthOfTextAtSize(t, size) <= availableWidth) {
        tokens.push(t)
      } else {
        // 字符级拆
        for (const ch of t) tokens.push(ch)
      }
    }
    let line = ''
    for (const tok of tokens) {
      if (/^\s+$/.test(tok)) {
        line += tok
        continue
      }
      const test = line + tok
      if (f.widthOfTextAtSize(test, size) > availableWidth && line.replace(/\s+/g, '').length > 0) {
        newPageIfNeeded(lineHeight)
        page.drawText(line.trimEnd(), { x: margin + indent, y, size, font: f, color: c })
        y -= lineHeight
        line = tok.replace(/^\s+/, '')
      } else {
        line = test
      }
    }
    if (line.replace(/\s+/g, '').length > 0) {
      newPageIfNeeded(lineHeight)
      page.drawText(line.trimEnd(), { x: margin + indent, y, size, font: f, color: c })
      y -= lineHeight
    }
  }

  function visit(node: Node, indent = 0): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim()
      if (text) drawWrapped(text, { indent })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1])
      // 标题前后空一行
      y -= lineHeight * 0.5
      newPageIfNeeded(lineHeight * 2)
      drawWrapped(el.textContent || '', { size: Math.max(13, 22 - (level - 1) * 2), bold: true, indent })
      y -= lineHeight * 0.5
      return
    }
    if (tag === 'p') {
      drawWrapped(el.textContent || '', { indent })
      y -= lineHeight * 0.3 // 段落间小间距
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      const isOrdered = tag === 'ol'
      const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li') as HTMLElement[]
      items.forEach((li, i) => {
        const bullet = isOrdered ? `${i + 1}.` : '•'
        drawWrapped(`${bullet} ${li.textContent?.trim() || ''}`, { indent: indent + 20 })
      })
      y -= lineHeight * 0.3
      return
    }
    if (tag === 'pre') {
      const code = el.querySelector('code') || el
      const text = (code.textContent || '').replace(/\n$/, '')
      for (const line of text.split('\n')) {
        drawWrapped(line || ' ', { indent, color: { r: 60, g: 60, b: 60 } })
      }
      y -= lineHeight * 0.3
      return
    }
    if (tag === 'blockquote') {
      drawWrapped(el.textContent || '', { indent: indent + 20, color: { r: 100, g: 116, b: 139 } })
      return
    }
    if (tag === 'table') {
      // 简化处理: 每行用 " | " 拼接
      const rows = Array.from(el.querySelectorAll('tr'))
      rows.forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('th,td')).map((td) => td.textContent?.trim() || '')
        drawWrapped(cells.join('  |  '), { indent, bold: tr.querySelector('th') !== null })
      })
      y -= lineHeight * 0.3
      return
    }
    if (tag === 'br') {
      y -= lineHeight
      return
    }
    // 容器: 递归
    for (const child of Array.from(el.childNodes)) visit(child, indent)
  }

  for (const child of Array.from(root.childNodes)) visit(child, 0)

  // 至少保证有一页
  if (pdf.getPageCount() === 0) {
    pdf.addPage([pageWidth, pageHeight])
  }

  return pdf.save()
}
