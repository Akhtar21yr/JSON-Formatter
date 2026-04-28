/**
 * hooks/useJsonParser.js
 *
 * Encapsulates all JSON parsing state:
 *  - raw input text
 *  - parsed result
 *  - parse error (structured)
 *  - formatted string (memoized)
 *  - stats (memoized)
 */
import { useState, useMemo, useCallback } from 'react'
import {
  safeParse,
  computeStats,
  stringifyJson,
  deepSortKeys,
} from '../utils/json'

const SAMPLE_JSON = `{
  "name": "JSON Formatter Pro",
  "version": "1.0.0",
  "users": [
    { "id": 1, "name": "Adeel Solangi", "active": true },
    { "id": 2, "name": "Afzal Ghaffar", "active": false }
  ],
  "meta": {
    "generatedAt": "2026-04-28T00:00:00.000Z",
    "notes": "Replace this with your own JSON and click Apply."
  }
}`

const INITIAL_INPUT = ''
const INITIAL_PARSED = INITIAL_INPUT ? safeParse(INITIAL_INPUT).data : null

/**
 * @param {{ indent?: number, sortKeysOnFormat?: boolean }} [options]
 */
export default function useJsonParser(options = {}) {
  const { indent = 2, sortKeysOnFormat = false } = options

  const [input, setInput] = useState(INITIAL_INPUT)
  const [parsed, setParsed] = useState(INITIAL_PARSED)
  const [error, setError] = useState(null)

  /** Re-parse whenever input changes */
  const handleInput = useCallback((text) => {
    setInput(text)
    const { data, error: err } = safeParse(text)
    setParsed(data)
    setError(err)
  }, [])

  /** Format: pretty-print then push back to input */
  const handleFormat = useCallback(() => {
    const { data, error: err } = safeParse(input)
    if (err) {
      setError(err)
      return
    }
    const pretty = stringifyJson(data, { indent, sortKeys: sortKeysOnFormat })
    setInput(pretty)
    setParsed(data)
    setError(null)
  }, [input, indent, sortKeysOnFormat])

  /** Minify to one line */
  const handleMinify = useCallback(() => {
    const { data, error: err } = safeParse(input)
    if (err) {
      setError(err)
      return
    }
    setInput(stringifyJson(data, { compact: true }))
    setParsed(data)
    setError(null)
  }, [input])

  /** Deep sort keys then pretty-print */
  const handleSortKeys = useCallback(() => {
    const { data, error: err } = safeParse(input)
    if (err) {
      setError(err)
      return
    }
    const sorted = deepSortKeys(data)
    setInput(stringifyJson(sorted, { indent, sortKeys: false }))
    setParsed(sorted)
    setError(null)
  }, [input, indent])

  /** Memoized formatted string */
  const formatted = useMemo(
    () => (parsed ? stringifyJson(parsed, { indent, sortKeys: false }) : ''),
    [parsed, indent],
  )

  /** Memoized leaf stats for status bar */
  const stats = useMemo(() => (parsed ? computeStats(parsed) : null), [parsed])

  return {
    input,
    parsed,
    error,
    formatted,
    stats,
    handleInput,
    handleFormat,
    handleMinify,
    handleSortKeys,
  }
}
