/**
 * 从 JSON 样例数据生成多语言类型定义.
 * 支持: TypeScript Interface, Go struct, Java POJO, Python dataclass.
 */

export type Lang = 'ts' | 'go' | 'java' | 'python'

// 收集数组里所有出现过的类型, 用于混合类型推断
type InferredKind = 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'array' | 'object'

function inferKind(v: unknown): InferredKind {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? 'integer' : 'number'
  }
  return 'string'
}

// 用 "Kind|Kind|..." 作为 key 表示类型组合, 用作 interface 名字
function kindKey(kinds: InferredKind[]): string {
  return [...new Set(kinds)].sort().join('|')
}

// ============= TypeScript =============

function tsNameFor(key: string): string {
  // 转为合法 PascalCase 标识符
  const cleaned = key.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+/, '')
  if (!cleaned) return 'Field'
  return cleaned[0].toUpperCase() + cleaned.slice(1)
}

interface TsCtx {
  interfaces: Map<string, string> // name -> body
  counter: number
  indent: string
}

function tsType(v: unknown, ctx: TsCtx, propName: string): string {
  const kind = inferKind(v)
  if (kind === 'string') return 'string'
  if (kind === 'integer' || kind === 'number') return 'number'
  if (kind === 'boolean') return 'boolean'
  if (kind === 'null') return 'null'
  if (kind === 'array') {
    const arr = v as unknown[]
    if (arr.length === 0) return 'unknown[]'
    // 推断元素类型 (取所有元素的 kind 集合)
    const elementKinds = arr.map(inferKind)
    const key = kindKey(elementKinds)
    if (key === 'object') {
      // 递归生成内嵌 interface
      const merged = mergeObjects(arr as Record<string, unknown>[])
      const name = `${tsNameFor(propName)}Item`
      if (!ctx.interfaces.has(name)) {
        const body = tsInterfaceBody(merged, ctx, name)
        ctx.interfaces.set(name, body)
      }
      return `${name}[]`
    }
    if (key === 'string') return 'string[]'
    if (key === 'integer' || key === 'number') return 'number[]'
    if (key === 'boolean') return 'boolean[]'
    // 混合: union
    return `(${[...new Set(elementKinds)].map((k) => tsPrimitive(k)).join(' | ')})[]`
  }
  if (kind === 'object') {
    const obj = v as Record<string, unknown>
    const name = tsNameFor(propName)
    if (!ctx.interfaces.has(name)) {
      const body = tsInterfaceBody(obj, ctx, name)
      ctx.interfaces.set(name, body)
    }
    return name
  }
  return 'unknown'
}

function tsPrimitive(k: InferredKind): string {
  if (k === 'string') return 'string'
  if (k === 'integer' || k === 'number') return 'number'
  if (k === 'boolean') return 'boolean'
  if (k === 'null') return 'null'
  return 'unknown'
}

function mergeObjects(objs: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const obj of objs) {
    for (const k of Object.keys(obj)) {
      if (!(k in merged)) merged[k] = obj[k]
      // 已存在的就保留第一个
    }
  }
  return merged
}

function tsInterfaceBody(obj: Record<string, unknown>, ctx: TsCtx, name: string): string {
  const lines: string[] = []
  lines.push(`interface ${name} {`)
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    const t = tsType(val, ctx, key)
    const optional = val === null || val === undefined ? '?' : ''
    const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
    lines.push(`  ${safeKey}${optional}: ${t}`)
  }
  lines.push('}')
  return lines.join('\n')
}

export function generateTypeScript(value: unknown, rootName = 'Root'): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `type ${rootName} = ${typeof value}`
  }
  const ctx: TsCtx = { interfaces: new Map(), counter: 0, indent: '  ' }
  const body = tsInterfaceBody(value as Record<string, unknown>, ctx, rootName)
  ctx.interfaces.set(rootName, body)
  // 输出依赖顺序: 先输出子 interface, 再输出 root
  const lines: string[] = []
  // 简单做法: 按 Map 顺序输出 (子先, root 后)
  // 实际上 Map 顺序就是插入顺序, rootName 是最后插入
  // 但子 interface 也可能引用更深的, 需要先输出所有依赖
  // 简化: 用排序, rootName 放最后
  const all = Array.from(ctx.interfaces.entries())
  const others = all.filter(([n]) => n !== rootName)
  const root = all.find(([n]) => n === rootName)!
  for (const [, body] of others) lines.push(body)
  lines.push(body)
  return lines.join('\n\n')
}

// ============= Go =============

function goType(v: unknown, ctx: { structs: Map<string, string>; name: string }): string {
  const kind = inferKind(v)
  if (kind === 'string') return 'string'
  if (kind === 'integer') return 'int64'
  if (kind === 'number') return 'float64'
  if (kind === 'boolean') return 'bool'
  if (kind === 'null') return 'interface{}'
  if (kind === 'array') {
    const arr = v as unknown[]
    if (arr.length === 0) return '[]interface{}'
    const merged = mergeObjects(arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[])
    if (merged && Object.keys(merged).length > 0) {
      const name = `${tsNameFor(ctx.name)}Item`
      if (!ctx.structs.has(name)) {
        const subCtx = { ...ctx, name }
        ctx.structs.set(name, goStructBody(merged, subCtx))
      }
      return `[]${name}`
    }
    const elementKinds = arr.map(inferKind)
    if (elementKinds.every((k) => k === 'string')) return '[]string'
    if (elementKinds.every((k) => k === 'integer' || k === 'number')) return '[]float64'
    if (elementKinds.every((k) => k === 'boolean')) return '[]bool'
    return '[]interface{}'
  }
  if (kind === 'object') {
    const obj = v as Record<string, unknown>
    if (!ctx.structs.has(ctx.name)) {
      ctx.structs.set(ctx.name, goStructBody(obj, ctx))
    }
    return ctx.name
  }
  return 'interface{}'
}

function goStructBody(obj: Record<string, unknown>, ctx: { structs: Map<string, string>; name: string }): string {
  const lines: string[] = []
  lines.push(`type ${ctx.name} struct {`)
  for (const key of Object.keys(obj)) {
    const sub = { ...ctx, name: tsNameFor(key) }
    const t = goType(obj[key], sub)
    const field = tsNameFor(key)
    lines.push(`\t${field} ${t} \`json:"${key}"\``)
  }
  lines.push('}')
  return lines.join('\n')
}

export function generateGo(value: unknown, rootName = 'Root'): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `type ${rootName} = ${typeof value}`
  }
  const structs = new Map<string, string>()
  const ctx = { structs, name: rootName }
  structs.set(rootName, goStructBody(value as Record<string, unknown>, ctx))
  const lines: string[] = []
  for (const [n, body] of structs.entries()) {
    if (n === rootName) continue
    lines.push(body)
  }
  lines.push(structs.get(rootName)!)
  return lines.join('\n\n')
}

// ============= Java =============

function javaType(v: unknown, ctx: { classes: Map<string, string>; name: string }): string {
  const kind = inferKind(v)
  if (kind === 'string') return 'String'
  if (kind === 'integer') return 'Long'
  if (kind === 'number') return 'Double'
  if (kind === 'boolean') return 'Boolean'
  if (kind === 'null') return 'Object'
  if (kind === 'array') {
    const arr = v as unknown[]
    if (arr.length === 0) return 'List<Object>'
    const merged = mergeObjects(arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[])
    if (merged && Object.keys(merged).length > 0) {
      const name = tsNameFor(ctx.name) + 'Item'
      if (!ctx.classes.has(name)) {
        const subCtx = { ...ctx, name }
        ctx.classes.set(name, javaClassBody(merged, subCtx))
      }
      return `List<${name}>`
    }
    const elementKinds = arr.map(inferKind)
    if (elementKinds.every((k) => k === 'string')) return 'List<String>'
    if (elementKinds.every((k) => k === 'integer' || k === 'number')) return 'List<Double>'
    if (elementKinds.every((k) => k === 'boolean')) return 'List<Boolean>'
    return 'List<Object>'
  }
  if (kind === 'object') {
    const obj = v as Record<string, unknown>
    if (!ctx.classes.has(ctx.name)) {
      ctx.classes.set(ctx.name, javaClassBody(obj, ctx))
    }
    return ctx.name
  }
  return 'Object'
}

function javaClassBody(obj: Record<string, unknown>, ctx: { classes: Map<string, string>; name: string }): string {
  const lines: string[] = []
  lines.push(`public class ${ctx.name} {`)
  const getters: string[] = []
  for (const key of Object.keys(obj)) {
    const sub = { ...ctx, name: tsNameFor(key) }
    const t = javaType(obj[key], sub)
    const field = tsNameFor(key)
    lines.push(`    private ${t} ${field};`)
    getters.push(`    public ${t} get${field}() { return ${field}; }`)
    getters.push(`    public void set${field}(${t} ${field}) { this.${field} = ${field}; }`)
  }
  for (const g of getters) lines.push(g)
  lines.push('}')
  return lines.join('\n')
}

export function generateJava(value: unknown, rootName = 'Root'): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `// ${rootName} 类型为 ${typeof value}`
  }
  const classes = new Map<string, string>()
  const ctx = { classes, name: rootName }
  classes.set(rootName, javaClassBody(value as Record<string, unknown>, ctx))
  const lines: string[] = ['import java.util.List;', '']
  for (const [n, body] of classes.entries()) {
    if (n === rootName) continue
    lines.push(body)
    lines.push('')
  }
  lines.push(classes.get(rootName)!)
  return lines.join('\n')
}

// ============= Python =============

function pyType(v: unknown, ctx: { classes: Map<string, string>; name: string }): string {
  const kind = inferKind(v)
  if (kind === 'string') return 'str'
  if (kind === 'integer') return 'int'
  if (kind === 'number') return 'float'
  if (kind === 'boolean') return 'bool'
  if (kind === 'null') return 'Optional[Any]'
  if (kind === 'array') {
    const arr = v as unknown[]
    if (arr.length === 0) return 'List[Any]'
    const merged = mergeObjects(arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[])
    if (merged && Object.keys(merged).length > 0) {
      const name = tsNameFor(ctx.name)
      if (!ctx.classes.has(name)) {
        const subCtx = { ...ctx, name }
        ctx.classes.set(name, pyClassBody(merged, subCtx))
      }
      return `List[${name}]`
    }
    const elementKinds = arr.map(inferKind)
    if (elementKinds.every((k) => k === 'string')) return 'List[str]'
    if (elementKinds.every((k) => k === 'integer' || k === 'number')) return 'List[float]'
    if (elementKinds.every((k) => k === 'boolean')) return 'List[bool]'
    return 'List[Any]'
  }
  if (kind === 'object') {
    const obj = v as Record<string, unknown>
    const name = tsNameFor(ctx.name)
    if (!ctx.classes.has(name)) {
      const subCtx = { ...ctx, name }
      ctx.classes.set(name, pyClassBody(obj, subCtx))
    }
    return name
  }
  return 'Any'
}

function pyClassBody(obj: Record<string, unknown>, ctx: { classes: Map<string, string>; name: string }): string {
  const lines: string[] = []
  lines.push(`@dataclass`)
  lines.push(`class ${tsNameFor(ctx.name)}:`)
  let hasField = false
  for (const key of Object.keys(obj)) {
    const sub = { ...ctx, name: key }
    const t = pyType(obj[key], sub)
    const field = key.replace(/[^A-Za-z0-9_]/g, '_')
    const fieldName = /^[0-9]/.test(field) ? `_${field}` : field
    lines.push(`    ${fieldName}: ${t}`)
    hasField = true
  }
  if (!hasField) lines.push('    pass')
  return lines.join('\n')
}

export function generatePython(value: unknown, rootName = 'Root'): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `${rootName} = ${JSON.stringify(value)}`
  }
  const classes = new Map<string, string>()
  const ctx = { classes, name: rootName }
  classes.set(rootName, pyClassBody(value as Record<string, unknown>, ctx))
  const lines: string[] = [
    'from dataclasses import dataclass',
    'from typing import Any, List, Optional',
    ''
  ]
  for (const [n, body] of classes.entries()) {
    if (n === rootName) continue
    lines.push(body)
    lines.push('')
  }
  lines.push(classes.get(rootName)!)
  return lines.join('\n')
}

// ============= 统一入口 =============

export function generateTypeCode(value: unknown, lang: Lang, rootName = 'Root'): string {
  switch (lang) {
    case 'ts':
      return generateTypeScript(value, rootName)
    case 'go':
      return generateGo(value, rootName)
    case 'java':
      return generateJava(value, rootName)
    case 'python':
      return generatePython(value, rootName)
  }
}
