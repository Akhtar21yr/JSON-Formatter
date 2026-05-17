/**
 * Compare two JSON documents (strict JSON).
 */
import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { safeParse, stringifyJson, deepSortKeys } from '../utils/json'
import { diffJsonValues } from '../utils/diff'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function scrollContainerToEl(container, el) {
  if (!container || !el) return
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  const deltaTop = eRect.top - cRect.top
  const target =
    container.scrollTop +
    deltaTop -
    container.clientHeight / 2 +
    Math.min(eRect.height, container.clientHeight) / 2
  container.scrollTo({ top: Math.max(0, target) })
}

/** Keep both diff panes at the same relative scroll depth when content height differs (e.g. 1 line vs 6). */
function syncScrollProportional(src, dst) {
  const srcMax = Math.max(0, src.scrollHeight - src.clientHeight)
  const dstMax = Math.max(0, dst.scrollHeight - dst.clientHeight)
  if (dstMax <= 0) return
  if (srcMax <= 0) {
    dst.scrollTo({ top: 0 })
    return
  }
  const ratio = src.scrollTop / srcMax
  dst.scrollTo({ top: ratio * dstMax })
}

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

/** True if intraline diff touches at least one non-whitespace character (skip whitespace-only / “extra line” noise). */
function hasMeaningfulTokenChange(row) {
  const aSegs = row.aSegs || []
  const bSegs = row.bSegs || []
  for (const s of aSegs) {
    if (s.kind === 'del' && /\S/.test(String(s.text ?? ''))) return true
  }
  for (const s of bSegs) {
    if (s.kind === 'ins' && /\S/.test(String(s.text ?? ''))) return true
  }
  return false
}

/**
 * Prev/Next/Jump targets: same-line intraline edits with real content changes.
 * Skips whole-line added/removed, blank-only rows, and whitespace-only token diffs.
 */
function isJumpableDiffRow(row) {
  if (row.kind !== 'changed') return false
  if (!String(row.aText ?? '').trim() && !String(row.bText ?? '').trim()) return false
  return hasMeaningfulTokenChange(row)
}

/** Active jump (Prev/Next): solid yellow fill on the current diff hunk (no ring) */
const ACTIVE_JUMP_FILL = 'bg-yellow-400 text-gray-950 rounded-sm'

function Segments({ segs, side, markActiveJump = false }) {
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
      {segs.map((seg, i) => {
        const isJumpHunk = markActiveJump && (seg.kind === 'del' || seg.kind === 'ins')
        const base = isJumpHunk ? '' : cls[seg.kind] || ''
        const jump = isJumpHunk ? ACTIVE_JUMP_FILL : ''
        return (
          <span key={i} className={[base, jump].filter(Boolean).join(' ')}>
            {seg.text}
          </span>
        )
      })}
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

/** GitHub-style: collapse long runs of equal lines; expand chunk-by-chunk. */
const DIFF_CONTEXT_LINES = 3
const DIFF_MIN_EQUAL_RUN_TO_COLLAPSE = 10
const DIFF_EXPAND_CHUNK = 40

/**
 * @returns {({ type: 'row', row: object } | { type: 'gap', gapKey: string, midRows: object[] })[]}
 */
function buildFoldPlan(sideBySide) {
  const items = []
  let gapSeq = 0
  let i = 0
  while (i < sideBySide.length) {
    const r = sideBySide[i]
    if (r.kind !== 'equal') {
      items.push({ type: 'row', row: r })
      i++
      continue
    }
    let j = i
    while (j < sideBySide.length && sideBySide[j].kind === 'equal') j++
    const run = sideBySide.slice(i, j)
    const L = run.length
    if (L < DIFF_MIN_EQUAL_RUN_TO_COLLAPSE || L <= DIFF_CONTEXT_LINES * 2) {
      run.forEach((row) => items.push({ type: 'row', row }))
    } else {
      const top = run.slice(0, DIFF_CONTEXT_LINES)
      const bot = run.slice(L - DIFF_CONTEXT_LINES, L)
      const mid = run.slice(DIFF_CONTEXT_LINES, L - DIFF_CONTEXT_LINES)
      const gapKey = `gap-${gapSeq++}-${i}`
      top.forEach((row) => items.push({ type: 'row', row }))
      items.push({ type: 'gap', gapKey, midRows: mid })
      bot.forEach((row) => items.push({ type: 'row', row }))
    }
    i = j
  }
  return items
}

/**
 * @param {ReturnType<typeof buildFoldPlan>} plan
 * @param {Record<string, number>} expandState gapKey -> lines revealed from start of mid
 */
function flattenFoldPlan(plan, expandState) {
  /** @type {({ type: 'row', row: object } | { type: 'gapBar', gapKey: string, remaining: number, totalHidden: number })[]} */
  const out = []
  for (const item of plan) {
    if (item.type === 'row') {
      out.push({ type: 'row', row: item.row })
      continue
    }
    const { gapKey, midRows } = item
    const total = midRows.length
    let revealed = expandState[gapKey] ?? 0
    if (revealed > total) revealed = total
    for (let k = 0; k < revealed; k++) {
      out.push({ type: 'row', row: midRows[k] })
    }
    if (revealed < total) {
      out.push({
        type: 'gapBar',
        gapKey,
        remaining: total - revealed,
        totalHidden: total,
      })
    }
  }
  return out
}

// Must match between highlight layer and textarea or the caret drifts line-by-line.
const DIFF_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const DIFF_FONT_PX = 12
const DIFF_LINE_HEIGHT_PX = 20
const DIFF_GUTTER_PX = 64
const DIFF_PAD_X_PX = 12

/** Above this, skip Myers + gutter overlay so paste stays responsive. */
const DIFF_MAX_CHARS_FOR_MYERS = 350_000
const DIFF_MAX_LINES_FOR_MYERS = 10_000
/** Per-side cap: still run Myers globally but avoid huge DOM in one editor. */
const DIFF_HIGHLIGHT_MAX_CHARS_PER_SIDE = 160_000
const DIFF_HIGHLIGHT_MAX_LINES_PER_SIDE = 4_000

function DiffRowPair({ row, isActiveJump = false }) {
  const leftBg =
    row.kind === 'removed'
      ? 'bg-red-900/15'
      : row.kind === 'changed'
        ? 'bg-amber-900/15'
        : row.kind === 'equal'
          ? ''
          : ''
  const rightBg =
    row.kind === 'added'
      ? 'bg-emerald-900/15'
      : row.kind === 'changed'
        ? 'bg-amber-900/15'
        : ''
  const rowStyle = {
    fontFamily: DIFF_MONO,
    fontSize: DIFF_FONT_PX,
    lineHeight: `${DIFF_LINE_HEIGHT_PX}px`,
  }

  return (
    <div className="grid grid-cols-2 border-b border-[var(--border)]">
      <div className={`grid grid-cols-[64px_minmax(0,1fr)] items-start ${leftBg}`}>
        <div
          className="select-none border-r border-[var(--border)] px-2 py-0.5 text-right text-[10px] text-[var(--muted)] tabular-nums"
          style={{ ...rowStyle, fontSize: 10 }}
        >
          {row.aNo ?? ''}
        </div>
        <pre className="m-0 break-words whitespace-pre-wrap px-3 py-0.5 text-[var(--text)]" style={rowStyle}>
          {row.kind === 'changed' ? (
            <Segments segs={row.aSegs} side="left" markActiveJump={isActiveJump} />
          ) : row.kind === 'removed' && isActiveJump ? (
            <span className={ACTIVE_JUMP_FILL}>{row.aText ?? ''}</span>
          ) : (
            row.aText ?? ''
          )}
        </pre>
      </div>
      <div className={`grid grid-cols-[64px_minmax(0,1fr)] items-start border-l border-[var(--border)] ${rightBg}`}>
        <div
          className="select-none border-r border-[var(--border)] px-2 py-0.5 text-right text-[10px] text-[var(--muted)] tabular-nums"
          style={{ ...rowStyle, fontSize: 10 }}
        >
          {row.bNo ?? ''}
        </div>
        <pre className="m-0 break-words whitespace-pre-wrap px-3 py-0.5 text-[var(--text)]" style={rowStyle}>
          {row.kind === 'changed' ? (
            <Segments segs={row.bSegs} side="right" markActiveJump={isActiveJump} />
          ) : row.kind === 'added' && isActiveJump ? (
            <span className={ACTIVE_JUMP_FILL}>{row.bText ?? ''}</span>
          ) : (
            row.bText ?? ''
          )}
        </pre>
      </div>
    </div>
  )
}

function CollapseGapBar({ remaining, onExpandChunk, onExpandAll }) {
  const chunk = Math.min(DIFF_EXPAND_CHUNK, remaining)
  return (
    <div className="border-y border-sky-700/50 bg-sky-950/40">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-[var(--muted)]">
        <span className="text-sky-400/90">···</span>
        <span>
          {remaining} unchanged line{remaining !== 1 ? 's' : ''} hidden
        </span>
        <button
          type="button"
          className="rounded border border-sky-700/60 bg-[var(--bg2)] px-2 py-0.5 text-[11px] text-[var(--text)] hover:bg-[var(--bg3)]"
          onClick={onExpandChunk}
        >
          Show {chunk} more
        </button>
        <button
          type="button"
          className="rounded border border-sky-700/60 bg-[var(--bg2)] px-2 py-0.5 text-[11px] text-[var(--text)] hover:bg-[var(--bg3)]"
          onClick={onExpandAll}
        >
          Show all ({remaining})
        </button>
      </div>
    </div>
  )
}

function HighlightedEditor({
  value,
  onChange,
  onFocus,
  onRoot,
  paneRef,
  activeLineNo = null,
  lineModel,
  side,
  placeholder,
  plain,
}) {
  const taRef = useRef(null)
  const wrapRef = useRef(null)
  const mirrorRef = useRef(null)

  const textLineCount = Math.max(1, String(value ?? '').split('\n').length)
  const modelLineCount = Math.max(1, lineModel?.length ?? 0)
  const lineCount = Math.max(textLineCount, modelLineCount)

  const usePlainMode =
    plain ||
    String(value ?? '').length > DIFF_HIGHLIGHT_MAX_CHARS_PER_SIDE ||
    lineCount > DIFF_HIGHLIGHT_MAX_LINES_PER_SIDE

  const baseDisplayLines =
    lineModel.length > 0
      ? lineModel
      : Array.from({ length: lineCount }, () => ({ kind: 'equal', text: '', segs: null }))
  /** Pad so overlay row count always matches textarea lines (avoids mis-align when line counts diverge briefly). */
  const displayLines =
    baseDisplayLines.length >= lineCount
      ? baseDisplayLines
      : [
          ...baseDisplayLines,
          ...Array.from({ length: lineCount - baseDisplayLines.length }, () => ({
            kind: 'equal',
            text: '',
            segs: null,
          })),
        ]
  /** Baseline min height before we measure scrollHeight */
  const minHeightPx = Math.max(120, lineCount * DIFF_LINE_HEIGHT_PX + 16)
  const bgFor = (kind) => {
    if (kind === 'added') return 'bg-emerald-900/20'
    if (kind === 'removed') return 'bg-red-900/20'
    if (kind === 'changed') return 'bg-amber-900/20'
    return ''
  }

  const rowStyle = {
    fontFamily: DIFF_MONO,
    fontSize: DIFF_FONT_PX,
    lineHeight: `${DIFF_LINE_HEIGHT_PX}px`,
    letterSpacing: 'normal',
    tabSize: 2,
    minHeight: DIFF_LINE_HEIGHT_PX,
  }

  /** Grow to full content height and scroll on the pane (not inside a clipped textarea). */
  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.overflow = 'hidden'
    el.style.height = '0px'
    const h = el.scrollHeight
    el.style.height = `${h}px`
    el.style.minHeight = `${Math.max(120, h)}px`
    if (wrapRef.current && !usePlainMode) {
      wrapRef.current.style.minHeight = `${Math.max(120, h)}px`
    }
  }, [value, usePlainMode, lineCount])

  const ensureCaretVisible = useCallback(() => {
    const pane = paneRef?.current
    const ta = taRef.current
    const wrap = wrapRef.current
    if (!pane || !ta || !wrap) return

    const sel = ta.selectionStart ?? 0
    const mirror = mirrorRef.current
    if (!mirror) return

    // Mirror styles: match textarea wrapping and metrics
    const taRect = ta.getBoundingClientRect()
    mirror.style.width = `${taRect.width}px`
    mirror.style.fontFamily = DIFF_MONO
    mirror.style.fontSize = `${DIFF_FONT_PX}px`
    mirror.style.lineHeight = `${DIFF_LINE_HEIGHT_PX}px`
    mirror.style.letterSpacing = 'normal'
    mirror.style.tabSize = '2'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordBreak = 'break-word'
    mirror.style.paddingLeft = `${DIFF_PAD_X_PX}px`
    mirror.style.paddingRight = `${DIFF_PAD_X_PX}px`

    const before = String(value ?? '').slice(0, sel)
    mirror.textContent = ''
    mirror.append(before)
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    mirror.append(marker)

    const markerTop = marker.offsetTop
    const markerBottom = markerTop + DIFF_LINE_HEIGHT_PX

    const paneRect = pane.getBoundingClientRect()
    const wrapRect = wrap.getBoundingClientRect()
    const wrapTopInPane = wrapRect.top - paneRect.top + pane.scrollTop

    const caretTopInPane = wrapTopInPane + markerTop
    const caretBottomInPane = wrapTopInPane + markerBottom

    const viewTop = pane.scrollTop
    const viewBottom = pane.scrollTop + pane.clientHeight
    // Keep this small; large padding makes horizontal moves feel like “jumping”.
    const pad = 8

    // Only scroll when caret is actually outside the visible viewport.
    if (caretTopInPane < viewTop) {
      pane.scrollTo({ top: Math.max(0, caretTopInPane - pad) })
    } else if (caretBottomInPane > viewBottom) {
      pane.scrollTo({ top: Math.max(0, caretBottomInPane - pane.clientHeight + pad) })
    }
  }, [paneRef, value])

  if (usePlainMode) {
    return (
      <div className="box-border w-full min-h-0 px-2 py-2">
        {plain && (
          <p className="mb-2 text-[10px] text-[var(--muted)] leading-snug">
            Large document: line diff highlighting is disabled so this tab stays responsive. You can still edit and
            scroll.
          </p>
        )}
        <textarea
          ref={taRef}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          spellCheck={false}
          className="box-border w-full max-w-full resize-none rounded border border-[var(--border)] bg-[var(--bg0)] p-2 font-mono text-[12px] leading-5 text-[var(--text)] outline-none focus:border-[var(--accent)]"
          style={{ fontFamily: DIFF_MONO, minHeight: 160 }}
        />
      </div>
    )
  }

  /** Per-row grid so line numbers stay aligned when text wraps; textarea sits only on the text column (no fake gutter padding). */
  const gridTemplate = `${DIFF_GUTTER_PX}px minmax(0,1fr)`

  return (
    <div
      ref={(el) => {
        wrapRef.current = el
        onRoot?.(el)
      }}
      className="relative w-full min-w-0 overflow-hidden"
      style={{ minHeight: minHeightPx }}
    >
      <div
        ref={mirrorRef}
        className="absolute -left-[99999px] top-0 pointer-events-none opacity-0"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none grid w-full font-mono"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {displayLines.flatMap((ln, i) => {
          const lineNo = i + 1
          const isJumpRow = activeLineNo != null && activeLineNo === lineNo
          const markJump = isJumpRow
          const lineBody =
            ln.kind === 'changed' ? (
              <Segments segs={ln.segs} side={side} markActiveJump={markJump} />
            ) : markJump && ln.kind === 'removed' && side === 'left' ? (
              <span className={ACTIVE_JUMP_FILL}>{ln.text}</span>
            ) : markJump && ln.kind === 'added' && side === 'right' ? (
              <span className={ACTIVE_JUMP_FILL}>{ln.text}</span>
            ) : (
              ln.text
            )
          return [
            <div
              key={`g-${i}`}
              data-line-no={lineNo}
              className="select-none border-r border-[var(--border)] text-[var(--muted)] flex items-start justify-end px-2 tabular-nums"
              style={{ ...rowStyle, fontSize: 10 }}
            >
              {lineNo}
            </div>,
            <div
              key={`c-${i}`}
              data-line-no={lineNo}
              className={['text-[var(--text)] whitespace-pre-wrap break-words px-3', bgFor(ln.kind)].join(' ')}
              style={rowStyle}
            >
              {lineBody}
            </div>,
          ]
        })}
      </div>

      <textarea
        ref={taRef}
        value={value}
        onChange={onChange}
        onFocus={(e) => {
          onFocus?.(e)
          requestAnimationFrame(ensureCaretVisible)
        }}
        onClick={() => requestAnimationFrame(ensureCaretVisible)}
        onKeyUp={(e) => {
          // Keep caret within the scrollable pane when navigating with arrows.
          if (
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown' ||
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'PageUp' ||
            e.key === 'PageDown' ||
            e.key === 'Home' ||
            e.key === 'End'
          ) {
            requestAnimationFrame(ensureCaretVisible)
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        className={[
          'absolute z-[1] box-border resize-none bg-transparent p-0 outline-none border-none top-0',
          '[&::placeholder]:text-[var(--muted)] [&::placeholder]:opacity-70',
        ].join(' ')}
        style={{
          left: DIFF_GUTTER_PX,
          width: `calc(100% - ${DIFF_GUTTER_PX}px)`,
          maxWidth: `calc(100% - ${DIFF_GUTTER_PX}px)`,
          fontFamily: DIFF_MONO,
          fontSize: DIFF_FONT_PX,
          lineHeight: `${DIFF_LINE_HEIGHT_PX}px`,
          letterSpacing: 'normal',
          tabSize: 2,
          paddingLeft: DIFF_PAD_X_PX,
          paddingRight: DIFF_PAD_X_PX,
          paddingTop: 0,
          paddingBottom: 0,
          minHeight: minHeightPx,
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          caretColor: 'var(--text)',
          overflow: 'hidden',
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

  /** Line diff + overlay MUST use the same strings as the textarea (`left` / `right`). Pretty-printed JSON would desync the caret from highlights. */
  const skipLineDiffHighlight = useMemo(() => {
    const L = String(left ?? '')
    const R = String(right ?? '')
    const linesA = L.split('\n').length
    const linesB = R.split('\n').length
    return L.length + R.length > DIFF_MAX_CHARS_FOR_MYERS || linesA + linesB > DIFF_MAX_LINES_FOR_MYERS
  }, [left, right])

  const sideBySide = useMemo(() => {
    if (skipLineDiffHighlight) return []
    const aLines = String(left ?? '').split('\n')
    const bLines = String(right ?? '').split('\n')
    const ops = myersDiff(aLines, bLines)
    return buildSideBySideRows(ops)
  }, [left, right, skipLineDiffHighlight])

  const foldPlan = useMemo(() => buildFoldPlan(sideBySide), [sideBySide])
  const hasFoldGaps = useMemo(() => foldPlan.some((p) => p.type === 'gap'), [foldPlan])
  const gapMidLen = useMemo(() => {
    const m = {}
    for (const p of foldPlan) {
      if (p.type === 'gap') m[p.gapKey] = p.midRows.length
    }
    return m
  }, [foldPlan])

  /**
   * View mode:
   * - 'auto': compact for large diffs (if fold gaps exist), editable otherwise
   * - 'compact': always compact (read-only)
   * - 'edit': always editable
   */
  const [viewMode, setViewMode] = useState('auto')
  const [gapExpand, setGapExpand] = useState({})

  const approxLineCount = useMemo(() => {
    const la = String(left ?? '').split('\n').length
    const lb = String(right ?? '').split('\n').length
    return la + lb
  }, [left, right])

  const autoWantsCompact = hasFoldGaps && !skipLineDiffHighlight && approxLineCount >= 250
  const compactDiff =
    viewMode === 'compact' ? true : viewMode === 'edit' ? false : Boolean(autoWantsCompact)

  const flatFoldItems = useMemo(() => flattenFoldPlan(foldPlan, gapExpand), [foldPlan, gapExpand])

  const toggleCompactDiff = useCallback(() => {
    setGapExpand({})
    setViewMode((m) => (m === 'compact' ? 'edit' : 'compact'))
  }, [])

  const leftPaneRef = useRef(null)
  const rightPaneRef = useRef(null)
  const [leftEditorEl, setLeftEditorEl] = useState(null)
  const [rightEditorEl, setRightEditorEl] = useState(null)
  const syncingRef = useRef(false)
  const syncScroll = useCallback((from) => {
    if (syncingRef.current) return
    const a = leftPaneRef.current
    const b = rightPaneRef.current
    if (!a || !b) return
    syncingRef.current = true
    const src = from === 'left' ? a : b
    const dst = from === 'left' ? b : a
    syncScrollProportional(src, dst)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        syncingRef.current = false
      })
    })
  }, [])

  const changeAnchors = useMemo(() => {
    if (skipLineDiffHighlight) return []
    return sideBySide.filter((r) => isJumpableDiffRow(r)).map((r) => ({
      aNo: typeof r.aNo === 'number' ? r.aNo : null,
      bNo: typeof r.bNo === 'number' ? r.bNo : null,
    }))
  }, [sideBySide, skipLineDiffHighlight])

  const flatCompactChangeCount = useMemo(() => {
    if (!compactDiff) return 0
    return flatFoldItems.reduce((acc, item) => {
      if (item.type !== 'row') return acc
      return isJumpableDiffRow(item.row) ? acc + 1 : acc
    }, 0)
  }, [flatFoldItems, compactDiff])

  const changeCount = compactDiff ? flatCompactChangeCount : changeAnchors.length
  const [requestedChangeIdx, setRequestedChangeIdx] = useState(0)
  const changeIdx = changeCount > 0 ? clamp(requestedChangeIdx, 0, changeCount - 1) : 0

  const compactScrollRef = useRef(null)

  const scrollToChange = useCallback(
    (idx) => {
      if (changeCount <= 0) return
      if (compactDiff) {
        const root = compactScrollRef.current
        const el = root?.querySelector?.(`[data-change-idx="${idx}"]`)
        if (root && el) scrollContainerToEl(root, el)
        return
      }
      const anchor = changeAnchors[idx]
      const aNo = anchor?.aNo
      const bNo = anchor?.bNo
      if (aNo != null) {
        const el = leftEditorEl?.querySelector?.(`[data-line-no="${aNo}"]`)
        if (leftPaneRef.current && el) scrollContainerToEl(leftPaneRef.current, el)
      }
      if (bNo != null) {
        const el = rightEditorEl?.querySelector?.(`[data-line-no="${bNo}"]`)
        if (rightPaneRef.current && el) scrollContainerToEl(rightPaneRef.current, el)
      }
    },
    [changeAnchors, changeCount, compactDiff, leftEditorEl, rightEditorEl],
  )

  useEffect(() => {
    scrollToChange(changeIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeIdx, compactDiff])

  // Once we have a valid comparison, allow a clean 2-pane-only view.
  useEffect(() => {
    if (hasComparedOnceRef.current) return
    const leftEmpty = !String(left || '').trim()
    const rightEmpty = !String(right || '').trim()
    if (!leftEmpty && !rightEmpty) {
      hasComparedOnceRef.current = true
    }
  }, [left, right])

  const equal = bothJson ? jsonDiffRows.length === 0 : String(left ?? '') === String(right ?? '')

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

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden border-t border-[var(--border)] bg-[var(--bg0)]">
        <div className="flex flex-shrink-0 flex-col gap-1 border-b border-[var(--border)] px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--muted)]">
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
              <span className="mr-2 inline-block rounded border border-[var(--border2)] bg-emerald-900/25 px-1.5 py-0.5">
                added
              </span>
              <span className="mr-2 inline-block rounded border border-[var(--border2)] bg-red-900/25 px-1.5 py-0.5">
                removed
              </span>
              <span className="inline-block rounded border border-[var(--border2)] bg-amber-900/25 px-1.5 py-0.5">
                changed
              </span>
            </span>
          </div>

          {changeCount > 0 && !skipLineDiffHighlight && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border2)] bg-[var(--bg2)] px-2 py-0.5 text-[10px] text-[var(--text)] hover:bg-[var(--bg3)] disabled:opacity-50"
                disabled={changeIdx <= 0}
                onClick={() => setRequestedChangeIdx((v) => Math.max(0, v - 1))}
              >
                Prev change
              </button>
              <button
                type="button"
                className="rounded border border-[var(--border2)] bg-[var(--bg2)] px-2 py-0.5 text-[10px] text-[var(--text)] hover:bg-[var(--bg3)] disabled:opacity-50"
                disabled={changeIdx >= changeCount - 1}
                onClick={() => setRequestedChangeIdx((v) => Math.min(changeCount - 1, v + 1))}
              >
                Next change
              </button>
              <span className="text-[10px] text-[var(--muted)]">
                {changeIdx + 1}/{changeCount}
              </span>
              <button
                type="button"
                className="rounded border border-[var(--border2)] bg-[var(--bg2)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--bg3)] hover:text-[var(--text)]"
                onClick={() => scrollToChange(changeIdx)}
              >
                Jump
              </button>
            </div>
          )}

          {skipLineDiffHighlight && (
            <p className="text-[10px] leading-snug text-[var(--muted)]">
              Large combined input: line diff highlighting is paused so the tab stays fast. Scroll inside each pane to
              move through the text.
            </p>
          )}
          {hasFoldGaps && !skipLineDiffHighlight && (
            <div
              className={[
                'flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5',
                compactDiff ? 'border border-amber-800/60 bg-amber-950/30' : '',
              ].join(' ')}
            >
              <button
                type="button"
                className={[
                  'rounded border px-2.5 py-1 text-[11px] font-medium',
                  compactDiff
                    ? 'border-[var(--accent)] bg-[var(--bg3)] text-[var(--text)] hover:opacity-90'
                    : 'border-[var(--border2)] bg-[var(--bg2)] text-[var(--muted)] hover:bg-[var(--bg3)] hover:text-[var(--text)]',
                ].join(' ')}
                onClick={toggleCompactDiff}
              >
                {compactDiff ? 'Switch to editable view' : 'Compact diff (collapsed, like GitHub)'}
              </button>
              {!compactDiff && (
                <span className="text-[10px] text-[var(--muted)]">
                  Compact view collapses big unchanged blocks. Click it to show only change areas + expandable blue bars.
                </span>
              )}
              {compactDiff && (
                <span className="text-[10px] text-amber-200/90">
                  Expand hidden blocks with blue bars. To edit, click “Switch to editable view” or click into a pane.
                </span>
              )}
            </div>
          )}
        </div>

        {compactDiff && hasFoldGaps && !skipLineDiffHighlight ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg0)]">
            <div ref={compactScrollRef} className="flex min-h-0 flex-1 flex-col overflow-auto">
              <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-[var(--border)] bg-[var(--bg2)] px-2 py-1 text-[10px] text-[var(--muted)]">
                <span>A (left)</span>
                <span className="border-l border-[var(--border)] pl-2">B (right)</span>
              </div>
              <div className="font-mono text-[12px]">
                {(() => {
                  let changeCounter = 0
                  return flatFoldItems.map((item, idx) => {
                    if (item.type === 'gapBar') {
                      return (
                        <CollapseGapBar
                          key={`${item.gapKey}-${idx}`}
                          remaining={item.remaining}
                          onExpandChunk={() =>
                            setGapExpand((prev) => {
                              const max = gapMidLen[item.gapKey] ?? 0
                              const cur = prev[item.gapKey] ?? 0
                              return { ...prev, [item.gapKey]: Math.min(max, cur + DIFF_EXPAND_CHUNK) }
                            })
                          }
                          onExpandAll={() =>
                            setGapExpand((prev) => ({
                              ...prev,
                              [item.gapKey]: gapMidLen[item.gapKey] ?? 0,
                            }))
                          }
                        />
                      )
                    }
                    const isJumpable = isJumpableDiffRow(item.row)
                    const cIdx = isJumpable ? changeCounter++ : null
                    return (
                      <div key={`row-${idx}`} data-change-idx={cIdx ?? undefined}>
                        <DiffRowPair row={item.row} isActiveJump={Boolean(isJumpable && cIdx === changeIdx)} />
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
            {/* Toolbar outside scroll: avoids caret painting over sticky header when at top of file */}
            <div className="flex min-h-0 flex-col border-b border-[var(--border)] lg:border-b-0 lg:border-r">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg2)] px-2 py-1 text-[10px] text-[var(--muted)]">
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
              <div
                ref={leftPaneRef}
                onScroll={() => syncScroll('left')}
                className="min-h-0 flex-1 overflow-auto"
              >
                <HighlightedEditor
                  value={left}
                  onChange={(e) => setLeft(e.target.value)}
                  onFocus={() => setViewMode('edit')}
                  onRoot={setLeftEditorEl}
                  paneRef={leftPaneRef}
                  activeLineNo={
                    !compactDiff && !skipLineDiffHighlight && changeAnchors.length > 0
                      ? changeAnchors[changeIdx]?.aNo ?? null
                      : null
                  }
                  lineModel={leftLines}
                  side="left"
                  placeholder="Type or paste here…"
                  plain={skipLineDiffHighlight}
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg2)] px-2 py-1 text-[10px] text-[var(--muted)]">
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
              <div
                ref={rightPaneRef}
                onScroll={() => syncScroll('right')}
                className="min-h-0 flex-1 overflow-auto"
              >
                <HighlightedEditor
                  value={right}
                  onChange={(e) => setRight(e.target.value)}
                  onFocus={() => setViewMode('edit')}
                  onRoot={setRightEditorEl}
                  paneRef={rightPaneRef}
                  activeLineNo={
                    !compactDiff && !skipLineDiffHighlight && changeAnchors.length > 0
                      ? changeAnchors[changeIdx]?.bNo ?? null
                      : null
                  }
                  lineModel={rightLines}
                  side="right"
                  placeholder="Type or paste here…"
                  plain={skipLineDiffHighlight}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
