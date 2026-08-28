import { diffLines } from 'diff'

export type DiffPart = {
  value: string
  added?: boolean
  removed?: boolean
}

export type DiffLine = {
  kind: 'add' | 'remove' | 'context'
  text: string
  /** 1-based 行号,左侧;新增行无此项 */
  oldLine?: number
  /** 1-based 行号,右侧;删除行无此项 */
  newLine?: number
}

export function formatJson(input: string, indent: number | '\t' = 2): string {
  const obj = JSON.parse(input)
  return JSON.stringify(obj, null, indent)
}

export function minifyJson(input: string): string {
  return JSON.stringify(JSON.parse(input))
}

function toStableString(input: string): string {
  // 双方统一用 2 空格缩进,保证行级 diff 稳定
  return JSON.stringify(JSON.parse(input), null, 2)
}

export function jsonDiff(left: string, right: string): DiffPart[] {
  if (!left.trim() && !right.trim()) return []
  const a = toStableString(left)
  const b = toStableString(right)
  const result = diffLines(a, b, { newlineIsToken: false })
  return result.map((p) => ({
    value: p.value,
    added: p.added,
    removed: p.removed
  }))
}

/**
 * 把 diff 段落拆成单行,带上 git 风格的双侧行号
 */
export function buildDiffLines(parts: DiffPart[]): DiffLine[] {
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  for (const p of parts) {
    // value 一般以 \n 结尾;split 后末位是空串,丢掉
    const lines = p.value.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const kind: DiffLine['kind'] = p.added ? 'add' : p.removed ? 'remove' : 'context'
    for (const text of lines) {
      const item: DiffLine = { text, kind }
      if (kind === 'context') {
        oldLine++
        newLine++
        item.oldLine = oldLine
        item.newLine = newLine
      } else if (kind === 'remove') {
        oldLine++
        item.oldLine = oldLine
      } else {
        newLine++
        item.newLine = newLine
      }
      result.push(item)
    }
  }
  return result
}
