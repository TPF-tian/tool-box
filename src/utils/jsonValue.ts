export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export function isContainer(v: JsonValue): v is JsonValue[] | { [key: string]: JsonValue } {
  return v !== null && typeof v === 'object'
}

export function isArray(v: JsonValue): v is JsonValue[] {
  return Array.isArray(v)
}

// 用 JSON.stringify 编码路径,避免 key 含 '.' 时冲突
export function pathKey(path: (string | number)[]): string {
  return JSON.stringify(path)
}
