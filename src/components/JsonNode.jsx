/**
 * Recursive JSON tree: expand/collapse, search (keys/values/case), JSONPath + copy actions.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { getType, buildHighlightSegments, appendJsonPath, jsonPathToDomId } from '../utils/json'

function Highlighted({ text, query, caseSensitive }) {
  const segments = buildHighlightSegments(String(text), query, { caseSensitive })
  return (
    <>
      {segments.map((seg, i) =>
        typeof seg === 'string' ? (
          seg
        ) : (
          <span key={i} className="search-hl">
            {seg.match}
          </span>
        ),
      )}
    </>
  )
}

function includesMatch(text, query, caseSensitive) {
  if (!query) return false
  if (caseSensitive) return text.includes(query)
  return text.toLowerCase().includes(query.toLowerCase())
}

function PrimitiveValue({ type, value, query, caseSensitive }) {
  const colorClass = {
    string: 'text-[var(--token-string)]',
    number: 'text-[var(--token-number)]',
    boolean: 'text-[var(--token-boolean)]',
    null: 'text-[var(--token-null)] italic',
  }[type] || ''

  const display = type === 'string' ? `"${value}"` : String(value)

  return (
    <span className={colorClass}>
      {query ? <Highlighted text={display} query={query} caseSensitive={caseSensitive} /> : display}
    </span>
  )
}

function IndentGuides({ depth }) {
  return (
    <div className="flex" style={{ flexShrink: 0 }}>
      {Array.from({ length: depth }).map((_, i) => (
        <div key={i} className="indent-guide" />
      ))}
    </div>
  )
}

function NodeActions({ jsonPath, value, isComplex, compact }) {
  const copyText = useCallback(
    async (text, e) => {
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        /* ignore */
      }
    },
    [],
  )

  const copySubtree = useCallback(
    (e) => {
      e.stopPropagation()
      const text = isComplex ? JSON.stringify(value, null, 2) : JSON.stringify(value)
      copyText(text, e)
    },
    [copyText, isComplex, value],
  )

  return (
    <div
      className={`
        json-node-actions flex items-center gap-0.5 ml-auto pl-2 flex-shrink-0
        opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity
        ${compact ? '' : ''}
      `}
    >
      <button
        type="button"
        title="Copy JSONPath"
        className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg3)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border2)]"
        onClick={(e) => copyText(jsonPath, e)}
      >
        path
      </button>
      <button
        type="button"
        title={isComplex ? 'Copy JSON (subtree)' : 'Copy JSON value'}
        className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg3)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border2)]"
        onClick={copySubtree}
      >
        json
      </button>
    </div>
  )
}

export default function JsonNode({
  nodeKey,
  value,
  depth = 0,
  search = '',
  searchKeysOnly = false,
  searchValuesOnly = false,
  caseSensitive = false,
  jsonPath = '$',
  expandCmd,
  activePath,
  focusPath,
  focusPaths,
  diffKindByPath,
}) {
  const type = getType(value)
  const isComplex = type === 'object' || type === 'array'

  const [open, setOpen] = useState(depth < 2)

  useEffect(() => {
    if (!expandCmd) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- expand/collapse-all is an intentional UI sync
    setOpen(expandCmd.open)
  }, [expandCmd])

  // Auto-open just the ancestors of the focused search match.
  useEffect(() => {
    if (!isComplex) return
    const list = (focusPaths && Array.isArray(focusPaths) && focusPaths.length ? focusPaths : focusPath ? [focusPath] : [])
    if (!list.length) return
    if (list.some((p) => String(p).startsWith(String(jsonPath)))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional UI sync for jump-to-match / diff focus
      setOpen(true)
    }
  }, [focusPath, focusPaths, isComplex, jsonPath])

  const entries = useMemo(() => (isComplex ? Object.entries(value) : []), [value, isComplex])

  const count = entries.length

  const keyStr = nodeKey !== undefined ? String(nodeKey) : ''
  const valStr = !isComplex ? String(value) : ''

  const keysOnly = searchKeysOnly && !searchValuesOnly
  const valuesOnly = searchValuesOnly && !searchKeysOnly

  const keyHit =
    !!search &&
    !valuesOnly &&
    nodeKey !== undefined &&
    includesMatch(keyStr, search, caseSensitive)
  const valHit =
    !!search && !keysOnly && !isComplex && includesMatch(valStr, search, caseSensitive)

  const toggle = useCallback(() => setOpen((o) => !o), [])

  const bracketOpen = type === 'array' ? '[' : '{'
  const bracketClose = type === 'array' ? ']' : '}'

  const showKeyHl = keyHit && search
  const showValHl = valHit && search
  const isActive = activePath && String(activePath) === String(jsonPath)
  const diffKind = diffKindByPath?.[String(jsonPath)]
  const diffBg =
    diffKind === 'added'
      ? 'bg-emerald-900/25'
      : diffKind === 'removed'
        ? 'bg-red-900/25'
        : diffKind === 'changed'
          ? 'bg-amber-900/25'
          : ''

  // Inline per-node editing removed in favor of the full editor inside Tree view.

  return (
    <div className="node">
      <div
        id={jsonPathToDomId(jsonPath)}
        className={`
          group node-row flex items-start py-px min-w-0
          ${keyHit || valHit ? 'bg-[var(--hl-bg)]' : ''}
          ${diffBg}
          ${isActive ? 'ring-1 ring-[var(--accent)]' : ''}
        `}
      >
        <IndentGuides depth={depth} />

        {isComplex ? (
          <button
            type="button"
            onClick={toggle}
            className="
              w-4 h-4 flex-shrink-0 mt-px mr-1 flex items-center justify-center
              text-[var(--muted)] text-[9px] rounded hover:bg-[var(--bg3)]
              hover:text-[var(--text)] transition-colors border-none bg-transparent
              cursor-pointer
            "
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <span className={`chevron ${open ? 'open' : ''}`}>▶</span>
          </button>
        ) : (
          <div className="w-4 flex-shrink-0 mr-1" />
        )}

        <div className="flex flex-1 items-start min-w-0 gap-1">
          <div className="flex flex-wrap items-start min-w-0 flex-1">
            {nodeKey !== undefined && (
              <>
                <span className={`${showKeyHl ? 'text-[var(--hl-text)]' : 'text-[var(--token-key)]'}`}>
                  "
                  {search ? (
                    <Highlighted text={keyStr} query={search} caseSensitive={caseSensitive} />
                  ) : (
                    keyStr
                  )}
                  "
                </span>
                <span className="text-[var(--muted)] mx-1">:</span>
              </>
            )}

            {isComplex ? (
              <>
                <span className="text-[var(--token-bracket)]">{bracketOpen}</span>
                {!open && (
                  <>
                    <button
                      type="button"
                      className="text-[var(--muted)] text-[11px] mx-1 cursor-pointer hover:text-[var(--text)] border-none bg-transparent"
                      onClick={toggle}
                    >
                      {count} {type === 'array' ? 'items' : 'keys'}
                    </button>
                    <span className="text-[var(--token-bracket)]">{bracketClose}</span>
                    <span
                      className={`
                      text-[10px] font-bold ml-1.5 px-1.5 py-px rounded-full
                      ${type === 'array'
                        ? 'bg-green-900/40 text-[var(--token-string)]'
                        : 'bg-blue-900/40 text-[var(--token-key)]'
                      }
                    `}
                    >
                      {count}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className={showValHl ? 'rounded px-0.5' : ''}>
                  <PrimitiveValue type={type} value={value} query={search} caseSensitive={caseSensitive} />
                </span>
                <span className="type-badge text-[10px] text-[var(--subtle)] ml-2 px-1 rounded border border-[var(--subtle)]">
                  {type}
                </span>
              </>
            )}
          </div>

          <NodeActions jsonPath={jsonPath} value={value} isComplex={isComplex} compact={!open && isComplex} />
        </div>
      </div>

      {isComplex && open && (
        <>
          {entries.map(([k, v]) => {
            const isArr = type === 'array'
            const childKey = isArr ? Number(k) : k
            const childPath = appendJsonPath(jsonPath, k, isArr)
            return (
              <JsonNode
                key={k}
                nodeKey={childKey}
                value={v}
                depth={depth + 1}
                search={search}
                searchKeysOnly={searchKeysOnly}
                searchValuesOnly={searchValuesOnly}
                caseSensitive={caseSensitive}
                jsonPath={childPath}
                expandCmd={expandCmd}
                activePath={activePath}
                focusPath={focusPath}
                focusPaths={focusPaths}
                diffKindByPath={diffKindByPath}
              />
            )
          })}

          <div className="node-row group flex items-center py-px">
            <IndentGuides depth={depth} />
            <div className="w-4 mr-1" />
            <span className="text-[var(--token-bracket)]">{bracketClose}</span>
          </div>
        </>
      )}
    </div>
  )
}
