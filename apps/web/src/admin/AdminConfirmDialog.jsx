import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function AdminConfirmDialog({
  open,
  title,
  description,
  warning = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  children = null,
  onConfirm,
  onCancel
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => cancelRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-description"
        className="w-full max-w-md rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-5 text-[var(--admin-text)] shadow-2xl"
      >
        <h2 id="admin-confirm-title" className="text-lg font-semibold">{title}</h2>
        <p id="admin-confirm-description" className="mt-2 text-sm leading-6 text-[var(--admin-muted)]">{description}</p>
        {children}
        {warning && <p className="mt-3 rounded-[var(--radius-admin)] border border-[var(--admin-yellow)]/40 bg-[var(--admin-yellow)]/10 p-3 text-xs leading-5 text-[#ffd166]">{warning}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={danger ? 'btn-secondary !border-[var(--admin-red)] !text-[#ff8b98]' : 'btn-ink'}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
