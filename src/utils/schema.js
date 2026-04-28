/**
 * Infer a JSON Schema (draft-07 style) from a single JSON sample.
 */

function mergeItemSchemas(schemas) {
  const seen = new Map()
  for (const s of schemas) {
    const key = JSON.stringify(s)
    seen.set(key, s)
  }
  const uniq = [...seen.values()]
  if (uniq.length === 1) return uniq[0]
  return { anyOf: uniq }
}

function inferValue(value) {
  if (value === null) return { type: 'null' }

  const t = typeof value
  if (t === 'string') return { type: 'string' }
  if (t === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' }
  if (t === 'boolean') return { type: 'boolean' }

  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: {} }
    const items = mergeItemSchemas(value.map(inferValue))
    return { type: 'array', items }
  }

  const properties = {}
  const keys = Object.keys(value).sort()
  for (const k of keys) {
    properties[k] = inferValue(value[k])
  }
  return {
    type: 'object',
    properties,
    required: keys,
    additionalProperties: false,
  }
}

/**
 * @param {unknown} sample - parsed JSON
 * @returns {Record<string, unknown>}
 */
export function inferJsonSchema(sample) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...inferValue(sample),
  }
}
