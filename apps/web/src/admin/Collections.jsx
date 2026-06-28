import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { durationPartsToSeconds, formatRemainingTime } from '../lib/collectionCountdown.js';

const STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];
const COUNTDOWN_FIELDS = [
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' }
];

function inCollection(product, collectionName) {
  return (product.collections || []).includes(collectionName);
}

export default function Collections() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [active, setActive] = useState(STOREFRONT_COLLECTIONS[0]);
  const [status, setStatus] = useState('');
  const [countdowns, setCountdowns] = useState({});
  const [countdownForm, setCountdownForm] = useState({
    enabled: false,
    message: 'Hurry! Limited time left',
    hours: '02',
    minutes: '00',
    seconds: '00'
  });

  function load() {
    Promise.all([
      adminJson('/api/admin/products?sort=name_asc'),
      adminJson('/api/admin/settings')
    ])
      .then(([productBody, settingsBody]) => {
        setProducts(productBody.products);
        setCountdowns(settingsBody.settings.collectionCountdowns || {});
      })
      .catch((err) => setStatus(err.message));
  }

  useEffect(load, []);

  useEffect(() => {
    const config = countdowns[active] || {
      enabled: false,
      message: 'Hurry! Limited time left',
      durationSeconds: 7200
    };
    const [hours, minutes, seconds] = formatRemainingTime(config.durationSeconds).split(':');
    setCountdownForm({
      enabled: Boolean(config.enabled),
      message: config.message || 'Hurry! Limited time left',
      hours,
      minutes,
      seconds
    });
  }, [active, countdowns]);

  async function saveCollections(slug, change) {
    setStatus('Saving collection...');
    try {
      const { product } = await adminJson(`/api/admin/products/${encodeURIComponent(slug)}`);
      const current = Array.isArray(product.collections) ? product.collections : [];
      const next = [...new Set(change(current))].map((name) => String(name || '').trim()).filter(Boolean);
      await adminSend('PUT', `/api/admin/products/${encodeURIComponent(slug)}`, { ...product, collections: next });
      setStatus('Collection updated.');
      load();
    } catch (error) {
      setStatus(error.message);
    }
  }

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

  const members = products
    .filter((product) => inCollection(product, active))
    .sort((a, b) => a.name.localeCompare(b.name));
  const available = products
    .filter((product) => !inCollection(product, active))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Collections</p>
      <h1 className="display mt-1 text-3xl">Storefront collections</h1>
      <p className="mt-2 text-sm text-ink-soft">
        These two collections power the homepage sections. Adding or removing a product here
        updates the storefront immediately.
      </p>
      {status && <p className="mt-3 text-sm text-accent-deep" role="status">{status}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {STOREFRONT_COLLECTIONS.map((name) => {
          const count = products.filter((product) => inCollection(product, name)).length;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setActive(name)}
              className={`border px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                name === active ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
              }`}
            >
              {name} <span className={name === active ? 'text-accent' : 'text-clay'}>({count})</span>
            </button>
          );
        })}
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
                className="peer sr-only"
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
            {countdownForm.message || 'Hurry! Limited time left'}
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

      <div className="mt-5">
        <select
          className="field max-w-md"
          value=""
          disabled={!available.length}
          onChange={(e) => e.target.value && saveCollections(e.target.value, (collections) => [...collections, active])}
        >
          <option value="">{available.length ? `Add product to ${active}…` : 'All products are in this collection'}</option>
          {available.map((product) => (
            <option key={product.slug} value={product.slug}>{product.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-5 space-y-2">
        {members.map((product) => (
          <article key={product.slug} className="flex items-center gap-4 border border-line bg-paper p-3">
            <img src={product.image || '/brand/logo.png'} alt="" className="h-14 w-11 object-cover" />
            <div className="flex-1">
              <strong className="block text-sm">{product.name}</strong>
              <span className="text-xs text-clay">{product.status || 'active'} · {Number(product.inventoryQuantity || 0)} in stock</span>
            </div>
            <button
              type="button"
              className="btn-ghost !px-4 !py-2 text-xs"
              onClick={() => navigate(`/admin/products/${encodeURIComponent(product.slug)}`)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-ghost !border-accent-deep !px-4 !py-2 text-xs !text-accent-deep"
              onClick={() => saveCollections(product.slug, (collections) => collections.filter((name) => name !== active))}
            >
              Remove
            </button>
          </article>
        ))}
        {!members.length && (
          <div className="border border-line bg-paper p-8 text-center">
            <h2 className="text-sm font-semibold">No products in {active}</h2>
            <p className="mt-1 text-sm text-clay">Add products with the selector above to show them on the customer homepage.</p>
          </div>
        )}
      </div>
    </div>
  );
}
