import { describe, it, expect } from 'vitest'
import { inferJsonSchema } from './schema'

describe('inferJsonSchema', () => {
  it('infers primitives and objects', () => {
    const schema = inferJsonSchema({ id: 1, name: 'x', meta: { ok: true }, tags: ['a', 1] })
    expect(schema.type).toBe('object')
    expect(schema.properties.id.type).toBe('integer')
    expect(schema.properties.name.type).toBe('string')
    expect(schema.properties.meta.type).toBe('object')
    expect(schema.properties.tags.type).toBe('array')
    expect(schema.properties.tags.items.anyOf).toBeTruthy()
  })
})
