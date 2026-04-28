/**
 * Pure JSON transforms (strict JSON values).
 */
import { deepSortKeys } from './json'

export function removeNulls(value) {
  if (value === null) return undefined
  if (Array.isArray(value)) {
    const arr = value.map(removeNulls).filter((v) => v !== undefined)
    return arr
  }
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const nv = removeNulls(v)
      if (nv !== undefined) out[k] = nv
    }
    return out
  }
  return value
}

export function pickTopLevelKeys(obj, keys) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const set = new Set(keys)
  const out = {}
  for (const k of Object.keys(obj)) {
    if (set.has(k)) out[k] = obj[k]
  }
  return out
}

export function renameTopLevelKey(obj, from, to) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj
  if (!(from in obj) || from === to) return { ...obj }
  const out = { ...obj }
  out[to] = out[from]
  delete out[from]
  return out
}

export function mapArrayPickFields(arr, fields) {
  if (!Array.isArray(arr)) return arr
  const fs = fields.filter(Boolean)
  return arr.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item
    const row = {}
    for (const f of fs) {
      if (Object.prototype.hasOwnProperty.call(item, f)) row[f] = item[f]
    }
    return row
  })
}

export const recipes = {
  sortKeys: (data) => deepSortKeys(data),
  removeNulls: (data) => removeNulls(data),
  pickKeys: (data, params) => {
    const keys = (params.keys || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return pickTopLevelKeys(data, keys)
  },
  renameKey: (data, params) => renameTopLevelKey(data, params.from || '', params.to || ''),
  mapArrayPick: (data, params) => {
    const fields = (params.fields || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return mapArrayPickFields(data, fields)
  },
}
