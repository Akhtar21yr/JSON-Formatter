/**
 * Structural JSON diff (strict JSON values).
 */
import { getType, appendJsonPath } from './json'

function stableEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * @returns {{ path: string, kind: 'added'|'removed'|'changed', before?: unknown, after?: unknown }[]}
 */
export function diffJsonValues(a, b, path = '$') {
  if (stableEqual(a, b)) return []

  const ta = getType(a)
  const tb = getType(b)

  if (ta !== tb || ta !== 'object') {
    return [{ path, kind: 'changed', before: a, after: b }]
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return [{ path, kind: 'changed', before: a, after: b }]
  }

  if (Array.isArray(a)) {
    const out = []
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const p = appendJsonPath(path, i, true)
      if (i >= a.length) out.push({ path: p, kind: 'added', after: b[i] })
      else if (i >= b.length) out.push({ path: p, kind: 'removed', before: a[i] })
      else out.push(...diffJsonValues(a[i], b[i], p))
    }
    return out
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const sorted = [...keys].sort()
  const out = []
  for (const k of sorted) {
    const p = appendJsonPath(path, k, false)
    if (!(k in a)) out.push({ path: p, kind: 'added', after: b[k] })
    else if (!(k in b)) out.push({ path: p, kind: 'removed', before: a[k] })
    else out.push(...diffJsonValues(a[k], b[k], p))
  }
  return out
}
