/**
 * components/RawView.jsx
 *
 * Formatted JSON with line numbers — the "Raw" tab.
 * Renders each line with a gutter number.
 * Keeps it simple: no syntax highlighting here (that's the Tree tab's job).
 */
import ErrorBar from './ErrorBar'

export default function RawView({ formatted, error }) {
  const lines = formatted ? formatted.split('\n') : []

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg1)] border-b border-[var(--border)] flex-shrink-0">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Formatted Output</span>
        {lines.length > 0 && (
          <span className="text-[11px] text-[var(--muted)]">{lines.length} lines</span>
        )}
      </div>

      {error && <ErrorBar error={error} />}

      {formatted ? (
        <div className="flex-1 overflow-auto bg-[var(--bg0)] py-3">
          {lines.map((line, i) => (
            <div key={i} className="flex leading-7 hover:bg-white/5">
              {/* Line number gutter */}
              <span
                className="
                  select-none text-right pr-4 pl-3
                  text-[var(--subtle)] text-[12px]
                  border-r border-[var(--subtle)] mr-4
                  flex-shrink-0
                "
                style={{ minWidth: '3rem' }}
              >
                {i + 1}
              </span>
              {/* Line content */}
              <span className="text-[var(--text)] whitespace-pre">{line}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">
          No valid JSON to display
        </div>
      )}
    </div>
  )
}