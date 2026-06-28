import { useEffect, useState } from 'react';
import { formatRemainingTime, resolveVisitorCountdown } from '../lib/collectionCountdown.js';

export default function CollectionCountdown({ collectionName, config }) {
  const [deadlineMs, setDeadlineMs] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let storage;
    try {
      storage = window.localStorage;
    } catch (_error) {
      storage = null;
    }
    const resolved = resolveVisitorCountdown(collectionName, config, storage, Date.now());
    setDeadlineMs(resolved?.deadlineMs || null);
    setNowMs(Date.now());
  }, [collectionName, config.revision, config.durationSeconds]);

  useEffect(() => {
    if (!deadlineMs) return undefined;
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);
      if (nextNow >= deadlineMs) setDeadlineMs(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineMs]);

  const remainingSeconds = deadlineMs
    ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
    : 0;
  if (!remainingSeconds) return null;
  const [hours, minutes, seconds] = formatRemainingTime(remainingSeconds).split(':');

  return (
    <section
      role="timer"
      aria-label={`${config.message}: ${hours} hours, ${minutes} minutes, ${seconds} seconds`}
      className="relative mt-5 overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-[0_10px_30px_rgba(240,90,40,0.10)]"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-paper">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v5l3 2" />
          </svg>
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent-deep">{config.message}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {[[hours, 'Hours'], [minutes, 'Minutes'], [seconds, 'Seconds']].map(([value, label], index) => (
          <div key={label} className="contents">
            {index > 0 && <span aria-hidden="true" className="font-bold text-accent">:</span>}
            <div className="min-w-14 rounded-xl border border-orange-100 bg-white/90 px-2 py-2 text-center shadow-sm">
              <strong className="block font-mono text-xl text-ink">{value}</strong>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-accent-deep">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
