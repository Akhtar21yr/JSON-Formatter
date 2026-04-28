/**
 * Tree view: tree-first UI with an optional in-place editor.
 * By default you see the tree; click Edit (or Cmd/Ctrl+E) to edit JSON text
 * in the same area where the tree is shown.
 */
import { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from 'react'
import JsonNode from './JsonNode'
import ErrorBar from './ErrorBar'
import { safeParse, stringifyJson, collectSearchMatchPaths, jsonPathToDomId } from '../utils/json'

export default function JsonTreeView({
  parsed,
  error,
  search,
  onSearchChange,
  treeBlocked = false,
  nodeCount = 0,
  largeThreshold = 8000,
  onRenderTreeAnyway,
  text = '',
  onTextChange,
  indent = 2,
  sortKeysOnFormat = false,
}) {
  const findNthIndex = useCallback((haystack, needle, n, cs) => {
    const q = (needle || '').trim()
    if (!q) return -1
    const H = cs ? haystack : haystack.toLowerCase()
    const N = cs ? q : q.toLowerCase()
    let from = 0
    let idx = -1
    for (let i = 0; i <= n; i++) {
      idx = H.indexOf(N, from)
      if (idx === -1) return -1
      from = idx + Math.max(1, N.length)
    }
    return idx
  }, [])

  const countOccurrences = useCallback((haystack, needle, cs) => {
    const q = (needle || '').trim()
    if (!q) return 0
    const H = cs ? haystack : haystack.toLowerCase()
    const N = cs ? q : q.toLowerCase()
    let from = 0
    let count = 0
    while (from <= H.length) {
      const idx = H.indexOf(N, from)
      if (idx === -1) break
      count++
      from = idx + Math.max(1, N.length)
    }
    return count
  }, [])

  const expandSeq = useRef(0)
  const [expandCmd, setExpandCmd] = useState(null)
  const treeScrollRef = useRef(null)
  const lastTreeScrollTopRef = useRef(0)

  // Editor state (tree-area edit mode)
  const [isEditing, setIsEditing] = useState(true)
  const [draft, setDraft] = useState(text)
  const [draftError, setDraftError] = useState(null)
  const editorRef = useRef(null)
  const lastEditorScrollTopRef = useRef(0)
  const pendingJumpRef = useRef(false)
  const pendingScrollSyncRef = useRef(false)
  const pendingFocusRef = useRef(false)
  const suppressNextActiveMatchScrollRef = useRef(false)
  const treeScrollTopBeforeEditRef = useRef(0)
  const [restoreSeq, setRestoreSeq] = useState(0)

  /** 'all' | 'keys' | 'values' */
  const [searchMode, setSearchMode] = useState('all')
  const [caseSensitive, setCaseSensitive] = useState(false)

  const searchKeysOnly = searchMode === 'keys'
  const searchValuesOnly = searchMode === 'values'

  const handleSearch = (v) => {
    setActiveMatchIndex(0)
    setEditorMatchIndex(0)
    onSearchChange(v)
  }

  const setMode = (mode) => {
    setActiveMatchIndex(0)
    setEditorMatchIndex(0)
    setSearchMode(mode)
  }

  const setCase = (v) => {
    setActiveMatchIndex(0)
    setEditorMatchIndex(0)
    setCaseSensitive(v)
  }
  const matchPaths = useMemo(() => {
    if (!parsed) return []
    const keysOnly = searchKeysOnly && !searchValuesOnly
    const valuesOnly = searchValuesOnly && !searchKeysOnly
    return collectSearchMatchPaths(parsed, search, { keysOnly, valuesOnly, caseSensitive })
  }, [parsed, search, searchKeysOnly, searchValuesOnly, caseSensitive])

  const matchCount = matchPaths.length
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const activeMatchPath = matchCount > 0 ? matchPaths[Math.min(activeMatchIndex, matchCount - 1)] : null

  const editorMatchCount = useMemo(
    () => countOccurrences(draft || '', search, caseSensitive),
    [draft, search, caseSensitive, countOccurrences],
  )
  const [editorMatchIndex, setEditorMatchIndex] = useState(0)

  useEffect(() => {
    if (!activeMatchPath) return
    if (suppressNextActiveMatchScrollRef.current) {
      suppressNextActiveMatchScrollRef.current = false
      return
    }
    const id = jsonPathToDomId(activeMatchPath)
    const el = document.getElementById(id)
    if (!el) return
    // Scroll after layout
    const raf = window.requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [activeMatchPath])

  const jumpNext = useCallback(() => {
    if (isEditing) {
      if (!editorMatchCount) return
      const next = (editorMatchIndex + 1) % editorMatchCount
      setEditorMatchIndex(next)
      const el = editorRef.current
      if (!el) return
      const idx = findNthIndex(draft || '', search, next, caseSensitive)
      if (idx >= 0) {
        const end = idx + (search?.length || 0)
        el.focus()
        el.setSelectionRange(idx, end)
        const before = (draft || '').slice(0, idx)
        const line = before.split('\n').length
        const styles = window.getComputedStyle(el)
        const lineHeight = Number.parseFloat(styles.lineHeight) || 18
        el.scrollTop = Math.max(0, (line - 1) * lineHeight - el.clientHeight / 2)
      }
      return
    }

    if (!matchCount) return
    setActiveMatchIndex((i) => (i + 1) % matchCount)
  }, [
    isEditing,
    editorMatchCount,
    editorMatchIndex,
    draft,
    search,
    caseSensitive,
    findNthIndex,
    matchCount,
  ])

  const jumpPrev = useCallback(() => {
    if (isEditing) {
      if (!editorMatchCount) return
      const prev = (editorMatchIndex - 1 + editorMatchCount) % editorMatchCount
      setEditorMatchIndex(prev)
      const el = editorRef.current
      if (!el) return
      const idx = findNthIndex(draft || '', search, prev, caseSensitive)
      if (idx >= 0) {
        const end = idx + (search?.length || 0)
        el.focus()
        el.setSelectionRange(idx, end)
        const before = (draft || '').slice(0, idx)
        const line = before.split('\n').length
        const styles = window.getComputedStyle(el)
        const lineHeight = Number.parseFloat(styles.lineHeight) || 18
        el.scrollTop = Math.max(0, (line - 1) * lineHeight - el.clientHeight / 2)
      }
      return
    }

    if (!matchCount) return
    setActiveMatchIndex((i) => (i - 1 + matchCount) % matchCount)
  }, [
    isEditing,
    editorMatchCount,
    editorMatchIndex,
    draft,
    search,
    caseSensitive,
    findNthIndex,
    matchCount,
  ])

  const fireExpand = useCallback((open) => {
    expandSeq.current += 1
    setExpandCmd({ open, id: expandSeq.current })
  }, [])

  const openEditor = useCallback(() => {
    // Capture exact tree scroll position so edit/apply doesn't jump.
    treeScrollTopBeforeEditRef.current =
      treeScrollRef.current?.scrollTop ?? lastTreeScrollTopRef.current

    setDraft(text || '')
    setDraftError(null)
    setEditorMatchIndex(0)
    // If the user is navigating via search jump, prefer selecting that match in editor.
    // Otherwise preserve scroll position (open editor where the user is currently viewing).
    pendingJumpRef.current = Boolean(search && matchCount)
    pendingScrollSyncRef.current = !pendingJumpRef.current
    pendingFocusRef.current = true
    setIsEditing(true)
  }, [text, search, matchCount])

  const closeEditor = useCallback(() => {
    // If we're closing while scrolled inside the editor, preserve that position for the tree.
    treeScrollTopBeforeEditRef.current = lastEditorScrollTopRef.current
    setIsEditing(false)
    setDraftError(null)
    setRestoreSeq((s) => s + 1)
  }, [])

  const applyEditor = useCallback(() => {
    const { data, error: err } = safeParse(draft.trim())
    if (err) {
      setDraftError(err)
      return
    }
    const pretty = stringifyJson(data, { indent, sortKeys: sortKeysOnFormat })
    onTextChange?.(pretty)
    // Preserve exact tree scroll position from when edit started.
    treeScrollTopBeforeEditRef.current = lastEditorScrollTopRef.current
    lastTreeScrollTopRef.current = treeScrollTopBeforeEditRef.current
    suppressNextActiveMatchScrollRef.current = true
    setIsEditing(false)
    setDraftError(null)
    setRestoreSeq((s) => s + 1)
  }, [draft, onTextChange, indent, sortKeysOnFormat])

  // After leaving edit mode, restore the exact scrollTop (retries a few frames).
  useLayoutEffect(() => {
    if (isEditing) return
    if (restoreSeq === 0) return

    let cancelled = false
    let tries = 0
    const maxTries = 6

    const tick = () => {
      if (cancelled) return
      tries++
      const container = treeScrollRef.current
      if (container) {
        container.scrollTop = treeScrollTopBeforeEditRef.current
      }
      if (tries < maxTries) window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
    return () => {
      cancelled = true
    }
  }, [isEditing, restoreSeq, parsed])

  const jumpToDraftError = useCallback(() => {
    if (!draftError || typeof draftError !== 'object' || draftError.position == null) return
    const el = editorRef.current
    if (!el) return
    const pos = Math.min(draftError.position, (draft || '').length)
    el.focus()
    el.setSelectionRange(pos, Math.min(pos + 1, (draft || '').length))

    const before = (draft || '').slice(0, pos)
    const line = before.split('\n').length
    const styles = window.getComputedStyle(el)
    const lineHeight = Number.parseFloat(styles.lineHeight) || 18
    el.scrollTop = Math.max(0, (line - 1) * lineHeight - el.clientHeight / 2)
  }, [draftError, draft])

  const handlePaste = useCallback(
    (e) => {
      const clip = e.clipboardData?.getData('text') ?? ''
      const trimmed = clip.trim()
      if (!trimmed) return
      const { data, error: err } = safeParse(trimmed)
      if (err) return
      e.preventDefault()
      setDraft(stringifyJson(data, { indent, sortKeys: sortKeysOnFormat }))
      setDraftError(null)
    },
    [indent, sortKeysOnFormat],
  )

  useEffect(() => {
    if (!isEditing) return
    const raf = window.requestAnimationFrame(() => {
      const el = editorRef.current
      if (!el) return

      if (pendingFocusRef.current) {
        pendingFocusRef.current = false
        el.focus()
      }

      // When opening edit from a jumped search result, select/scroll to that match.
      if (pendingJumpRef.current) {
        pendingJumpRef.current = false
        el.focus()
        const idx = findNthIndex(draft || '', search, activeMatchIndex, caseSensitive)
        if (idx >= 0) {
          const end = idx + (search?.length || 0)
          el.setSelectionRange(idx, end)

          // Manually scroll textarea to the selection (selection alone doesn't always scroll).
          const before = (draft || '').slice(0, idx)
          const line = before.split('\n').length
          const styles = window.getComputedStyle(el)
          const lineHeight = Number.parseFloat(styles.lineHeight) || 18
          const targetTop = Math.max(0, (line - 1) * lineHeight - el.clientHeight / 2)
          el.scrollTop = targetTop
        }
        return
      }

      // Otherwise, preserve user's current tree scroll position.
      if (pendingScrollSyncRef.current) {
        pendingScrollSyncRef.current = false
        // Don't steal focus from the search input; just sync scroll.
        el.scrollTop = treeScrollTopBeforeEditRef.current
      }
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isEditing, draft, search, activeMatchIndex, caseSensitive, findNthIndex])

  // Tree-only shortcut: Cmd/Ctrl+E toggles editor in tree area
  useEffect(() => {
    const onKeyDown = (e) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return

      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (!e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setIsEditing((v) => {
          if (!v) {
            treeScrollTopBeforeEditRef.current =
              treeScrollRef.current?.scrollTop ?? lastTreeScrollTopRef.current
            setDraft(text || '')
            setDraftError(null)
            setEditorMatchIndex(0)
            pendingJumpRef.current = Boolean(search && matchCount)
            pendingScrollSyncRef.current = !pendingJumpRef.current
          }
          return !v
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [text, search, matchCount])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Input</span>
        <div className="flex items-center gap-2" />
      </div>

      {parsed && (
        <div className="flex flex-col gap-2 px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center flex-nowrap overflow-x-auto">
            <div className="flex items-center gap-2 flex-nowrap min-w-0 px-2 py-1.5 rounded-md bg-[var(--bg2)] border border-[var(--border2)]">
              <label className="flex items-center gap-1 text-[11px] text-[var(--muted)] whitespace-nowrap flex-shrink-0">
                <span>Scope</span>
                <select
                  value={searchMode}
                  onChange={(e) => setMode(e.target.value)}
                  className="bg-transparent border border-[var(--border2)] rounded px-2 py-1 text-[var(--text)] text-[11px]"
                >
                  <option value="all">Keys + values</option>
                  <option value="keys">Keys only</option>
                  <option value="values">Values only</option>
                </select>
              </label>
              <div className="h-5 w-px bg-[var(--border2)] flex-shrink-0" aria-hidden />
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] cursor-pointer whitespace-nowrap flex-shrink-0">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCase(e.target.checked)}
                  className="rounded border-[var(--border2)]"
                />
                Case sensitive
              </label>
              <div className="h-5 w-px bg-[var(--border2)] flex-shrink-0" aria-hidden />
              <span className="text-[var(--muted)] text-xs flex-shrink-0" aria-hidden>
                🔍
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search..."
                id="tree-search-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault()
                    jumpPrev()
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    jumpNext()
                  }
                }}
                className="
                flex-1 min-w-[160px] bg-[var(--bg1)] border border-[var(--border2)] rounded
                px-2 py-1 text-xs text-[var(--text)] outline-none
                focus:border-[var(--accent)]
              "
              />
              {search && (
                <>
                  <span className="text-[11px] text-[var(--muted)] whitespace-nowrap flex-shrink-0">
                    {isEditing
                      ? (editorMatchCount
                          ? `${Math.min(editorMatchIndex + 1, editorMatchCount)}/${editorMatchCount}`
                          : '0/0')
                      : (matchCount
                          ? `${Math.min(activeMatchIndex + 1, matchCount)}/${matchCount}`
                          : '0/0')}
                  </span>
                  <button
                    type="button"
                    onClick={jumpPrev}
                    disabled={isEditing ? !editorMatchCount : !matchCount}
                    className="text-[var(--muted)] hover:text-[var(--text)] text-xs px-1 flex-shrink-0 disabled:opacity-40"
                    title="Previous match (Shift+Enter)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={jumpNext}
                    disabled={isEditing ? !editorMatchCount : !matchCount}
                    className="text-[var(--muted)] hover:text-[var(--text)] text-xs px-1 flex-shrink-0 disabled:opacity-40"
                    title="Next match (Enter)"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSearch('')}
                    className="text-[var(--muted)] hover:text-[var(--text)] text-xs px-1 flex-shrink-0"
                    title="Clear search"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <ErrorBar error={error} />}

      {parsed && treeBlocked ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8 bg-[var(--bg0)] text-center">
          <div className="text-4xl opacity-30" aria-hidden>
            {'⚠'}
          </div>
          <div>
            <p className="text-sm text-[var(--text)] font-semibold mb-1">
              Large JSON (~{nodeCount.toLocaleString()} nodes)
            </p>
            <p className="text-xs text-[var(--muted)] max-w-md">
              Tree view may be slow above ~{largeThreshold.toLocaleString()} nodes. Use Raw or Input for safer editing, or render the tree anyway.
            </p>
          </div>
          <button
            type="button"
            onClick={onRenderTreeAnyway}
            className="
              px-4 py-2 rounded-md text-xs font-semibold
              bg-[var(--accent)] text-white border border-[var(--accent-hover)]
              hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg0)]
            "
          >
            Render tree anyway
          </button>
        </div>
      ) : (
        <div
          ref={treeScrollRef}
          className="flex-1 overflow-auto px-3.5 py-2.5 bg-[var(--bg0)] min-h-0"
          onScroll={(e) => {
            if (isEditing) return
            lastTreeScrollTopRef.current = e.currentTarget.scrollTop
          }}
        >
          {/* In-tree edit toggle row (inside tree area, not header) */}
          <div className="sticky top-0 z-10 -mx-3.5 px-3.5 py-2 bg-[var(--bg0)] border-b border-[var(--border)] mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={openEditor}
                  className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)]"
                  title="Edit JSON here (Cmd/Ctrl+E)"
                >
                  ✎ Edit (Cmd/Ctrl+E)
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={applyEditor}
                    className="text-[11px] px-2 py-1 rounded bg-[var(--accent)] text-white border border-[var(--accent-hover)] hover:opacity-90"
                    title="Apply changes"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="text-[11px] px-2 py-1 rounded bg-[var(--bg2)] border border-[var(--border2)] hover:bg-[var(--bg3)]"
                    title="Cancel editing"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => fireExpand(true)}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] px-2 py-1 rounded hover:bg-[var(--bg3)] transition-colors"
                title="Expand all"
              >
                ⊞ Expand all
              </button>
              <button
                type="button"
                onClick={() => fireExpand(false)}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] px-2 py-1 rounded hover:bg-[var(--bg3)] transition-colors"
                title="Collapse all"
              >
                ⊟ Collapse all
              </button>
            </div>
            <div className="text-[11px] text-[var(--muted)]">
              {isEditing ? 'Editing JSON (auto-format on paste)' : 'Viewing tree'}
            </div>
          </div>

          {isEditing || !parsed ? (
            <div className="flex flex-col gap-2">
              {draftError && (
                <ErrorBar
                  error={draftError}
                  extra={
                    draftError && typeof draftError === 'object' && draftError.position != null ? (
                      <button
                        type="button"
                        onClick={jumpToDraftError}
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
              <textarea
                ref={editorRef}
                value={draft}
                onScroll={(e) => {
                  lastEditorScrollTopRef.current = e.currentTarget.scrollTop
                }}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setDraftError(null)
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeEditor()
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') applyEditor()
                }}
                placeholder={'Paste or type JSON here...\n\nTip: Cmd/Ctrl+Enter to Apply.'}
                spellCheck={false}
                className="w-full h-[60vh] resize-y bg-[var(--bg0)] text-[var(--text)] p-3 font-mono text-[12px] outline-none border border-[var(--border2)] rounded"
              />
              <div className="text-[11px] text-[var(--muted)]">
                Paste auto-formats. Apply: Cmd/Ctrl+Enter. Close: Esc.
              </div>
            </div>
          ) : (
            <JsonNode
              value={parsed}
              depth={0}
              search={search}
              searchKeysOnly={searchKeysOnly}
              searchValuesOnly={searchValuesOnly}
              caseSensitive={caseSensitive}
              jsonPath="$"
              expandCmd={expandCmd}
              activePath={activeMatchPath}
              focusPath={activeMatchPath}
            />
          )}
        </div>
      )}
    </div>
  )
}
