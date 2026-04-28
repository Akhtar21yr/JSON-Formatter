/**
 * Convert "dict/object-like" text into strict JSON.
 * Examples:
 * - JS object literal: {a: 1, b: 'x'}
 * - Python dict: {'a': 1, 'ok': True, 'n': None}
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import ErrorBar from './ErrorBar'
import { safeParseObjectLike, stringifyJson } from '../utils/json'

export default function ObjectToJsonView({
  mainInput,
  onApplyMain,
  indent = 2,
  sortKeysOnFormat = false,
  onOutputChange,
}) {
  const [src, setSrc] = useState('')

  const parsed = useMemo(() => safeParseObjectLike(src), [src])
  const out = useMemo(() => {
    if (parsed.error || parsed.data == null) return ''
    return stringifyJson(parsed.data, { indent, sortKeys: sortKeysOnFormat })
  }, [parsed, indent, sortKeysOnFormat])

  useEffect(() => {
    onOutputChange?.(out)
  }, [out, onOutputChange])

  const copyOut = useCallback(async () => {
    if (!out) return
    try {
      await navigator.clipboard.writeText(out)
    } catch {
      /* ignore */
    }
  }, [out])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0 flex flex-wrap gap-2 items-center justify-between">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Object → JSON</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)]"
            onClick={() => setSrc(mainInput || '')}
            title="Load from main editor"
          >
            Load from main
          </button>
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)] disabled:opacity-40"
            onClick={copyOut}
            disabled={!out}
            title="Copy output JSON"
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)] disabled:opacity-40"
            onClick={() => onApplyMain?.(out)}
            disabled={!out}
            title="Replace main editor JSON with converted output"
          >
            Apply → main
          </button>
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)]"
            onClick={() => setSrc('')}
            title="Clear"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col min-h-[180px] border-b lg:border-b-0 lg:border-r border-[var(--border)]">
          <div className="px-2 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)] border-b border-[var(--border)]">
            Paste dict/object here
          </div>
          <textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            placeholder={`Examples:\n{a: 1, b: 'x'}\n{'a': 1, 'ok': True, 'n': None}\n`}
            spellCheck={false}
            className="flex-1 min-h-[140px] resize-none bg-[var(--bg0)] text-[var(--text)] p-3 font-mono text-[12px] outline-none border-none"
          />
        </div>

        <div className="flex-1 flex flex-col min-h-[180px]">
          <div className="px-2 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between">
            <span>Strict JSON output</span>
            <span className="text-[10px] text-[var(--muted)]">
              {out ? `${out.split('\n').length} lines` : ''}
            </span>
          </div>

          {src.trim() && parsed.error && <ErrorBar error={parsed.error} />}

          <pre className="flex-1 m-0 min-h-[140px] overflow-auto bg-[var(--bg0)] text-[var(--text)] p-3 font-mono text-[12px] border-none">
            {out || ''}
          </pre>
        </div>
      </div>
    </div>
  )
}

