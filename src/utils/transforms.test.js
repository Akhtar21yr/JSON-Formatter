import { describe, it, expect } from 'vitest'
import { removeNulls, pickTopLevelKeys, renameTopLevelKey, mapArrayPickFields } from './transforms'

describe('transforms', () => {
  it('removeNulls removes nested nulls', () => {
    expect(removeNulls({ a: null, b: { c: null, d: 1 } })).toEqual({ b: { d: 1 } })
  })

  it('pickTopLevelKeys filters keys', () => {
    expect(pickTopLevelKeys({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ b: 2 })
  })

  it('renameTopLevelKey renames', () => {
    expect(renameTopLevelKey({ old: 1 }, 'old', 'new')).toEqual({ new: 1 })
  })

  it('mapArrayPickFields picks fields', () => {
    const arr = [{ a: 1, b: 2 }, { a: 3 }]
    expect(mapArrayPickFields(arr, ['a'])).toEqual([{ a: 1 }, { a: 3 }])
  })
})
