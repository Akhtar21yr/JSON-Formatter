/**
 * utils/json.js
 *
 * Pure utility functions for JSON parsing, type detection,
 * stats collection, and key flattening.
 * Kept separate from UI so they're easily testable.
 */

/** Return a simple type string for any JSON value */
export function getType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value   // 'object' | 'string' | 'number' | 'boolean'
}

/**
 * Extract 0-based character index from JSON.parse error message (V8/Chromium style).
 * e.g. "... at position 42"
 */
export function extractJsonErrorPosition(message) {
  if (!message || typeof message !== 'string') return null
  const m = message.match(/position\s+(\d+)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Map 0-based character offset to 1-based line and column (UTF-16 code units, same as JS strings).
 */
export function positionToLineColumn(text, position) {
  if (position < 0 || position > text.length) {
    return { line: 1, column: 1 }
  }
  let line = 1
  let column = 1
  for (let i = 0; i < position && i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

/**
 * Build structured parse error for UI (line/col + jump position).
 */
export function buildParseError(text, message) {
  const position = extractJsonErrorPosition(message)
  const loc =
    position != null ? positionToLineColumn(text, position) : { line: null, column: null }
  return {
    message: message || 'Invalid JSON',
    position: position != null ? position : undefined,
    line: loc.line ?? undefined,
    column: loc.column ?? undefined,
  }
}

/**
 * Safe JSON parse.
 * Returns { data, error } — error is null or a structured object { message, position?, line?, column? }.
 */
export function safeParse(text) {
  try {
    return { data: JSON.parse(text), error: null }
  } catch (err) {
    const msg = err?.message || String(err)
    return { data: null, error: buildParseError(text, msg) }
  }
}

/**
 * Parse "object-like" input into strict JSON.
 * Supported (best-effort):
 * - JS object literal style: `{a: 1, b: 'x', trailing: 2,}`
 * - Python dict style: `{'a': 1, 'b': True, 'c': None}`
 *
 * Notes:
 * - This is a heuristic converter (not a full JS/Python parser).
 * - It intentionally does NOT execute code.
 */
export function safeParseObjectLike(text) {
  const src = String(text ?? '')
  const trimmed = src.trim()
  if (!trimmed) return { data: null, error: buildParseError(src, 'Empty input') }

  // If it's already valid JSON, keep it.
  const strict = safeParse(trimmed)
  if (!strict.error) return strict

  let s = trimmed

  // Python literals → JSON literals (outside of strings; best-effort).
  s = s.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false')

  // Remove trailing commas: { a: 1, } or [1,2,]
  s = s.replace(/,(\s*[}\]])/g, '$1')

  // Quote unquoted object keys: {a:1, foo_bar:2} -> {"a":1,"foo_bar":2}
  // (best-effort; assumes keys are simple identifiers)
  s = s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')

  // Convert single-quoted strings to double-quoted JSON strings.
  // This covers common dict/object usage like {'a': 'x'} or {a:'x'}.
  s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_, inner) => {
    const escaped = String(inner).replace(/"/g, '\\"')
    return `"${escaped}"`
  })

  try {
    return { data: JSON.parse(s), error: null }
  } catch (err) {
    const msg = err?.message || String(err)
    return { data: null, error: buildParseError(src, `Could not convert to JSON: ${msg}`) }
  }
}

/** Normalize error from hook/API for display (string legacy or structured). */
export function formatErrorMessage(error) {
  if (error == null) return ''
  if (typeof error === 'string') return error
  return error.message || ''
}

/** Recursively sort object keys (stable lexicographic). Arrays preserve order. */
export function deepSortKeys(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(deepSortKeys)
  const out = {}
  for (const k of Object.keys(value).sort()) {
    out[k] = deepSortKeys(value[k])
  }
  return out
}

/**
 * Pretty-print or minify with optional key sorting.
 * @param {unknown} data - parsed JSON value
 * @param {{ indent?: number, sortKeys?: boolean, compact?: boolean }} [opts]
 */
export function stringifyJson(data, opts = {}) {
  const { indent = 2, sortKeys = false, compact = false } = opts
  const payload = sortKeys && data !== null && typeof data === 'object' ? deepSortKeys(data) : data
  if (compact) return JSON.stringify(payload)
  return JSON.stringify(payload, null, indent)
}

/**
 * Recursively flatten all leaf key-paths and their values.
 * Used for computing stats (how many strings, numbers, etc.)
 *
 * Example:
 *   flattenLeaves({ a: { b: 1 } }) → [['a.b', 1]]
 */
export function flattenLeaves(obj, path = '') {
  if (obj === null || typeof obj !== 'object') {
    return [[path, obj]]
  }
  return Object.entries(obj).flatMap(([k, v]) =>
    flattenLeaves(v, path ? `${path}.${k}` : k)
  )
}

/**
 * Count total nodes (including nested) for a value.
 * Used to estimate render cost for large JSON.
 */
export function countNodes(value) {
  if (value === null || typeof value !== 'object') return 1
  return Object.values(value).reduce((sum, v) => sum + countNodes(v), 1)
}

/**
 * Compute a stats object for the formatted panel footer.
 * Returns: { total, strings, numbers, booleans, nulls }
 */
export function computeStats(parsed) {
  const leaves = flattenLeaves(parsed)
  const stats = { total: leaves.length, strings: 0, numbers: 0, booleans: 0, nulls: 0 }
  for (const [, v] of leaves) {
    const t = getType(v)
    if (t === 'string')  stats.strings++
    if (t === 'number')  stats.numbers++
    if (t === 'boolean') stats.booleans++
    if (t === 'null')    stats.nulls++
  }
  return stats
}

/**
 * Append a segment to a JSONPath (RFC 9535 style root `$`).
 */
export function appendJsonPath(basePath, key, isArrayIndex) {
  const k = String(key)
  if (isArrayIndex) {
    return `${basePath}[${k}]`
  }
  if (/^[a-zA-Z_$][\w$]*$/.test(k)) {
    return basePath === '$' ? `$.${k}` : `${basePath}.${k}`
  }
  const escaped = k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `${basePath}["${escaped}"]`
}

/**
 * highlightText: split a string around a search query and return
 * an array of [plainText | { match: string }] segments.
 * The component layer converts these to React elements.
 */
export function buildHighlightSegments(text, query, options = {}) {
  const { caseSensitive = false } = options
  if (!query) return [text]
  const segments = []
  let remaining = text
  const needle = caseSensitive ? query : query.toLowerCase()
  while (remaining.length) {
    const hay = caseSensitive ? remaining : remaining.toLowerCase()
    const idx = hay.indexOf(needle)
    if (idx === -1) {
      segments.push(remaining)
      break
    }
    if (idx > 0) segments.push(remaining.slice(0, idx))
    segments.push({ match: remaining.slice(idx, idx + query.length) })
    remaining = remaining.slice(idx + query.length)
  }
  return segments
}

/**
 * Count matches of `query` within a JSON value.
 * - keysOnly: count key matches only
 * - valuesOnly: count primitive value matches only
 */
export function countSearchMatches(value, query, options = {}) {
  const { keysOnly = false, valuesOnly = false, caseSensitive = false } = options
  const q = (query || '').trim()
  if (!q) return 0

  const needle = caseSensitive ? q : q.toLowerCase()
  const hit = (text) => {
    const s = String(text)
    if (caseSensitive) return s.includes(needle)
    return s.toLowerCase().includes(needle)
  }

  const countValueHit = (v) => v === null || typeof v !== 'object'

  let count = 0
  const stack = [{ v: value }]
  while (stack.length) {
    const { v } = stack.pop()
    if (v === null || typeof v !== 'object') continue

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        // key hit on index
        if (!valuesOnly && hit(i)) count += 1
        const child = v[i]
        if (!keysOnly && countValueHit(child) && hit(child)) count += 1
        if (child !== null && typeof child === 'object') stack.push({ v: child })
      }
      continue
    }

    for (const [k, child] of Object.entries(v)) {
      if (!valuesOnly && hit(k)) count += 1
      if (!keysOnly && countValueHit(child) && hit(child)) count += 1
      if (child !== null && typeof child === 'object') stack.push({ v: child })
    }
  }

  return count
}

/** Convert a JSONPath to a stable DOM id. */
export function jsonPathToDomId(jsonPath) {
  return `jp_${String(jsonPath).replace(/[^a-zA-Z0-9_-]+/g, '_')}`
}

/**
 * Collect unique JSONPaths of nodes that match the query.
 * Returns JSONPaths suitable for scrolling to nodes in the tree.
 */
export function collectSearchMatchPaths(value, query, options = {}) {
  const { keysOnly = false, valuesOnly = false, caseSensitive = false } = options
  const q = (query || '').trim()
  if (!q) return []

  const needle = caseSensitive ? q : q.toLowerCase()
  const hit = (text) => {
    const s = String(text)
    if (caseSensitive) return s.includes(needle)
    return s.toLowerCase().includes(needle)
  }

  const out = new Set()
  const stack = [{ v: value, path: '$' }]

  while (stack.length) {
    const { v, path } = stack.pop()
    if (v === null || typeof v !== 'object') continue

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const child = v[i]
        const childPath = appendJsonPath(path, i, true)
        if (!valuesOnly && hit(i)) out.add(childPath)
        if (!keysOnly && (child === null || typeof child !== 'object') && hit(child)) out.add(childPath)
        if (child !== null && typeof child === 'object') stack.push({ v: child, path: childPath })
      }
      continue
    }

    for (const [k, child] of Object.entries(v)) {
      const childPath = appendJsonPath(path, k, false)
      if (!valuesOnly && hit(k)) out.add(childPath)
      if (!keysOnly && (child === null || typeof child !== 'object') && hit(child)) out.add(childPath)
      if (child !== null && typeof child === 'object') stack.push({ v: child, path: childPath })
    }
  }

  return [...out]
}

/**
 * Immutably set a value at a path (array of keys/indices) within a JSON value.
 * @param {any} root
 * @param {(string|number)[]} path
 * @param {any} nextValue
 */
export function setJsonAtPath(root, path, nextValue) {
  if (!path || path.length === 0) return nextValue
  const [head, ...rest] = path
  if (Array.isArray(root)) {
    const idx = Number(head)
    const copy = root.slice()
    copy[idx] = setJsonAtPath(root[idx], rest, nextValue)
    return copy
  }
  if (root !== null && typeof root === 'object') {
    const copy = { ...root }
    copy[head] = setJsonAtPath(root[head], rest, nextValue)
    return copy
  }
  // If the structure doesn't match, just replace at this point.
  return nextValue
}