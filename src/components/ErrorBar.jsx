/**
 * components/ErrorBar.jsx
 * Shows a user-friendly error message for invalid JSON.
 * The native JSON.parse error message already includes position info
 * (e.g. "Unexpected token 'x' at position 42") so we display it directly.
 */
function errorText(error) {
  if (error == null) return ''
  if (typeof error === 'string') return error
  return error.message || ''
}

export function ErrorBar({ error, extra, children, id }) {
  const msg = errorText(error)
  if (!msg && !children) return null
  const lineInfo =
    error && typeof error === 'object' && error.line != null
      ? `Line ${error.line}${error.column != null ? `, column ${error.column}` : ''}`
      : null
  return (
    <div
      id={id}
      role="alert"
      className="
      flex items-start gap-2 px-4 py-2.5
      bg-red-950/60 border-b border-[var(--token-null)]
      text-[var(--token-null)] text-[12px] flex-shrink-0
    ">
      <span className="mt-px flex-shrink-0" aria-hidden>⚠</span>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="break-words">{msg}</span>
        {lineInfo && (
          <span className="text-[11px] text-[var(--muted)]">
            {lineInfo}. Check input around that location.
          </span>
        )}
        {extra}
        {children}
      </div>
    </div>
  )
}

export default ErrorBar

/**
 * components/StatusBar.jsx
 * Shows leaf-node type counts at the bottom of the app.
 */
export function StatusBar({ stats }) {
  if (!stats) return null
  const items = [
    { label: 'keys',     value: stats.total },
    { label: 'strings',  value: stats.strings },
    { label: 'numbers',  value: stats.numbers },
    { label: 'booleans', value: stats.booleans },
    { label: 'nulls',    value: stats.nulls },
  ]
  return (
    <footer className="
      flex gap-5 px-4 py-1.5
      bg-[var(--bg1)] border-t border-[var(--border)]
      text-[11px] text-[var(--muted)] flex-shrink-0
    ">
      {items.map(({ label, value }) => (
        <div key={label} className="flex gap-1">
          <strong className="text-[var(--text)]">{value}</strong>
          {label}
        </div>
      ))}
    </footer>
  )
}