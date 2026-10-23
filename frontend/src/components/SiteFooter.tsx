export function SiteFooter() {
  return (
    <footer className="border-t border-line py-8">
      <div className="flex flex-col gap-4 text-xs leading-relaxed text-ink-soft sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl">
          <span className="font-semibold text-ink">CivicBridge AI</span> produces
          AI-assisted report drafts. It does not officially verify reports, route
          them to an agency, or submit them on your behalf. Always review a draft
          before sharing it.
        </p>
        <p className="shrink-0">Societal Benefit challenge · Phase 1</p>
      </div>
    </footer>
  )
}
