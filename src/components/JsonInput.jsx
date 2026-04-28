/**
 * components/JsonInput.jsx
 *
 * The raw text editor pane. Features:
 *  - Controlled textarea
 *  - Drag-and-drop JSON file upload
 *  - Inline error banner
 *  - Character count in header
 *  - Jump to error position (structured errors)
 */
import { useState, useCallback, useRef } from 'react'
import ErrorBar from './ErrorBar'
import { safeParse, stringifyJson } from '../utils/json'

export default function JsonInput({
  value,
  error,
  onChange,
  onDrop,
  indent = 2,
  sortKeysOnFormat = false,
}) {
  const [dragging, setDragging] = useState(false)
  const taRef = useRef(null)

  const jumpToError = useCallback(() => {
    if (!error || typeof error !== 'object' || error.position == null) return
    const el = taRef.current
    if (!el) return
    const pos = Math.min(error.position, value.length)
    el.focus()
    el.setSelectionRange(pos, Math.min(pos + 1, value.length))
    el.scrollIntoView({ block: 'nearest' })
  }, [error, value])

  const handleDragOver = useCallback(e => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragging(false), [])

  const handleDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onDrop(ev.target.result)
    reader.readAsText(file)
  }, [onDrop])

  const handlePaste = useCallback(
    (e) => {
      const text = e.clipboardData?.getData('text') ?? ''
      const trimmed = text.trim()
      if (!trimmed) return
      const { data, error: err } = safeParse(trimmed)
      if (!err && data !== undefined) {
        e.preventDefault()
        onChange(stringifyJson(data, { indent, sortKeys: sortKeysOnFormat }))
      }
    },
    [indent, sortKeysOnFormat, onChange],
  )

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="
          absolute inset-0 z-10 border-2 border-dashed border-[var(--accent)]
          bg-blue-900/10 rounded-md flex items-center justify-center
          text-[var(--accent)] text-sm pointer-events-none
        ">
          Drop JSON file here
        </div>
      )}

      {/* Pane header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Input</span>
        <span className="text-[11px] text-[var(--muted)]">{value.length.toLocaleString()} chars</span>
      </div>

      {error && (
        <ErrorBar
          id="json-input-error"
          error={error}
          extra={
            error && typeof error === 'object' && error.position != null ? (
              <button
                type="button"
                onClick={jumpToError}
                className="
                  self-start mt-1 px-2 py-1 rounded text-[11px] font-semibold
                  bg-[var(--bg2)] border border-[var(--border2)] text-[var(--text)]
                  hover:bg-[var(--bg3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                "
              >
                Jump to error
              </button>
            ) : null
          }
        />
      )}

      {/* Editor */}
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onPaste={handlePaste}
        aria-invalid={!!error}
        aria-describedby={error ? 'json-input-error' : undefined}
        placeholder={'Paste your JSON here...\n\nOr drag and drop a .json file.'}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="
          flex-1 resize-none outline-none border-none
          bg-[var(--bg0)] text-[var(--text)]
          px-4 py-3.5 leading-7
          font-mono text-[13px]
        "
      />
    </div>
  )
}