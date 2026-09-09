/**
 * 把 JSON 数组转成 Markdown / HTML 表格.
 * - 输入: 对象数组. 也接受单个对象 (当成一行) 或 null.
 * - 嵌套对象/数组 序列化为 JSON 字符串.
 * - 列按首次出现的顺序排列.
 */

export type TableFormat = 'markdown' | 'html'

export interface TableResult {
  /** 输出的表格字符串 */
  text: string
  /** 实际用到的列名 (按顺序) */
  columns: string[]
  /** 数据行数 (不含表头) */
  rowCount: number
  /** 错误信息 (解析失败或输入不是对象数组时) */
  error?: string
}

/** 把任意值序列化成单元格文本 */
function cellValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'string') return v
  return String(v)
}

/** 把单行对象转成按 columns 顺序的单元格数组 */
function rowCells(row: Record<string, unknown>, columns: string[]): string[] {
  return columns.map((col) => cellValue(row[col]))
}

/** 收集所有列 (按首次出现顺序) */
function collectColumns(rows: Record<string, unknown>[]): string[] {
  const cols: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
  }
  return cols
}

/** 把输入规整成对象数组 */
function normalize(input: unknown): { rows: Record<string, unknown>[]; error?: string } {
  if (input === null || input === undefined) {
    return { rows: [], error: '输入为空' }
  }
  if (Array.isArray(input)) {
    if (input.length === 0) return { rows: [], error: '数组是空的' }
    const rows: Record<string, unknown>[] = []
    for (const item of input) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return { rows: [], error: '数组元素必须是对象 (不能是基本类型/数组/嵌套数组)' }
      }
      rows.push(item as Record<string, unknown>)
    }
    return { rows }
  }
  if (typeof input === 'object') {
    return { rows: [input as Record<string, unknown>] }
  }
  return { rows: [], error: '输入必须是对象数组或单个对象' }
}

/** Markdown 表格转义: | → \\|, 换行 → 空格 */
function mdEscape(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\r/g, ' ')
}

function buildMarkdown(rows: Record<string, unknown>[], columns: string[]): string {
  if (rows.length === 0) return ''
  const head = `| ${columns.map(mdEscape).join(' | ')} |`
  const sep = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows
    .map((r) => `| ${rowCells(r, columns).map(mdEscape).join(' | ')} |`)
    .join('\n')
  return [head, sep, body].join('\n')
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(rows: Record<string, unknown>[], columns: string[]): string {
  const thead = `<thead><tr>${columns.map((c) => `<th>${htmlEscape(c)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${rows
    .map(
      (r) =>
        `<tr>${rowCells(r, columns).map((c) => `<td>${htmlEscape(c)}</td>`).join('')}</tr>`
    )
    .join('')}</tbody>`
  return `<table>\n${thead}\n${tbody}\n</table>`
}

export function jsonToTable(input: unknown, format: TableFormat): TableResult {
  const { rows, error } = normalize(input)
  if (error) {
    return { text: '', columns: [], rowCount: 0, error }
  }
  if (rows.length === 0) {
    return { text: '', columns: [], rowCount: 0, error: '没有可转换的数据' }
  }
  const columns = collectColumns(rows)
  if (columns.length === 0) {
    return { text: '', columns: [], rowCount: rows.length, error: '对象没有任何字段' }
  }
  const text = format === 'markdown' ? buildMarkdown(rows, columns) : buildHtml(rows, columns)
  return { text, columns, rowCount: rows.length }
}
