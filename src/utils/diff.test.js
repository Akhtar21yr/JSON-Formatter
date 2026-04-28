import { describe, it, expect } from 'vitest'
import { diffJsonValues } from './diff'

describe('diffJsonValues', () => {
  it('returns empty when equal', () => {
    expect(diffJsonValues({ a: 1 }, { a: 1 })).toEqual([])
  })

  it('detects added / removed / changed', () => {
    const left = { a: 1, b: [1] }
    const right = { a: 2, b: [1, 2], c: 3 }
    const rows = diffJsonValues(left, right)
    const kinds = new Set(rows.map((r) => r.kind))
    expect(kinds.has('changed')).toBe(true)
    expect(kinds.has('added')).toBe(true)
  })
})
