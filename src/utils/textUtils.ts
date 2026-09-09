/**
 * 文本处理工具集
 * - 字符统计（含中英文 / 字节 / 行数 / Unicode 类别）
 * - 批量查找替换（支持正则）
 * - 正则提取/过滤
 * - Unicode 转换（转义 ↔ 字符、简繁、零宽字符剥离）
 * - 编码转换（Base64 / URL / 十六进制 / Unicode codepoint）
 * - 文本 diff（git 风格行号）
 */
import { diffLines } from 'diff'

// ===== 字符统计 =====

export type CharStats = {
  total: number
  noWhitespace: number
  letters: number
  digits: number
  chinese: number
  english: number
  punctuation: number
  spaces: number
  newlines: number
  bytesUtf8: number
  bytesGbk: number
  lines: number
  paragraphs: number
}

export function textStats(text: string): CharStats {
  // GBK 字节数：仅估算（中文 2 byte，ASCII 1 byte，其他按 2 byte 估）
  let bytesGbk = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code > 0x7f) bytesGbk += 2
    else bytesGbk += 1
  }
  // 中文 = CJK Unified Ideographs
  const chinese = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  // 英文字母
  const english = (text.match(/[A-Za-z]/g) || []).length
  const digits = (text.match(/[0-9]/g) || []).length
  // 中英文标点（不含空白）
  const punctuation = (text.match(/[\u3000-\u303f\uff00-\uffef!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g) || []).length
  const spaces = (text.match(/[ \t]/g) || []).length
  const newlines = (text.match(/\n/g) || []).length
  const noWhitespace = text.replace(/\s+/g, '').length
  const lines = text === '' ? 0 : text.split(/\r?\n/).length
  const paragraphs = text.split(/\r?\n\s*\r?\n/).filter((p) => p.trim().length > 0).length

  return {
    total: text.length,
    noWhitespace,
    letters: english,
    digits,
    chinese,
    english,
    punctuation,
    spaces,
    newlines,
    bytesUtf8: new Blob([text]).size,
    bytesGbk,
    lines,
    paragraphs
  }
}

// ===== 批量查找替换 =====

export type FindReplaceResult = {
  output: string
  count: number
}

export function findReplace(
  text: string,
  search: string,
  replacement: string,
  opts: { regex?: boolean; caseSensitive?: boolean; global?: boolean } = {}
): FindReplaceResult {
  const { regex = false, caseSensitive = true, global = true } = opts
  if (!search && !regex) return { output: text, count: 0 }
  try {
    let pattern: RegExp
    if (regex) {
      const flags = `${global ? 'g' : ''}${caseSensitive ? '' : 'i'}`
      pattern = new RegExp(search, flags)
    } else {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const flags = `${global ? 'g' : ''}${caseSensitive ? '' : 'i'}`
      pattern = new RegExp(escaped, flags)
    }
    let count = 0
    const output = text.replace(pattern, () => {
      count++
      return replacement
    })
    return { output, count }
  } catch (e) {
    throw new Error('正则表达式无效: ' + (e as Error).message)
  }
}

// ===== 正则提取 =====

export type RegexExtractResult = {
  matches: string[]
  groups: string[][]
  count: number
  error?: string
}

export function regexExtract(text: string, pattern: string, flags = 'g'): RegexExtractResult {
  try {
    const re = new RegExp(pattern, flags)
    const matches: string[] = []
    const groups: string[][] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      matches.push(m[0])
      groups.push(m.slice(1))
      if (m.index === re.lastIndex) re.lastIndex++ // 防止 0 长度死循环
    }
    return { matches, groups, count: matches.length }
  } catch (e) {
    return { matches: [], groups: [], count: 0, error: (e as Error).message }
  }
}

// ===== Unicode 转换 =====

/** 字符 → Unicode 转义（\uXXXX，必要时升级为 surrogate pair 形式） */
export function charsToUnicodeEscape(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80 && ch !== '\\') {
      out += ch
    } else if (cp <= 0xffff) {
      out += '\\u' + cp.toString(16).padStart(4, '0')
    } else {
      out += '\\u' + ((cp - 0x10000) >> 10 | 0xd800).toString(16).padStart(4, '0')
      out += '\\u' + ((cp - 0x10000) & 0x3ff | 0xdc00).toString(16).padStart(4, '0')
    }
  }
  return out
}

/** \uXXXX / \u{XXXX} → 字符 */
export function unicodeEscapeToChars(text: string): string {
  // surrogate pair + BMP
  return text
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
}

/** 剥离零宽字符（ZWS、ZWJ、ZWNJ、BOM、soft hyphen 等） */
export function stripZeroWidth(text: string): string {
  return text.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD\u180E]/g, '')
}

// ===== 编码转换 =====

/** 字符串 → Base64（UTF-8 安全） */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** Base64 → 字符串 */
export function base64ToText(b64: string): string {
  const cleaned = b64.replace(/\s/g, '')
  const bin = atob(cleaned)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** 字符串 → URL 编码（encodeURIComponent 风格） */
export function textToUrlEncoded(text: string): string {
  return encodeURIComponent(text)
}

/** URL 编码 → 字符串 */
export function urlEncodedToText(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    throw new Error('URL 编码格式无效')
  }
}

/** 字符串 → 十六进制 */
export function textToHex(text: string, opts: { space?: boolean; upper?: boolean } = {}): string {
  const { space = true, upper = false } = opts
  const bytes = new TextEncoder().encode(text)
  const hex: string[] = []
  for (const b of bytes) {
    let h = b.toString(16)
    if (h.length === 1) h = '0' + h
    if (upper) h = h.toUpperCase()
    hex.push(h)
  }
  return hex.join(space ? ' ' : '')
}

/** 十六进制 → 字符串 */
export function hexToText(hex: string): string {
  const cleaned = hex.replace(/\s|0x/gi, '')
  if (cleaned.length % 2 !== 0) throw new Error('十六进制长度必须是偶数')
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) throw new Error('含非十六进制字符')
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16)
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** 字符串 → Unicode codepoint 表示（U+XXXX, 平面字符也用 codepoint 形式） */
export function textToCodepoints(text: string): string {
  const cps: string[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    cps.push('U+' + cp.toString(16).toUpperCase().padStart(4, '0'))
  }
  return cps.join(' ')
}

/** U+XXXX 串 → 字符串 */
export function codepointsToText(text: string): string {
  const parts = text.split(/[\s,;]+/).filter(Boolean)
  let out = ''
  for (const p of parts) {
    const m = p.match(/^(?:U\+|u\+|0x|0X)?([0-9a-fA-F]+)$/)
    if (!m) throw new Error(`无效 codepoint: ${p}`)
    out += String.fromCodePoint(parseInt(m[1], 16))
  }
  return out
}

// ===== 文本 diff =====

export type DiffLine = {
  type: 'context' | 'add' | 'remove'
  text: string
  leftNo: number | null
  rightNo: number | null
}

/** git 风格行 diff */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const parts = diffLines(oldText, newText, { newlineIsToken: false })
  const result: DiffLine[] = []
  let leftNo = 0
  let rightNo = 0
  for (const p of parts) {
    const lines = p.value.split('\n')
    // diffLines 末尾常带空行，去掉
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    for (const line of lines) {
      if (p.added) {
        rightNo++
        result.push({ type: 'add', text: line, leftNo: null, rightNo })
      } else if (p.removed) {
        leftNo++
        result.push({ type: 'remove', text: line, leftNo, rightNo: null })
      } else {
        leftNo++
        rightNo++
        result.push({ type: 'context', text: line, leftNo, rightNo })
      }
    }
  }
  return result
}
