/**
 * components/Toolbar.jsx
 *
 * Top action bar: branding, view tabs, format/minify/sort, settings, file actions.
 */
import { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'

function Btn({ onClick, className = '', title, children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs
        bg-[var(--bg2)] border-[var(--border2)] text-[var(--text)]
        hover:bg-[var(--bg3)] hover:border-[var(--muted)]
        active:scale-95 transition-all duration-100 whitespace-nowrap
        focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg1)]
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  )
}

export default function Toolbar({
  onFormat,
  onMinify,
  onSortKeys,
  onCopy,
  onDownload,
  onUpload,
  onClear,
  indent = 2,
  onIndentChange,
  sortKeysOnFormat = false,
  onSortKeysOnFormatChange,
}) {
  const fileRef = useRef()
  const [moreOpen, setMoreOpen] = useState(false)

  const TABS = [
      { id: 'raw', label: 'raw' },
    {id:'input',label:'input'},
    { id: 'tree', label: 'tree' },
    { id: 'convert', label: 'object → json' },
    { id: 'diff', label: 'diff' },
  ]

  return (
    <header className="px-4 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-bold text-sm tracking-wide min-w-0">
          <div
            className="w-7 h-7 rounded-md bg-[var(--bg2)] border border-[var(--border2)] flex items-center justify-center"
            aria-hidden
          >
            <span
              className="select-none"
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: 'var(--accent)',
                lineHeight: 1,
              }}
            >
              {'{J}'}
            </span>
          </div>
          <span className="hidden sm:inline">JSON Formatter Pro</span>
        </div>

        <nav className="flex gap-0.5 bg-[var(--bg2)] rounded-lg p-1 flex-wrap justify-center" aria-label="View (Alt+1..5)">
          {TABS.map((tab) => (
            <NavLink
              key={tab.id}
              to={`/${tab.id}`}
              className={({ isActive }) =>
                [
                  'px-3 py-1 rounded-md text-xs capitalize transition-all no-underline',
                  isActive ? 'bg-[var(--bg3)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]',
                ].join(' ')
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex gap-1.5 flex-wrap justify-end items-center">
          <Btn onClick={onCopy} title="Copy formatted JSON (Cmd/Ctrl+Shift+C)">
            ⎘ Copy
          </Btn>
          <Btn onClick={onDownload} title="Download as .json">
            ↓ Save
          </Btn>
          <Btn onClick={() => fileRef.current?.click()} title="Upload a .json file">
            ↑ Open
          </Btn>
          <Btn
            onClick={() => setMoreOpen((v) => !v)}
            title="More actions & settings"
            aria-expanded={moreOpen}
            aria-controls="toolbar-more-panel"
          >
            ⋯ More
          </Btn>
          <Btn
            onClick={onClear}
            className="text-[var(--token-null)] border-[var(--token-null)] hover:bg-red-950"
            title="Clear input"
          >
            ✕
          </Btn>

          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = (ev) => onUpload(ev.target.result)
              reader.readAsText(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {moreOpen && (
        <div
          id="toolbar-more-panel"
          className="mt-2 p-3 rounded-lg bg-[var(--bg2)] border border-[var(--border2)] flex flex-col gap-3"
        >
          <div className="flex flex-wrap gap-2">
            <Btn onClick={onFormat} title="Format with indent (Cmd/Ctrl+Enter)">
              ⇥ Format
            </Btn>
            <Btn onClick={onMinify} title="Minify to one line (Cmd/Ctrl+M)">
              ⧉ Minify
            </Btn>
            <Btn onClick={onSortKeys} title="Sort all object keys recursively (Cmd/Ctrl+K)">
              ⇅ Sort keys
            </Btn>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
            <label className="flex items-center gap-2 cursor-pointer">
              <span>Indent</span>
              <select
                value={indent}
                onChange={(e) => onIndentChange?.(Number(e.target.value))}
                className="bg-[var(--bg1)] border border-[var(--border2)] rounded px-2 py-1 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
              </select>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sortKeysOnFormat}
                onChange={(e) => onSortKeysOnFormatChange?.(e.target.checked)}
                className="rounded border-[var(--border2)]"
              />
              Sort keys when formatting
            </label>
            <span className="text-[11px] text-[var(--muted)]">Auto-format on paste/upload is always on.</span>
          </div>

          <div className="text-[11px] text-[var(--muted)]">
            <span className="text-[var(--text)] font-semibold">Shortcuts:</span>{' '}
            Cmd/Ctrl+Enter (Format), Cmd/Ctrl+M (Minify), Cmd/Ctrl+K (Sort), Cmd/Ctrl+Shift+C (Copy), Alt+1..5 (Views), Cmd/Ctrl+Shift+F (Tree search)
          </div>
        </div>
      )}
    </header>
  )
}
