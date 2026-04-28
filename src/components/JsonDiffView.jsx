/**
 * Compare two JSON documents (strict JSON).
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import ErrorBar from './ErrorBar'
import { safeParse, stringifyJson, deepSortKeys } from '../utils/json'
import { diffJsonValues } from '../utils/diff'

function myersDiff(aLines, bLines) {
  // Myers O((N+M)D) diff on lines.
  const N = aLines.length
  const M = bLines.length
  const max = N + M
  const v = new Map()
  v.set(1, 0)
  const trace = []

  for (let d = 0; d <= max; d++) {
    const vv = new Map(v)
    trace.push(vv)
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))
      const xStart = down ? v.get(k + 1) ?? 0 : (v.get(k - 1) ?? 0) + 1
      let x = xStart
      let y = x - k
      while (x < N && y < M && aLines[x] === bLines[y]) {
        x++
        y++
      }
      v.set(k, x)
      if (x >= N && y >= M) {
        // backtrack
        const ops = []
        let bx = N
        let by = M
        for (let td = trace.length - 1; td >= 0; td--) {
          const tv = trace[td]
          const kNow = bx - by
          const downNow =
            kNow === -td || (kNow !== td && (tv.get(kNow - 1) ?? 0) < (tv.get(kNow + 1) ?? 0))
          const kPrev = downNow ? kNow + 1 : kNow - 1
          const xPrev = tv.get(kPrev) ?? 0
          const yPrev = xPrev - kPrev

          while (bx > xPrev && by > yPrev) {
            ops.push({ type: 'equal', a: aLines[bx - 1], b: bLines[by - 1] })
            bx--
            by--
          }
          if (td === 0) break
          if (downNow) {
            // insertion in B
            ops.push({ type: 'ins', b: bLines[by - 1] })
            by--
          } else {
            // deletion from A
            ops.push({ type: 'del', a: aLines[bx - 1] })
            bx--
          }
        }
        ops.reverse()
        return ops
      }
    }
  }

  return []
}

function buildSideBySideRows(ops) {
  const rows = []
  let aNo = 0
  let bNo = 0
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const next = ops[i + 1]

    if (op.type === 'del' && next?.type === 'ins') {
      aNo++
      bNo++
      rows.push({
        kind: 'changed',
        aNo,
        bNo,
        aText: op.a ?? '',
        bText: next.b ?? '',
      })
      i++
      continue
    }

    if (op.type === 'equal') {
      aNo++
      bNo++
      rows.push({ kind: 'equal', aNo, bNo, aText: op.a ?? '', bText: op.b ?? '' })
      continue
    }

    if (op.type === 'del') {
      aNo++
      rows.push({ kind: 'removed', aNo, bNo: null, aText: op.a ?? '', bText: '' })
      continue
    }

    if (op.type === 'ins') {
      bNo++
      rows.push({ kind: 'added', aNo: null, bNo, aText: '', bText: op.b ?? '' })
    }
  }
  return rows
}

export default function JsonDiffView({ mainInput, onApplyMain, indent = 2, sortKeysOnFormat = false }) {
  const [left, setLeft] = useState(mainInput || '')
  const [right, setRight] = useState('')
  const [showInputs, setShowInputs] = useState(true)
  const hasComparedOnceRef = useRef(false)

  const parsedLeft = useMemo(() => safeParse(left), [left])
  const parsedRight = useMemo(() => safeParse(right), [right])

  const rows = useMemo(() => {
    if (parsedLeft.error || parsedRight.error || !parsedLeft.data || !parsedRight.data) return []
    return diffJsonValues(parsedLeft.data, parsedRight.data)
  }, [parsedLeft, parsedRight])

  const prettyLeft = useMemo(() => {
    if (parsedLeft.error || parsedLeft.data == null) return ''
    return stringifyJson(parsedLeft.data, { indent, sortKeys: false })
  }, [parsedLeft, indent])

  const prettyRight = useMemo(() => {
    if (parsedRight.error || parsedRight.data == null) return ''
    return stringifyJson(parsedRight.data, { indent, sortKeys: false })
  }, [parsedRight, indent])

  const sideBySide = useMemo(() => {
    if (!prettyLeft || !prettyRight) return []
    const aLines = prettyLeft.split('\n')
    const bLines = prettyRight.split('\n')
    const ops = myersDiff(aLines, bLines)
    return buildSideBySideRows(ops)
  }, [prettyLeft, prettyRight])

  // Once we have a valid comparison, allow a clean 2-pane-only view.
  useEffect(() => {
    if (hasComparedOnceRef.current) return
    if (prettyLeft && prettyRight && !parsedLeft.error && !parsedRight.error) {
      hasComparedOnceRef.current = true
    }
  }, [prettyLeft, prettyRight, parsedLeft.error, parsedRight.error])

  // If user hides inputs but docs aren't comparable (especially initial blank right),
  // auto-open inputs until we successfully compare at least once.
  useEffect(() => {
    if (hasComparedOnceRef.current) return
    if (showInputs) return
    const leftEmpty = !String(left || '').trim()
    const rightEmpty = !String(right || '').trim()
    if (leftEmpty || rightEmpty || parsedLeft.error || parsedRight.error) setShowInputs(true)
  }, [left, right, parsedLeft.error, parsedRight.error, showInputs])

  const equal =
    !parsedLeft.error &&
    !parsedRight.error &&
    parsedLeft.data !== null &&
    parsedRight.data !== null &&
    rows.length === 0

  const formatSide = useCallback(
    (side) => {
      const text = side === 'left' ? left : right
      const { data, error } = safeParse(text)
      if (error) return
      const pretty = stringifyJson(data, { indent, sortKeys: sortKeysOnFormat })
      if (side === 'left') setLeft(pretty)
      else setRight(pretty)
    },
    [left, right, indent, sortKeysOnFormat],
  )

  const minifySide = useCallback(
    (side) => {
      const text = side === 'left' ? left : right
      const { data, error } = safeParse(text)
      if (error) return
      const out = stringifyJson(data, { compact: true })
      if (side === 'left') setLeft(out)
      else setRight(out)
    },
    [left, right],
  )

  const sortSide = useCallback(
    (side) => {
      const text = side === 'left' ? left : right
      const { data, error } = safeParse(text)
      if (error) return
      const sorted = deepSortKeys(data)
      const out = stringifyJson(sorted, { indent, sortKeys: false })
      if (side === 'left') setLeft(out)
      else setRight(out)
    },
    [left, right, indent],
  )

  const leftPaneRef = useRef(null)
  const rightPaneRef = useRef(null)
  const syncingRef = useRef(false)
  const syncScroll = useCallback((from) => {
    if (syncingRef.current) return
    const a = leftPaneRef.current
    const b = rightPaneRef.current
    if (!a || !b) return
    syncingRef.current = true
    if (from === 'left') b.scrollTop = a.scrollTop
    else a.scrollTop = b.scrollTop
    window.requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }, [])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0 flex flex-wrap gap-2 items-center justify-between">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Diff</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)]"
            onClick={() => setShowInputs((v) => !v)}
          >
            {showInputs ? 'Hide inputs' : 'Edit inputs'}
          </button>
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)]"
            onClick={() => setLeft(mainInput || '')}
          >
            Load left from main
          </button>
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)]"
            onClick={() => onApplyMain?.(left)}
          >
            Apply left → main
          </button>
        </div>
      </div>

      {showInputs && (
        <div className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--bg0)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 max-h-[45vh] overflow-hidden">
            <div className="flex flex-col min-h-[160px] border-b lg:border-b-0 lg:border-r border-[var(--border)]">
              <div className="flex items-center justify-between px-2 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)]">
                <span>A (left)</span>
                <div className="flex gap-1">
                  <button type="button" className="hover:text-[var(--text)]" onClick={() => formatSide('left')}>
                    Format
                  </button>
                  <button type="button" className="hover:text-[var(--text)]" onClick={() => minifySide('left')}>
                    Minify
                  </button>
                  <button type="button" className="hover:text-[var(--text)]" onClick={() => sortSide('left')}>
                    Sort keys
                  </button>
                </div>
              </div>
              {parsedLeft.error && <ErrorBar error={parsedLeft.error} />}
              <textarea
                value={left}
                onChange={(e) => setLeft(e.target.value)}
                spellCheck={false}
                className="flex-1 min-h-[140px] resize-none bg-[var(--bg0)] text-[var(--text)] p-3 font-mono text-[12px] outline-none border-none"
              />
            </div>

            <div className="flex flex-col min-h-[160px]">
              <div className="flex items-center justify-between px-2 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)]">
                <span>B (right)</span>
                <div className="flex gap-1">
                  <button type="button" className="hover:text-[var(--text)]" onClick={() => formatSide('right')}>
                    Format
                  </button>
                  <button type="button" className="hover:text-[var(--text)]" onClick={() => minifySide('right')}>
                    Minify
                  </button>
                  <button type="button" className="hover:text-[var(--text)]" onClick={() => sortSide('right')}>
                    Sort keys
                  </button>
                </div>
              </div>
              {parsedRight.error && <ErrorBar error={parsedRight.error} />}
              <textarea
                value={right}
                onChange={(e) => setRight(e.target.value)}
                spellCheck={false}
                className="flex-1 min-h-[140px] resize-none bg-[var(--bg0)] text-[var(--text)] p-3 font-mono text-[12px] outline-none border-none"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 border-t border-[var(--border)] bg-[var(--bg0)] overflow-hidden">
        <div className="px-3 py-2 text-[11px] text-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between gap-3">
          {parsedLeft.error || parsedRight.error ? (
            <span>Fix parse errors to compare.</span>
          ) : equal ? (
            <span className="text-[var(--token-string)] font-semibold">Documents are structurally equal.</span>
          ) : (
            <span>
              <strong className="text-[var(--text)]">{rows.length}</strong> difference{rows.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px]">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-900/25 border border-[var(--border2)] mr-2">
              added
            </span>
            <span className="inline-block px-1.5 py-0.5 rounded bg-red-900/25 border border-[var(--border2)] mr-2">
              removed
            </span>
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-900/25 border border-[var(--border2)]">
              changed
            </span>
          </span>
        </div>

        {!parsedLeft.error && !parsedRight.error && parsedLeft.data && parsedRight.data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            <div
              ref={leftPaneRef}
              onScroll={() => syncScroll('left')}
              className="overflow-auto border-b lg:border-b-0 lg:border-r border-[var(--border)]"
            >
              <div className="sticky top-0 z-10 px-3 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)] border-b border-[var(--border)]">
                A (left)
              </div>
              <div className="font-mono text-[12px]">
                {sideBySide.map((r, idx) => (
                  <div
                    key={idx}
                    className={[
                      'grid grid-cols-[64px_1fr] items-start',
                      r.kind === 'added'
                        ? 'bg-emerald-900/20'
                        : r.kind === 'removed'
                          ? 'bg-red-900/20'
                          : r.kind === 'changed'
                            ? 'bg-amber-900/20'
                            : '',
                    ].join(' ')}
                  >
                    <div className="px-3 py-0.5 text-[10px] text-[var(--muted)] select-none border-r border-[var(--border)]">
                      {r.aNo ?? ''}
                    </div>
                    <pre className="m-0 px-3 py-0.5 whitespace-pre-wrap break-words text-[var(--text)]">
                      {r.aText}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            <div
              ref={rightPaneRef}
              onScroll={() => syncScroll('right')}
              className="overflow-auto"
            >
              <div className="sticky top-0 z-10 px-3 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)] border-b border-[var(--border)]">
                B (right)
              </div>
              <div className="font-mono text-[12px]">
                {sideBySide.map((r, idx) => (
                  <div
                    key={idx}
                    className={[
                      'grid grid-cols-[64px_1fr] items-start',
                      r.kind === 'added'
                        ? 'bg-emerald-900/20'
                        : r.kind === 'removed'
                          ? 'bg-red-900/20'
                          : r.kind === 'changed'
                            ? 'bg-amber-900/20'
                            : '',
                    ].join(' ')}
                  >
                    <div className="px-3 py-0.5 text-[10px] text-[var(--muted)] select-none border-r border-[var(--border)]">
                      {r.bNo ?? ''}
                    </div>
                    <pre className="m-0 px-3 py-0.5 whitespace-pre-wrap break-words text-[var(--text)]">
                      {r.bText}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
