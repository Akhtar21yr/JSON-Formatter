/**
 * App.jsx — root: views, settings, JSON state via useJsonParser.
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import useJsonParser from './hooks/useJsonParser'
import Toolbar from './components/Toolbar'
import JsonInput from './components/JsonInput'
import JsonTreeView from './components/JsonTreeView'
import RawView from './components/RawView'
import JsonDiffView from './components/JsonDiffView'
import ObjectToJsonView from './components/ObjectToJsonView'
import { StatusBar } from './components/ErrorBar'
import SiteFooter from './components/SiteFooter'
import { countNodes, safeParse, stringifyJson } from './utils/json'

/** Above this node count, tree view asks for confirmation before rendering. */
export const LARGE_JSON_NODE_THRESHOLD = 8000

const VALID_VIEWS = new Set(['input', 'tree', 'raw', 'diff', 'convert'])

/** Old hub URLs: /formatter/tree → /tree */
function LegacyFormatterPathRedirect() {
  const { view } = useParams()
  const target = VALID_VIEWS.has(view) ? `/${view}` : '/tree'
  return <Navigate to={target} replace />
}

function JsonFormatterApp() {
  const { view: viewParam } = useParams()
  const navigate = useNavigate()
  const view = VALID_VIEWS.has(viewParam) ? viewParam : null

  const [indent, setIndent] = useState(2)
  const [sortKeysOnFormat, setSortKeysOnFormat] = useState(false)

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
        navigate('/raw')
      } else {
        navigate('/tree')
      }
    },
    [handleInput, indent, sortKeysOnFormat, navigate],
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
          navigate(`/${next}`)
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
  }, [handleFormat, handleMinify, handleSortKeys, handleCopy, view, navigate])

  if (!view) {
    return <Navigate to="/tree" replace />
  }

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

      <SiteFooter />

      <StatusBar stats={stats} />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tree" replace />} />
      <Route path="/formatter/:view" element={<LegacyFormatterPathRedirect />} />
      <Route path="/:view" element={<JsonFormatterApp />} />
      <Route path="*" element={<Navigate to="/tree" replace />} />
    </Routes>
  )
}
