import type { JsonValue } from './jsonValue'

export type PathSegment = string | number | '*'
export type Path = PathSegment[]

/**
 * 解析路径字符串, 支持 . 分隔字段, [i] 数组索引, [*] 数组通配
 *   "user.name"        -> ["user", "name"]
 *   "users[0].name"    -> ["users", 0, "name"]
 *   "items[*].id"      -> ["items", "*", "id"]
 *   "a.b[2].c[10]"     -> ["a", "b", 2, "c", 10]
 */
export function parsePath(s: string): Path {
  const trimmed = s.trim()
  if (!trimmed) return []
  const out: Path = []
  let i = 0
  const n = trimmed.length
  while (i < n) {
    const c = trimmed[i]
    if (c === ' ' || c === '\t') {
      i++
      continue
    }
    if (c === '.') {
      i++
      continue
    }
    if (c === '[') {
      const end = trimmed.indexOf(']', i)
      if (end < 0) throw new Error(`路径 "${s}" 中 [ 没有匹配的 ]`)
      const inside = trimmed.substring(i + 1, end).trim()
      if (inside === '*') out.push('*')
      else if (/^-?\d+$/.test(inside)) out.push(parseInt(inside, 10))
      else if (inside.length > 0) {
        // 允许 [\"key\"] 或 ['key'] 这种带引号的 key
        const m = inside.match(/^['"](.+)['"]$/)
        out.push(m ? m[1] : inside)
      }
      i = end + 1
    } else {
      let j = i
      while (j < n && trimmed[j] !== '.' && trimmed[j] !== '[') j++
      const part = trimmed.substring(i, j).trim()
      if (part) out.push(part)
      i = j
    }
  }
  return out
}

/**
 * 在 obj 里按 path 取值. 通配符不适用此函数, 只用于单值路径.
 */
export function getByPath(obj: JsonValue, path: Path): JsonValue | undefined {
  let cur: JsonValue | undefined = obj
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur === 'object') {
      if (Array.isArray(cur)) {
        if (typeof seg !== 'number') return undefined
        cur = cur[seg]
      } else {
        if (typeof seg !== 'string') return undefined
        cur = (cur as { [k: string]: JsonValue })[seg]
      }
    } else return undefined
  }
  return cur
}

/**
 * 收集所有匹配通配符路径的值 (扁平数组). 例如 path=["items","*","id"] 在 obj.items[*].id 收集所有 id.
 */
export function collectByPath(obj: JsonValue, path: Path): JsonValue[] {
  const results: JsonValue[] = []
  function walk(node: JsonValue, i: number) {
    if (i >= path.length) {
      results.push(node)
      return
    }
    const seg = path[i]
    if (seg === '*') {
      if (Array.isArray(node)) {
        for (const item of node) walk(item, i + 1)
      }
      return
    }
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      if (typeof seg === 'number' && seg >= 0 && seg < node.length) walk(node[seg], i + 1)
    } else {
      const obj = node as { [k: string]: JsonValue }
      if (typeof seg === 'string' && seg in obj) walk(obj[seg], i + 1)
    }
  }
  walk(obj, 0)
  return results
}

// ============= Pick / Omit =============

/**
 * 从 obj 里只保留 paths 指定的字段, 生成新对象. 保留原结构.
 * 数组通配 [*] 会对每个元素应用.
 * 如果路径对应字段不存在, 跳过 (不报错).
 */
export function pickByPaths(obj: JsonValue, paths: Path[]): JsonValue {
  if (!Array.isArray(obj) && (obj === null || typeof obj !== 'object')) {
    return obj
  }
  if (Array.isArray(obj)) {
    // 数组: 每条 path 应用于每个元素
    return obj.map((item) => {
      if (item === null || typeof item !== 'object') return item
      if (Array.isArray(item)) return pickByPaths(item, paths)
      const out: { [k: string]: JsonValue } = {}
      for (const path of paths) {
        applyPathPick(out, item, path, 0)
      }
      return out
    })
  }
  const src = obj as { [k: string]: JsonValue }
  const out: { [k: string]: JsonValue } = {}
  for (const path of paths) {
    applyPathPick(out, src, path, 0)
  }
  return out
}

function applyPathPick(
  out: { [k: string]: JsonValue },
  src: { [k: string]: JsonValue },
  path: Path,
  idx: number
) {
  if (idx >= path.length) return
  const seg = path[idx]
  if (seg === '*') return // 顶层不支持通配 (顶层是对象, 通配没意义)
  if (typeof seg !== 'string') return
  if (!(seg in src)) return
  const srcVal = src[seg]
  if (idx === path.length - 1) {
    out[seg] = srcVal
    return
  }
  // 嵌套
  if (Array.isArray(srcVal)) {
    if (!out[seg]) {
      out[seg] = srcVal.map(() => ({}))
    }
    const outArr = out[seg] as JsonValue[]
    for (let i = 0; i < srcVal.length; i++) {
      const item = srcVal[i]
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
      const sub = item as { [k: string]: JsonValue }
      if (!outArr[i] || typeof outArr[i] !== 'object' || Array.isArray(outArr[i])) {
        outArr[i] = {} as JsonValue
      }
      const outItem = outArr[i] as { [k: string]: JsonValue }
      // 剩余 path
      const subPath = path.slice(idx + 1)
      applyPathPick(outItem, sub, subPath, 0)
    }
  } else if (srcVal !== null && typeof srcVal === 'object') {
    if (!out[seg] || typeof out[seg] !== 'object' || Array.isArray(out[seg])) {
      out[seg] = {} as JsonValue
    }
    const outSub = out[seg] as { [k: string]: JsonValue }
    const sub = srcVal as { [k: string]: JsonValue }
    applyPathPick(outSub, sub, path, idx + 1)
  }
}

/**
 * 从 obj 里删除 paths 指定的字段, 生成新对象.
 */
export function omitByPaths(obj: JsonValue, paths: Path[]): JsonValue {
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (item === null || typeof item !== 'object') return item
      return omitByPaths(item, paths)
    })
  }
  if (obj === null || typeof obj !== 'object') return obj
  // 深克隆再删,避免修改原对象
  const cloned = JSON.parse(JSON.stringify(obj)) as { [k: string]: JsonValue }
  for (const path of paths) {
    applyPathOmit(cloned, path, 0)
  }
  return cloned
}

function applyPathOmit(node: JsonValue, path: Path, idx: number) {
  if (idx >= path.length) return
  const seg = path[idx]
  if (seg === '*') {
    if (Array.isArray(node)) {
      const subPath = path.slice(idx + 1)
      for (const item of node) applyPathOmit(item, subPath, 0)
    }
    return
  }
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return
  const obj = node as { [k: string]: JsonValue }
  if (idx === path.length - 1) {
    if (typeof seg === 'string') delete obj[seg]
    return
  }
  if (typeof seg === 'string' && seg in obj) {
    applyPathOmit(obj[seg], path, idx + 1)
  }
}

// ============= 字段重命名 =============

/**
 * 解析 "oldKey:newKey" 格式的 rename 规则 (支持点路径: "user.name:user.fullName").
 * 返回 [{from, to}].
 */
export function parseRenameRules(text: string): { from: Path; to: Path }[] {
  const rules: { from: Path; to: Path }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    const from = parsePath(line.substring(0, colonIdx))
    const to = parsePath(line.substring(colonIdx + 1))
    if (from.length > 0 && to.length > 0) {
      rules.push({ from, to })
    }
  }
  return rules
}

export function renameKeys(obj: JsonValue, rules: { from: Path; to: Path }[]): JsonValue {
  if (Array.isArray(obj)) {
    return obj.map((item) => renameKeys(item, rules))
  }
  if (obj === null || typeof obj !== 'object') return obj
  const out: { [k: string]: JsonValue } = {}
  const src = obj as { [k: string]: JsonValue }
  for (const key of Object.keys(src)) {
    // 找匹配 from 的 rule
    let renamed = false
    for (const rule of rules) {
      if (rule.from.length === 1 && rule.from[0] === key) {
        const newKey = rule.to[rule.to.length - 1] as string
        out[newKey] = src[key]
        renamed = true
        break
      }
    }
    if (!renamed) {
      out[key] = src[key]
    }
  }
  // 递归处理每个 value
  for (const key of Object.keys(out)) {
    out[key] = renameKeys(out[key], rules)
  }
  return out
}
