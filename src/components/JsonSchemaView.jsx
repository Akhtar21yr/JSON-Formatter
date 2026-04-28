/**
 * Infer JSON Schema from the current valid parsed document.
 */
import { useMemo, useCallback } from 'react'
import ErrorBar from './ErrorBar'
import { inferJsonSchema } from '../utils/schema'
import { stringifyJson } from '../utils/json'

export default function JsonSchemaView({ parsed, error, onApplyMain }) {
  const schemaObj = useMemo(() => (parsed != null ? inferJsonSchema(parsed) : null), [parsed])

  const text = useMemo(
    () => (schemaObj ? stringifyJson(schemaObj, { indent: 2 }) : ''),
    [schemaObj],
  )

  const handleCopy = useCallback(() => {
    if (!text) return
    navigator.clipboard.writeText(text)
  }, [text])

  const handleDownload = useCallback(() => {
    if (!text) return
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: 'schema.json' })
    a.click()
    URL.revokeObjectURL(url)
  }, [text])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0 flex-wrap gap-2">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Schema</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!text}
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)] disabled:opacity-40"
            onClick={handleCopy}
          >
            Copy schema
          </button>
          <button
            type="button"
            disabled={!text}
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)] disabled:opacity-40"
            onClick={handleDownload}
          >
            Download
          </button>
          <button
            type="button"
            disabled={!text}
            className="text-[11px] px-2 py-1 rounded bg-[var(--accent)] text-white border border-[var(--accent-hover)] hover:opacity-90 disabled:opacity-40"
            onClick={() => onApplyMain?.(text)}
            title="Replace main editor JSON with this schema JSON"
          >
            Apply schema → main
          </button>
        </div>
      </div>

      {error && <ErrorBar error={error} />}
      {!parsed && !error && (
        <div className="px-4 py-2 text-[12px] text-[var(--muted)]">No valid JSON in main document — fix input first.</div>
      )}

      {text ? (
        <pre className="flex-1 overflow-auto p-4 text-[12px] font-mono text-[var(--text)] bg-[var(--bg0)] whitespace-pre-wrap break-words">
          {text}
        </pre>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">Inferring schema requires valid JSON.</div>
      )}
    </div>
  )
}
