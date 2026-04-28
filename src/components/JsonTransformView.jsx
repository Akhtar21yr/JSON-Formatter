/**
 * Apply recipe transforms to JSON; output can replace main document.
 */
import { useState, useMemo, useCallback } from 'react'
import ErrorBar from './ErrorBar'
import { stringifyJson } from '../utils/json'
import { recipes } from '../utils/transforms'

const RECIPE_LIST = [
  { id: 'sortKeys', label: 'Sort keys (deep)' },
  { id: 'removeNulls', label: 'Remove nulls (deep)' },
  { id: 'pickKeys', label: 'Pick top-level keys (comma-separated)' },
  { id: 'renameKey', label: 'Rename top-level key' },
  { id: 'mapArrayPick', label: 'Array: pick fields from each object' },
]

export default function JsonTransformView({ input, parsed, error, onApplyMain, indent = 2 }) {
  const [recipe, setRecipe] = useState('sortKeys')
  const [params, setParams] = useState({ keys: '', from: '', to: '', fields: '' })

  const result = useMemo(() => {
    if (!parsed) return { text: '', err: null }
    try {
      const fn = recipes[recipe]
      if (!fn) return { text: '', err: { message: 'Unknown recipe' } }
      let out
      if (recipe === 'pickKeys' || recipe === 'renameKey' || recipe === 'mapArrayPick') {
        out = fn(parsed, params)
      } else {
        out = fn(parsed)
      }
      return { text: stringifyJson(out, { indent }), err: null }
    } catch (e) {
      return { text: '', err: { message: e?.message || String(e) } }
    }
  }, [parsed, recipe, params, indent])

  const applyOutput = useCallback(() => {
    if (result.text) onApplyMain?.(result.text)
  }, [result.text, onApplyMain])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Transform</span>
      </div>

      {error && <ErrorBar error={error} />}

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-[140px] border-b md:border-b-0 md:border-r border-[var(--border)]">
          <div className="px-2 py-1 text-[10px] text-[var(--muted)] bg-[var(--bg2)]">Source (main document)</div>
          <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-[var(--text)] bg-[var(--bg0)] whitespace-pre-wrap break-all">
            {input || '— empty —'}
          </pre>
        </div>

        <div className="w-full md:w-72 flex-shrink-0 flex flex-col gap-3 p-3 bg-[var(--bg1)] overflow-auto border-b md:border-b-0 md:border-r border-[var(--border)]">
          <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
            Recipe
            <select
              value={recipe}
              onChange={(e) => setRecipe(e.target.value)}
              className="bg-[var(--bg2)] border border-[var(--border2)] rounded px-2 py-1.5 text-[var(--text)]"
            >
              {RECIPE_LIST.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          {recipe === 'pickKeys' && (
            <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
              Keys (comma-separated)
              <input
                value={params.keys}
                onChange={(e) => setParams((p) => ({ ...p, keys: e.target.value }))}
                className="bg-[var(--bg2)] border border-[var(--border2)] rounded px-2 py-1 text-[var(--text)]"
                placeholder="id,name,meta"
              />
            </label>
          )}

          {recipe === 'renameKey' && (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
                From
                <input
                  value={params.from}
                  onChange={(e) => setParams((p) => ({ ...p, from: e.target.value }))}
                  className="bg-[var(--bg2)] border border-[var(--border2)] rounded px-2 py-1 text-[var(--text)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
                To
                <input
                  value={params.to}
                  onChange={(e) => setParams((p) => ({ ...p, to: e.target.value }))}
                  className="bg-[var(--bg2)] border border-[var(--border2)] rounded px-2 py-1 text-[var(--text)]"
                />
              </label>
            </div>
          )}

          {recipe === 'mapArrayPick' && (
            <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
              Fields (comma-separated)
              <input
                value={params.fields}
                onChange={(e) => setParams((p) => ({ ...p, fields: e.target.value }))}
                className="bg-[var(--bg2)] border border-[var(--border2)] rounded px-2 py-1 text-[var(--text)]"
                placeholder="id,name"
              />
            </label>
          )}

          <button
            type="button"
            disabled={!result.text || !!result.err || !parsed}
            onClick={applyOutput}
            className="mt-auto text-[11px] px-3 py-2 rounded-md bg-[var(--accent)] text-white border border-[var(--accent-hover)] hover:opacity-90 disabled:opacity-40"
          >
            Apply output → main
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-[140px]">
          <div className="px-2 py-1 text-[10px] text-[var(--muted)] bg-[var(--bg2)] flex justify-between items-center">
            <span>Output</span>
            {result.err && <span className="text-[var(--token-null)]">Error</span>}
          </div>
          {result.err && <ErrorBar error={result.err} />}
          <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-[var(--text)] bg-[var(--bg0)] whitespace-pre-wrap break-words">
            {parsed ? result.text || '—' : 'Fix main JSON first.'}
          </pre>
        </div>
      </div>
    </div>
  )
}
