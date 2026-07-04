import { useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { durationPartsToSeconds, formatRemainingTime } from '../lib/collectionCountdown.js';
import useAdminCollections from './useAdminCollections.js';
const COUNTDOWN_FIELDS = [
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' }
];
const DEFAULT_FORM = {
  enabled: false,
  message: 'Hurry! Limited time left',
  hours: '02',
  minutes: '00',
  seconds: '00'
};

export default function ProductCountdown() {
  const { collections, error: collectionError } = useAdminCollections();
  const [active, setActive] = useState('New Arrivals');
  const [status, setStatus] = useState('');
  const [countdowns, setCountdowns] = useState({});
  const [countdownForm, setCountdownForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    adminJson('/api/admin/settings')
      .then((body) => setCountdowns(body.settings.collectionCountdowns || {}))
      .catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    if (!collections.includes(active)) setActive(collections[0] || '');
  }, [active, collections]);

  useEffect(() => {
    const config = countdowns[active] || {
      enabled: false,
      message: DEFAULT_FORM.message,
      durationSeconds: 7200
    };
    const [hours, minutes, seconds] = formatRemainingTime(config.durationSeconds).split(':');
    setCountdownForm({
      enabled: Boolean(config.enabled),
      message: config.message || DEFAULT_FORM.message,
      hours,
      minutes,
      seconds
    });
  }, [active, countdowns]);

  async function saveCountdown() {
    setStatus('');
    try {
      const durationSeconds = durationPartsToSeconds(
        countdownForm.hours,
        countdownForm.minutes,
        countdownForm.seconds
      );
      const body = await adminSend(
        'PUT',
        `/api/admin/settings/collection-countdowns/${encodeURIComponent(active)}`,
        {
          enabled: countdownForm.enabled,
          message: countdownForm.message,
          durationSeconds
        }
      );
      setCountdowns((current) => ({ ...current, [active]: body.countdown }));
      setStatus('Countdown saved and restarted for visitors.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Products</p>
      <h1 className="display mt-1 text-3xl">Product page countdown</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Configure the marketing countdown shown when a collection is assigned first on a product.
      </p>
      {(status || collectionError) && <p className="mt-3 text-sm text-accent-deep" role="status">{status || collectionError}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {collections.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setActive(name)}
            className={`rounded-xl border px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              name === active ? 'border-ink bg-ink text-paper' : 'border-line bg-paper hover:border-ink'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <section className="mt-5 rounded-2xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Product page countdown</h2>
            <p className="mt-1 text-xs text-clay">
              Applied when {active} is the product&apos;s first collection.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-xs font-semibold">
            <span>Show countdown</span>
            <span className="relative inline-flex h-6 w-11 items-center">
              <input
                type="checkbox"
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
                checked={countdownForm.enabled}
                onChange={(event) => setCountdownForm((value) => ({
                  ...value,
                  enabled: event.target.checked
                }))}
              />
              <span className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-accent" />
              <span className="relative ml-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
            </span>
          </label>
        </div>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.1em] text-clay">
          Marketing message
          <input
            className="field mt-2"
            maxLength="120"
            value={countdownForm.message}
            onChange={(event) => setCountdownForm((value) => ({
              ...value,
              message: event.target.value
            }))}
          />
        </label>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {COUNTDOWN_FIELDS.map(({ key, label }) => (
            <label key={key} className="text-center text-xs font-semibold text-clay">
              {label}
              <input
                className="field mt-2 text-center font-mono text-lg"
                inputMode="numeric"
                value={countdownForm[key]}
                onChange={(event) => setCountdownForm((value) => ({
                  ...value,
                  [key]: event.target.value
                }))}
              />
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-deep">Live preview</span>
          <p className="mt-1 text-xs font-semibold text-accent-deep">
            {countdownForm.message || DEFAULT_FORM.message}
          </p>
          <strong className="mt-2 block font-mono text-lg text-ink">
            {countdownForm.hours.padStart(2, '0')} : {countdownForm.minutes.padStart(2, '0')} : {countdownForm.seconds.padStart(2, '0')}
          </strong>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-accent px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-paper shadow-sm transition-colors hover:bg-accent-deep"
          onClick={saveCountdown}
        >
          Save and restart countdown
        </button>
      </section>
    </div>
  );
}
