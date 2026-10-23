export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line/80 py-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-paper shadow-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M3 17h18M5 17v-4a7 7 0 0 1 14 0v4M8 17v-2.5M12 17v-3.5M16 17v-2.5" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight tracking-tight">
            CivicBridge <span className="text-accent">AI</span>
          </p>
          <p className="hidden truncate text-[11px] uppercase tracking-[0.16em] text-ink-soft min-[420px]:block">
            Civic reports, clarified
          </p>
        </div>
      </div>

      <span className="shrink-0 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        Phase 1 · Preview
      </span>
    </header>
  )
}
