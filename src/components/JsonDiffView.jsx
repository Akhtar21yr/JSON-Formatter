/**
 * Compare two JSON documents (strict JSON).
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
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

function tokenizeForIntraline(s) {
  // Keep whitespace tokens so formatting stays stable.
  return String(s ?? '').split(/(\s+)/).filter((t) => t.length > 0)
}

function buildHighlightedSegments(aText, bText) {
  const aToks = tokenizeForIntraline(aText)
  const bToks = tokenizeForIntraline(bText)
  const ops = myersDiff(aToks, bToks)

  const aSegs = []
  const bSegs = []

  for (const op of ops) {
    if (op.type === 'equal') {
      aSegs.push({ kind: 'equal', text: op.a ?? '' })
      bSegs.push({ kind: 'equal', text: op.b ?? '' })
      continue
    }
    if (op.type === 'del') {
      aSegs.push({ kind: 'del', text: op.a ?? '' })
      continue
    }
    if (op.type === 'ins') {
      bSegs.push({ kind: 'ins', text: op.b ?? '' })
    }
  }

  return { aSegs, bSegs }
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
      const { aSegs, bSegs } = buildHighlightedSegments(op.a ?? '', next.b ?? '')
      rows.push({
        kind: 'changed',
        aNo,
        bNo,
        aText: op.a ?? '',
        bText: next.b ?? '',
        aSegs,
        bSegs,
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

function Segments({ segs, side }) {
  if (!segs?.length) return null
  const cls =
    side === 'left'
      ? {
          del: 'bg-red-700/35 text-[var(--text)] rounded-sm',
          ins: '',
          equal: '',
        }
      : {
          del: '',
          ins: 'bg-emerald-700/35 text-[var(--text)] rounded-sm',
          equal: '',
        }
  return (
    <>
      {segs.map((seg, i) => (
        <span key={i} className={cls[seg.kind] || ''}>
          {seg.text}
        </span>
      ))}
    </>
  )
}

function buildPerSideLineModels(sideBySide) {
  const leftLines = []
  const rightLines = []

  for (const r of sideBySide) {
    if (r.aNo != null) {
      leftLines.push({
        kind: r.kind,
        text: r.aText ?? '',
        segs: r.kind === 'changed' ? r.aSegs : null,
      })
    }
    if (r.bNo != null) {
      rightLines.push({
        kind: r.kind,
        text: r.bText ?? '',
        segs: r.kind === 'changed' ? r.bSegs : null,
      })
    }
  }

  return { leftLines, rightLines }
}

function HighlightedEditor({ value, onChange, lineModel, side, placeholder }) {
  const textLineCount = Math.max(1, String(value ?? '').split('\n').length)
  const modelLineCount = Math.max(1, lineModel?.length ?? 0)
  const lineCount = Math.max(textLineCount, modelLineCount)
  const minHeightPx = lineCount * 20 + 8 // leading-5 ~= 20px
  const gutterWidthPx = 64 // must match grid-cols-[64px_1fr]
  const textPadXPx = 12 // Tailwind px-3
  const textPadYPx = 2 // Tailwind py-0.5 (approx)
  const bgFor = (kind) => {
    if (kind === 'added') return 'bg-emerald-900/20'
    if (kind === 'removed') return 'bg-red-900/20'
    if (kind === 'changed') return 'bg-amber-900/20'
    return ''
  }

  return (
    <div className="relative min-h-0 flex-1" style={{ minHeight: minHeightPx }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="grid grid-cols-[64px_1fr] items-start font-mono text-[12px] leading-5">
          <div className="text-[10px] text-[var(--muted)] select-none border-r border-[var(--border)]">
            {lineModel.map((_, i) => (
              <div key={i} className="px-3 py-0.5">
                {i + 1}
              </div>
            ))}
          </div>
          <div className="text-[var(--text)]">
            {lineModel.map((ln, i) => (
              <div
                key={i}
                className={['px-3 py-0.5 whitespace-pre-wrap break-words', bgFor(ln.kind)].join(' ')}
              >
                {ln.kind === 'changed' ? <Segments segs={ln.segs} side={side} /> : ln.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        className={[
          'relative z-10 w-full h-full resize-none bg-transparent p-0 font-mono text-[12px] leading-5 outline-none border-none',
          'text-transparent caret-[var(--text)]',
          '[&::placeholder]:text-[var(--muted)] [&::placeholder]:opacity-70',
        ].join(' ')}
        style={{
          paddingLeft: gutterWidthPx + textPadXPx,
          paddingRight: textPadXPx,
          paddingTop: textPadYPx,
          paddingBottom: textPadYPx,
          minHeight: minHeightPx,
        }}
      />
    </div>
  )
}

export default function JsonDiffView({ mainInput, onApplyMain, indent = 2, sortKeysOnFormat = false }) {
  const [left, setLeft] = useState(mainInput || '')
  const [right, setRight] = useState('')
  const hasComparedOnceRef = useRef(false)

  const parsedLeft = useMemo(() => safeParse(left), [left])
  const parsedRight = useMemo(() => safeParse(right), [right])

  const leftIsJson = !parsedLeft.error
  const rightIsJson = !parsedRight.error
  const bothJson = leftIsJson && rightIsJson

  const jsonDiffRows = useMemo(() => {
    if (!bothJson) return []
    return diffJsonValues(parsedLeft.data, parsedRight.data)
  }, [bothJson, parsedLeft.data, parsedRight.data])

  const leftForDiff = useMemo(() => {
    if (!leftIsJson) return String(left ?? '')
    return stringifyJson(parsedLeft.data, { indent, sortKeys: false })
  }, [leftIsJson, parsedLeft.data, indent, left])

  const rightForDiff = useMemo(() => {
    if (!rightIsJson) return String(right ?? '')
    return stringifyJson(parsedRight.data, { indent, sortKeys: false })
  }, [rightIsJson, parsedRight.data, indent, right])

  const sideBySide = useMemo(() => {
    const aLines = String(leftForDiff ?? '').split('\n')
    const bLines = String(rightForDiff ?? '').split('\n')
    const ops = myersDiff(aLines, bLines)
    return buildSideBySideRows(ops)
  }, [leftForDiff, rightForDiff])

  // Once we have a valid comparison, allow a clean 2-pane-only view.
  useEffect(() => {
    if (hasComparedOnceRef.current) return
    const leftEmpty = !String(leftForDiff || '').trim()
    const rightEmpty = !String(rightForDiff || '').trim()
    if (!leftEmpty && !rightEmpty) {
      hasComparedOnceRef.current = true
    }
  }, [leftForDiff, rightForDiff])

  const equal = bothJson ? jsonDiffRows.length === 0 : String(leftForDiff ?? '') === String(rightForDiff ?? '')

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

  const { leftLines, rightLines } = useMemo(() => buildPerSideLineModels(sideBySide), [sideBySide])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0 flex flex-wrap gap-2 items-center justify-between">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Diff</span>
        <div className="flex flex-wrap gap-2">
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

      <div className="flex-1 min-h-0 border-t border-[var(--border)] bg-[var(--bg0)] overflow-hidden">
        <div className="px-3 py-2 text-[11px] text-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between gap-3">
          {bothJson ? (
            equal ? (
              <span className="text-[var(--token-string)] font-semibold">Documents are structurally equal.</span>
            ) : (
              <span>
                <strong className="text-[var(--text)]">{jsonDiffRows.length}</strong> difference
                {jsonDiffRows.length !== 1 ? 's' : ''}
              </span>
            )
          ) : equal ? (
            <span className="text-[var(--token-string)] font-semibold">Texts are identical.</span>
          ) : (
            <span>
              Comparing as plain text (JSON parse failed on{' '}
              {!leftIsJson && !rightIsJson ? 'both sides' : !leftIsJson ? 'left side' : 'right side'}).
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          <div
            ref={leftPaneRef}
            onScroll={() => syncScroll('left')}
            className="overflow-auto border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-col min-h-0"
          >
            <div className="sticky top-0 z-10 px-2 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between">
              <span>A (left)</span>
              <div className="flex gap-2">
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
            <HighlightedEditor
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              lineModel={leftLines}
              side="left"
              placeholder="Type or paste here…"
            />
          </div>

          <div
            ref={rightPaneRef}
            onScroll={() => syncScroll('right')}
            className="overflow-auto flex flex-col min-h-0"
          >
            <div className="sticky top-0 z-10 px-2 py-1 bg-[var(--bg2)] text-[10px] text-[var(--muted)] border-b border-[var(--border)] flex items-center justify-between">
              <span>B (right)</span>
              <div className="flex gap-2">
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
            <HighlightedEditor
              value={right}
              onChange={(e) => setRight(e.target.value)}
              lineModel={rightLines}
              side="right"
              placeholder="Type or paste here…"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
