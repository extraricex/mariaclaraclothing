import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { adminFetch } from '../lib/adminApi.js';

const MODES = [
  ['create_only', 'Create new products only'],
  ['update_by_sku', 'Update existing products by SKU'],
  ['skip_duplicates', 'Create new and skip duplicates']
];

export default function ProductImportDialog({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('create_only');
  const [preview, setPreview] = useState(null);
  const [errorReport, setErrorReport] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => fileRef.current?.focus());
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setPreview(null);
    setErrorReport('');
    setMessage('');
    setBusy(false);
  }, [open]);

  if (!open) return null;

  async function send(endpoint) {
    if (!file) {
      setMessage('Choose a CSV file first.');
      return null;
    }
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 2 * 1024 * 1024) {
      setMessage('Use a CSV file no larger than 2 MB.');
      return null;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    setBusy(true);
    setMessage(endpoint.endsWith('preview') ? 'Validating import...' : 'Importing valid products...');
    try {
      const response = await adminFetch(endpoint, { method: 'POST', body: formData });
      const body = await response.json().catch(() => ({}));
      setPreview(body.preview || null);
      setErrorReport(body.errorReportCsv || '');
      if (!response.ok) throw new Error(body.error || 'Product import failed.');
      return body;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    const body = await send('/api/admin/products/import');
    if (!body) return;
    setMessage(`${body.products?.length || 0} products imported successfully.`);
    onImported?.(body);
  }

  function downloadErrors() {
    if (!errorReport) return;
    const url = URL.createObjectURL(new Blob([errorReport], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `product-import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="product-import-title" className="mx-auto w-full max-w-5xl rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4 text-[var(--admin-text)] shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="product-import-title" className="text-xl font-semibold">Import products</h2>
            <p className="mt-1 text-sm text-[var(--admin-muted)]">CSV only. Pancake mapping columns are read-only and cannot be imported.</p>
          </div>
          <button type="button" className="btn-secondary !px-3 !py-2" disabled={busy} onClick={onClose} aria-label="Close product import">Close</button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">CSV file</span>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="field" onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              setErrorReport('');
              setMessage('');
            }} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Import behavior</span>
            <select className="field" value={mode} onChange={(event) => {
              setMode(event.target.value);
              setPreview(null);
            }}>
              {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={busy || !file} onClick={() => send('/api/admin/products/import/preview')}>{busy ? 'Checking...' : 'Preview import'}</button>
          {preview?.productCount > 0 && <button type="button" className="btn-ink" disabled={busy} onClick={confirmImport}>{busy ? 'Importing...' : `Import ${preview.productCount} products`}</button>}
          {(preview?.invalidRows > 0 || preview?.skippedRows > 0) && <button type="button" className="btn-secondary" onClick={downloadErrors}>Download row report</button>}
        </div>
        {message && <p className="mt-3 text-sm text-[#ffd166]" role="status">{message}</p>}

        {preview && (
          <div className="mt-5">
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <span className="admin-metric-card">Rows: <strong>{preview.totalRows}</strong></span>
              <span className="admin-metric-card text-[#7ee787]">Valid: <strong>{preview.validRows}</strong></span>
              <span className="admin-metric-card text-[#ff8b98]">Invalid: <strong>{preview.invalidRows}</strong></span>
              <span className="admin-metric-card text-[#ffd166]">Skipped: <strong>{preview.skippedRows}</strong></span>
            </div>
            {preview.duplicateSkus?.length > 0 && <p className="mt-3 text-sm text-[#ff8b98]">Duplicate SKUs in file: {preview.duplicateSkus.map((item) => item.sku).join(', ')}</p>}
            <div className="admin-table-shell mt-3 max-h-[45vh] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead><tr className="border-b border-[var(--admin-line)]"><th className="p-2">Row</th><th className="p-2">Product</th><th className="p-2">SKU</th><th className="p-2">Size</th><th className="p-2">Result</th></tr></thead>
                <tbody>{preview.rows?.slice(0, 500).map((row) => (
                  <tr key={row.rowNumber} className="border-b border-[var(--admin-line)]/70">
                    <td className="p-2">{row.rowNumber}</td>
                    <td className="max-w-56 truncate p-2" title={row.productName}>{row.productName || '-'}</td>
                    <td className="p-2">{row.sku || '-'}</td>
                    <td className="p-2">{row.size || '-'}</td>
                    <td className={`p-2 ${row.status === 'valid' ? 'text-[#7ee787]' : row.status === 'invalid' ? 'text-[#ff8b98]' : 'text-[#ffd166]'}`}>
                      <strong className="uppercase">{row.status}</strong>
                      {[...(row.errors || []), ...(row.warnings || [])].map((text) => <span key={text} className="block max-w-sm whitespace-normal">{text}</span>)}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>, document.body
  );
}
