const PRESETS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last_7_days', 'Last 7 days'],
  ['previous_7_days', 'Previous 7 days'],
  ['last_30_days', 'Last 30 days']
];

export function analyticsRangeQuery({ range, start, end }) {
  const query = new URLSearchParams({ range });
  if (range === 'custom' && start && end) {
    query.set('start', start);
    query.set('end', end);
  }
  return query.toString();
}

export default function AnalyticsRangeControls({ value, onChange }) {
  const range = value.range || 'last_30_days';
  return (
    <div className="flex flex-wrap items-end gap-2" aria-label="Analytics date range">
      <div className="flex flex-wrap gap-2" role="group">
        {PRESETS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={range === id ? 'btn-ink' : 'btn-secondary'}
            onClick={() => onChange({ ...value, range: id })}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={range === 'custom' ? 'btn-ink' : 'btn-secondary'}
          onClick={() => onChange({ ...value, range: 'custom' })}
        >
          Custom
        </button>
      </div>
      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--admin-muted)]">
            <span className="block pb-1">From</span>
            <input className="field !min-h-10 !py-2" type="date" value={value.start || ''} onChange={(event) => onChange({ ...value, start: event.target.value })} />
          </label>
          <label className="text-xs text-[var(--admin-muted)]">
            <span className="block pb-1">To</span>
            <input className="field !min-h-10 !py-2" type="date" value={value.end || ''} onChange={(event) => onChange({ ...value, end: event.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}
