import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminDownloadGet, adminJson } from '../lib/adminApi.js';

const SUMMARY_CARDS = [
  ['totalActiveProducts', 'Active products'],
  ['missingSeoTitles', 'Missing SEO titles'],
  ['missingMetaDescriptions', 'Missing descriptions'],
  ['missingAltText', 'Missing alt text'],
  ['duplicateTitles', 'Duplicate titles'],
  ['duplicateDescriptions', 'Duplicate descriptions'],
  ['duplicateSlugs', 'Duplicate slugs'],
  ['thinDescriptions', 'Thin descriptions'],
  ['noindexProducts', 'Noindex products'],
  ['structuredDataIssues', 'Schema issues'],
  ['collectionsMissingMetadata', 'Collection metadata'],
  ['brokenInternalLinks', 'Internal-link issues']
];

const FILTERS = [
  ['all', 'All products'],
  ['needs_seo', 'Needs SEO'],
  ['complete', 'Complete'],
  ['missing_title', 'Missing title'],
  ['missing_description', 'Missing description'],
  ['missing_alt', 'Missing alt text'],
  ['duplicate', 'Duplicate metadata'],
  ['noindex', 'Noindex'],
  ['structured', 'Structured-data issue']
];

function warningText(row) {
  return (row.warnings || []).join(' ').toLowerCase();
}

function matchesFilter(row, filter) {
  const warnings = warningText(row);
  if (filter === 'needs_seo') return row.status !== 'complete';
  if (filter === 'complete') return row.status === 'complete';
  if (filter === 'missing_title') return warnings.includes('missing custom seo title');
  if (filter === 'missing_description') return warnings.includes('missing custom meta description');
  if (filter === 'missing_alt') return warnings.includes('alt text');
  if (filter === 'duplicate') return warnings.includes('duplicate seo title') || warnings.includes('duplicate meta description');
  if (filter === 'noindex') return row.indexStatus === 'noindex';
  if (filter === 'structured') return row.structuredDataStatus !== 'ready';
  return true;
}

function Score({ value }) {
  const score = Number(value || 0);
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${score >= 90 ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : score >= 70 ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-red-300 bg-red-50 text-red-900'}`}>
      {score}%
    </span>
  );
}

export default function SeoDashboard() {
  const [audit, setAudit] = useState(null);
  const [filter, setFilter] = useState('needs_seo');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    adminJson('/api/admin/seo')
      .then((body) => { if (active) setAudit(body); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);

  const products = useMemo(() => (audit?.products || []).filter((row) => matchesFilter(row, filter)), [audit?.products, filter]);
  const summary = audit?.summary || audit?.counts || {};
  const technical = audit?.technical || {};

  async function exportCsv() {
    setExporting(true);
    setMessage('Preparing secure CSV export...');
    try {
      await adminDownloadGet('/api/admin/seo/export.csv', 'maria-clara-product-seo.csv');
      setMessage('Product SEO CSV exported.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setExporting(false);
    }
  }

  if (!audit && !message) return <p className="text-sm text-clay" aria-busy="true">Loading SEO overview...</p>;

  return (
    <div className="max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Marketing</p>
          <h1 className="display mt-1 text-3xl">SEO overview</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-soft">Audit active product and collection content, discover missing fields, and export the current product SEO inventory.</p>
        </div>
        <button type="button" className="btn-ink" onClick={exportCsv} disabled={exporting || !audit}>
          {exporting ? 'Exporting...' : 'Export product SEO CSV'}
        </button>
      </div>
      <p className="mt-3 text-xs text-clay">SEO Content Completeness is an internal publishing checklist, not a Google ranking score.</p>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <section className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="SEO summary">
        {SUMMARY_CARDS.map(([key, label]) => (
          <article key={key} className="border border-line bg-paper p-4">
            <p className="text-2xl font-semibold text-ink">{Number(summary[key] || 0).toLocaleString()}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-clay">{label}</p>
          </article>
        ))}
      </section>

      <section className="mt-9" aria-labelledby="product-seo-audit-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 id="product-seo-audit-heading" className="text-lg font-semibold">Product SEO audit</h2>
            <p className="mt-1 text-xs text-clay">{products.length} product{products.length === 1 ? '' : 's'} in this view</p>
          </div>
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-clay">Filter
            <select className="field ml-2 inline-block w-auto min-w-48" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-clay">
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Primary keyword</th>
                <th className="px-3 py-3">Index</th>
                <th className="px-3 py-3">Schema</th>
                <th className="px-3 py-3">Completeness</th>
                <th className="px-3 py-3">Issues</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.id || row.slug} className="border-b border-line/70 align-top">
                  <td className="px-3 py-4"><strong className="block text-ink">{row.name}</strong><span className="mt-1 block max-w-64 break-all text-xs text-clay">{row.currentUrl}</span></td>
                  <td className="px-3 py-4 text-xs">{row.mainKeyword || <span className="text-clay">Not set</span>}</td>
                  <td className="px-3 py-4 text-xs uppercase">{row.indexStatus}</td>
                  <td className="px-3 py-4 text-xs">{row.structuredDataStatus}</td>
                  <td className="px-3 py-4"><Score value={row.completeness} /></td>
                  <td className="max-w-sm px-3 py-4 text-xs leading-relaxed text-clay">{(row.warnings || []).join(' · ') || 'No audit warnings'}</td>
                  <td className="px-3 py-4"><Link className="text-xs font-semibold uppercase tracking-[0.1em] text-accent underline" to={`/admin/products/${encodeURIComponent(row.slug)}`}>Edit product</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!products.length && <p className="border-b border-line py-10 text-center text-sm text-clay">No products match this filter.</p>}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="collection-seo-audit-heading">
        <h2 id="collection-seo-audit-heading" className="border-b border-line pb-4 text-lg font-semibold">Collection SEO audit</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(audit?.collections || []).map((row) => (
            <article key={row.slug} className="border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-ink">{row.name}</h3><span className="text-[11px] uppercase text-clay">{row.indexStatus}</span></div>
              <p className="mt-2 text-xs text-clay">{row.productCount} linked product{row.productCount === 1 ? '' : 's'}</p>
              <p className="mt-3 text-xs leading-relaxed text-clay">{(row.warnings || []).join(' · ') || 'No audit warnings'}</p>
              <Link className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-accent underline" to={`/admin/collections?collection=${encodeURIComponent(row.slug)}`}>Edit collection</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 border border-line bg-paper p-5" aria-labelledby="technical-seo-status-heading">
        <h2 id="technical-seo-status-heading" className="text-lg font-semibold">Technical endpoints</h2>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <a className="text-accent underline" href={technical.sitemap || '/sitemap.xml'} target="_blank" rel="noreferrer">XML sitemap</a>
          <a className="text-accent underline" href={technical.robots || '/robots.txt'} target="_blank" rel="noreferrer">robots.txt</a>
          <a className="text-accent underline" href={technical.merchantFeed || '/merchant-feed.xml'} target="_blank" rel="noreferrer">Merchant feed</a>
        </div>
        {audit?.generatedAt && <p className="mt-4 text-xs text-clay">Audit generated {new Date(audit.generatedAt).toLocaleString()}.</p>}
      </section>
    </div>
  );
}
