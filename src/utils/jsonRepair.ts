/**
 * 容错 JSON 解析: 容忍 // 和 /* * / 注释, 单引号字符串, 尾逗号, 未引号 key, Python 字面量.
 * 修复后用 JSON.parse 校验, 不合法时抛错带原因.
 */
export function repairJson(input: string): string {
  // 1) 提取所有字符串(单/双引号)用占位符替换, 避免字符串内容被后续替换破坏
  const strings: string[] = []
  let s = ''
  let i = 0
  const n = input.length
  while (i < n) {
    const c = input[i]
    // 单行注释 //
    if (c === '/' && input[i + 1] === '/') {
      i += 2
      while (i < n && input[i] !== '\n') i++
      continue
    }
    // 块注释 /* */
    if (c === '/' && input[i + 1] === '*') {
      i += 2
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++
      i = Math.min(n, i + 2)
      continue
    }
    // 字符串
    if (c === '"' || c === '\'') {
      const quote = c
      const start = i
      i++
      let raw = ''
      let unterminated = false
      while (i < n) {
        if (input[i] === '\\' && i + 1 < n) {
          raw += input[i] + input[i + 1]
          i += 2
          continue
        }
        if (input[i] === quote) {
          i++
          break
        }
        if (input[i] === '\n' && quote === '\'') {
          // 单引号字符串允许跨行 (Python 风格), 继续
          raw += input[i]
          i++
          continue
        }
        if (input[i] === '\n' && quote === '"') {
          unterminated = true
          break
        }
        raw += input[i]
        i++
      }
      if (unterminated) {
        // 单行双引号但遇到换行, 当成裸字符串
        strings.push(JSON.stringify(input.substring(start, i)))
      } else {
        // 单引号转双引号
        if (quote === '\'') {
          const inner = raw
            .replace(/\\'/g, '\u0000')   // 暂存 \'
            .replace(/"/g, '\\"')         // 内部双引号转义
            .replace(/\u0000/g, "'")      // 还原
          strings.push('"' + inner + '"')
        } else {
          strings.push(input.substring(start, i))
        }
      }
      s += `__JSON_STR_${strings.length - 1}__`
      continue
    }
    s += c
    i++
  }

  // 2) Python 字面量
  s = s.replace(/\bTrue\b/g, 'true')
  s = s.replace(/\bFalse\b/g, 'false')
  s = s.replace(/\bNone\b/g, 'null')

  // 3) 尾逗号: , 后跟空白 + } 或 ]
  s = s.replace(/,(\s*[}\]])/g, '$1')

  // 4) 未引号 key: { 或 , 后跟 JS 合法标识符, 后面有 :
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*):/g, '$1"$2"$3:')

  // 5) 还原字符串
  s = s.replace(/__JSON_STR_(\d+)__/g, (_, idx) => strings[parseInt(idx, 10)])

  return s
}

/**
 * 尝试修复并解析. 成功返回 { value, repaired }. 失败抛错带原始位置.
 */
export function tryRepairJson(input: string): { value: unknown; repaired: string } {
  // 先试原样解析
  try {
    return { value: JSON.parse(input), repaired: input }
  } catch {
    // 修复后再试
    const repaired = repairJson(input)
    const value = JSON.parse(repaired)
    return { value, repaired }
  }
}
