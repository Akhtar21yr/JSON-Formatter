import { describe, it, expect } from 'vitest'
import {
  safeParse,
  safeParseObjectLike,
  positionToLineColumn,
  extractJsonErrorPosition,
  stringifyJson,
  deepSortKeys,
  appendJsonPath,
  formatErrorMessage,
} from './json'

describe('safeParse', () => {
  it('parses valid JSON', () => {
    const { data, error } = safeParse('{"a":1}')
    expect(error).toBeNull()
    expect(data).toEqual({ a: 1 })
  })

  it('returns structured error with position', () => {
    const bad = '{ bad'
    const { error } = safeParse(bad)
    expect(error).toBeTruthy()
    expect(error.message).toBeTruthy()
    expect(formatErrorMessage(error)).toBe(error.message)
    const pos = extractJsonErrorPosition(error.message)
    expect(typeof pos).toBe('number')
    expect(pos).toBeGreaterThanOrEqual(0)
  })
})

describe('safeParseObjectLike', () => {
  it('parses JS object-like input', () => {
    const { data, error } = safeParseObjectLike("{a: 1, b: 'x', trailing: 2,}")
    expect(error).toBeNull()
    expect(data).toEqual({ a: 1, b: 'x', trailing: 2 })
  })

  it('parses Python dict-like input', () => {
    const { data, error } = safeParseObjectLike("{'a': 1, 'ok': True, 'n': None, 'arr': [1,2,],}")
    expect(error).toBeNull()
    expect(data).toEqual({ a: 1, ok: true, n: null, arr: [1, 2] })
  })
})

describe('positionToLineColumn', () => {
  it('maps offsets to 1-based line/col', () => {
    const text = '{\n  "x": 1\n}'
    expect(positionToLineColumn(text, 0)).toEqual({ line: 1, column: 1 })
    expect(positionToLineColumn(text, text.indexOf('"x"'))).toMatchObject({ line: 2 })
  })
})

describe('stringifyJson / deepSortKeys', () => {
  it('pretty-prints with indent', () => {
    expect(stringifyJson({ b: 2, a: 1 }, { indent: 2 })).toContain('"a"')
  })

  it('sorts keys when requested', () => {
    const sorted = deepSortKeys({ b: 1, a: { d: 2, c: 3 } })
    expect(Object.keys(sorted)).toEqual(['a', 'b'])
    expect(Object.keys(sorted.a)).toEqual(['c', 'd'])
  })

  it('minifies with compact', () => {
    expect(stringifyJson({ a: 1 }, { compact: true })).toBe('{"a":1}')
  })
})

describe('appendJsonPath', () => {
  it('builds paths', () => {
    expect(appendJsonPath('$', 'foo', false)).toBe('$.foo')
    expect(appendJsonPath('$.foo', 0, true)).toBe('$.foo[0]')
    expect(appendJsonPath('$', 'x y', false)).toContain('["x y"]')
  })
})
