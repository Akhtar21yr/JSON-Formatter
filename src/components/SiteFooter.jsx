/**
 * Shared site footer: attribution + GitHub and LinkedIn (same on hub and formatter).
 */
export default function SiteFooter() {
  return (
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
            <path d="M6.5 8.5H3.75V20.25H6.5V8.5Z" fill="currentColor" />
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
  )
}
