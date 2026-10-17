/** Minimal parser for Valve's text KeyValues format (.vdf / .acf). */
export type VdfObject = { [key: string]: string | VdfObject }

export function parseVdf(text: string): VdfObject {
  let i = 0
  const n = text.length

  const skipWs = (): void => {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') i++
      else if (c === '/' && text[i + 1] === '/') while (i < n && text[i] !== '\n') i++
      else break
    }
  }

  const quoted = (): string => {
    i++ // opening quote
    let out = ''
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < n) {
        const e = text[i + 1]
        out += e === 'n' ? '\n' : e === 't' ? '\t' : e
        i += 2
      } else {
        out += text[i++]
      }
    }
    i++ // closing quote
    return out
  }

  const token = (): string => {
    if (text[i] === '"') return quoted()
    const start = i
    while (i < n && !/[\s{}"]/.test(text[i])) i++
    return text.slice(start, i)
  }

  const object = (): VdfObject => {
    const obj: VdfObject = {}
    for (;;) {
      skipWs()
      if (i >= n) return obj
      if (text[i] === '}') {
        i++
        return obj
      }
      const key = token()
      skipWs()
      if (text[i] === '{') {
        i++
        obj[key] = object()
      } else {
        obj[key] = token()
      }
    }
  }

  return object()
}

/** Case-insensitive lookup: Valve is inconsistent about key casing ("AppState" vs "appstate"). */
export function vdfGet(obj: VdfObject | undefined, key: string): string | VdfObject | undefined {
  if (!obj) return undefined
  if (key in obj) return obj[key]
  const lower = key.toLowerCase()
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k]
  return undefined
}

export function vdfObj(obj: VdfObject | undefined, key: string): VdfObject | undefined {
  const v = vdfGet(obj, key)
  return typeof v === 'object' ? v : undefined
}

export function vdfStr(obj: VdfObject | undefined, key: string): string | undefined {
  const v = vdfGet(obj, key)
  return typeof v === 'string' ? v : undefined
}
