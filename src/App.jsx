/**
 * App.jsx — root: views, settings, JSON state via useJsonParser.
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import useJsonParser from './hooks/useJsonParser'
import Toolbar from './components/Toolbar'
import JsonInput from './components/JsonInput'
import JsonTreeView from './components/JsonTreeView'
import RawView from './components/RawView'
import JsonDiffView from './components/JsonDiffView'
import ObjectToJsonView from './components/ObjectToJsonView'
import { StatusBar } from './components/ErrorBar'
import { countNodes, safeParse, stringifyJson } from './utils/json'

/** Above this node count, tree view asks for confirmation before rendering. */
export const LARGE_JSON_NODE_THRESHOLD = 8000

export default function App() {
  const [indent, setIndent] = useState(2)
  const [sortKeysOnFormat, setSortKeysOnFormat] = useState(false)

  const [view, setView] = useState('tree')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(false)
  const [convertOutput, setConvertOutput] = useState('')

  const [treeForceRender, setTreeForceRender] = useState(false)

  const {
    input,
    parsed,
    error,
    formatted,
    stats,
    handleInput,
    handleFormat,
    handleMinify,
    handleSortKeys,
  } = useJsonParser({ indent, sortKeysOnFormat })

  const nodeCount = useMemo(() => (parsed ? countNodes(parsed) : 0), [parsed])
  const treeBlocked = Boolean(parsed && nodeCount > LARGE_JSON_NODE_THRESHOLD && !treeForceRender)

  // Note: no need to reset treeForceRender via an effect; `treeBlocked` is derived
  // from `nodeCount` and this flag, and becomes false automatically for smaller docs.

  const handleCopy = useCallback(() => {
    const text = view === 'convert' ? convertOutput || '' : formatted || input
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setToast(true)
      setTimeout(() => setToast(false), 1600)
    })
  }, [formatted, input, view, convertOutput])

  const handleDownload = useCallback(() => {
    const blob = new Blob([formatted || input], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: 'formatted.json' })
    a.click()
    URL.revokeObjectURL(url)
  }, [formatted, input])

  const handleUpload = useCallback(
    (text) => {
      let next = text
      const { data, error: err } = safeParse(text.trim())
      if (!err && data !== undefined) {
        next = stringifyJson(data, { indent, sortKeys: sortKeysOnFormat })
      }
      handleInput(next)
      const parsedQuick = safeParse(next).data
      if (parsedQuick && countNodes(parsedQuick) > LARGE_JSON_NODE_THRESHOLD) {
        setView('raw')
      } else {
        setView('tree')
      }
    },
    [handleInput, indent, sortKeysOnFormat],
  )

  const handleClear = useCallback(() => {
    handleInput('')
  }, [handleInput])


  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      const meta = e.metaKey || e.ctrlKey
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const map = { '1': 'input', '2': 'tree', '3': 'raw', '4': 'diff', '5': 'convert' }
        const next = map[e.key]
        if (next) {
          e.preventDefault()
          setView(next)
          return
        }
      }

      if (!meta) return

      // Avoid firing shortcuts while typing in form fields.
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'select' || tag === 'input' || tag === 'textarea') return

      // Format: Cmd/Ctrl + Enter
      if (e.key === 'Enter') {
        e.preventDefault()
        handleFormat()
        return
      }

      // Minify: Cmd/Ctrl + M
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault()
        handleMinify()
        return
      }

      // Sort keys: Cmd/Ctrl + K
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        handleSortKeys()
        return
      }

      // Copy (formatted): Cmd/Ctrl + Shift + C
      if (e.key.toLowerCase() === 'c' && e.shiftKey) {
        e.preventDefault()
        handleCopy()
        return
      }

      // Focus tree search: Cmd/Ctrl + Shift + F
      if (e.key.toLowerCase() === 'f' && e.shiftKey) {
        if (view === 'tree') {
          const el = document.getElementById('tree-search-input')
          if (el) {
            e.preventDefault()
            el.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleFormat, handleMinify, handleSortKeys, handleCopy, view])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg0)]">
      {toast && (
        <div
          className="
          toast fixed top-4 right-4 z-50
          bg-[var(--token-string)] text-black
          px-4 py-2 rounded-lg text-xs font-bold
          pointer-events-none
        "
          role="status"
        >
          ✓ Copied to clipboard
        </div>
      )}

      <Toolbar
        view={view}
        onViewChange={setView}
        onFormat={handleFormat}
        onMinify={handleMinify}
        onSortKeys={handleSortKeys}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onUpload={handleUpload}
        onClear={handleClear}
        indent={indent}
        onIndentChange={setIndent}
        sortKeysOnFormat={sortKeysOnFormat}
        onSortKeysOnFormatChange={setSortKeysOnFormat}
      />

      <main className="flex flex-1 overflow-hidden min-h-0">
        {view === 'input' && (
          <JsonInput
            value={input}
            error={error}
            onChange={handleInput}
            onDrop={handleUpload}
            indent={indent}
            sortKeysOnFormat={sortKeysOnFormat}
          />
        )}
        {view === 'tree' && (
          <JsonTreeView
            parsed={parsed}
            error={error}
            search={search}
            onSearchChange={setSearch}
            treeBlocked={treeBlocked}
            nodeCount={nodeCount}
            largeThreshold={LARGE_JSON_NODE_THRESHOLD}
            onRenderTreeAnyway={() => setTreeForceRender(true)}
            text={input}
            onTextChange={handleInput}
            indent={indent}
            sortKeysOnFormat={sortKeysOnFormat}
          />
        )}
        {view === 'raw' && <RawView formatted={formatted} error={error} />}
        {view === 'diff' && (
          <JsonDiffView
            mainInput={input}
            onApplyMain={handleInput}
            indent={indent}
            sortKeysOnFormat={sortKeysOnFormat}
          />
        )}
        {view === 'convert' && (
          <ObjectToJsonView
            mainInput={input}
            onApplyMain={handleInput}
            indent={indent}
            sortKeysOnFormat={sortKeysOnFormat}
            onOutputChange={setConvertOutput}
          />
        )}
      </main>

      <footer className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg1)] text-[11px] text-[var(--muted)] flex items-center justify-between gap-3 flex-wrap">
        <span>
          Powered by <span className="text-[var(--text)] font-semibold">Akhtar</span>
        </span>
        <span className="flex items-center gap-2">
          <a
            href="https://github.com/Akhtar21yr"
            target="_blank"
            rel="noreferrer"
            className="
              inline-flex items-center justify-center
              w-8 h-8 rounded-md
              text-[var(--accent)]
              bg-[var(--bg2)] border border-[var(--border2)]
              hover:bg-[var(--bg3)] hover:border-[var(--muted)]
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg1)]
            "
            aria-label="GitHub profile"
            title="GitHub"
          >
            <svg width="16" height="16" aria-hidden="true">
              <use href="/icons.svg#github-icon" />
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/in/akhtar22yr/"
            target="_blank"
            rel="noreferrer"
            className="
              inline-flex items-center justify-center
              w-8 h-8 rounded-md
              text-[var(--accent)]
              bg-[var(--bg2)] border border-[var(--border2)]
              hover:bg-[var(--bg3)] hover:border-[var(--muted)]
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg1)]
            "
            aria-label="LinkedIn profile"
            title="LinkedIn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none">
              <path
                d="M6.5 8.5H3.75V20.25H6.5V8.5Z"
                fill="currentColor"
              />
              <path
                d="M5.125 3.75C4.125 3.75 3.3125 4.5625 3.3125 5.5625C3.3125 6.5625 4.125 7.375 5.125 7.375C6.125 7.375 6.9375 6.5625 6.9375 5.5625C6.9375 4.5625 6.125 3.75 5.125 3.75Z"
                fill="currentColor"
              />
              <path
                d="M20.25 20.25H17.5V14.5625C17.5 13.1875 17.4688 11.4375 15.5625 11.4375C13.625 11.4375 13.3125 12.9375 13.3125 14.4688V20.25H10.5625V8.5H13.1875V10.0938H13.2188C13.5938 9.40625 14.5312 8.6875 15.9062 8.6875C18.6875 8.6875 20.25 10.5 20.25 13.25V20.25Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </span>
      </footer>

      <StatusBar stats={stats} />
    </div>
  )
}
