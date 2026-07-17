export default function SeoSearchPreview({ title, description, url, score, warnings = [] }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">Search-result preview</h3>
        {Number.isFinite(score) && (
          <span className="rounded-full border border-line bg-cream px-3 py-1 text-[11px] font-semibold text-ink">
            SEO Content Completeness: {score}%
          </span>
        )}
      </div>
      <div className="rounded-[var(--radius-admin)] border border-line bg-white p-4" aria-label="Search result preview">
        <p className="truncate text-xs text-emerald-700">{url}</p>
        <p className="mt-1 line-clamp-2 text-lg leading-snug text-[#1a0dab]">{title}</p>
        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[#4d5156]">{description}</p>
      </div>
      {warnings.length > 0 && (
        <div className="border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-950" role="status">
          <p className="font-semibold uppercase tracking-[0.1em]">SEO completeness warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-clay">Preview lengths are guidance only. Google may rewrite or truncate search titles and descriptions.</p>
    </div>
  );
}
