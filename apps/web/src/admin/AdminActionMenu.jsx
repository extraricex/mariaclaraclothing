import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function AdminActionMenu({ label = 'More actions', items = [], buttonClassName = 'btn-secondary', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const itemCount = items.filter(Boolean).length;

  const placeMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 224;
    const estimatedHeight = Math.min(window.innerHeight - 16, 16 + itemCount * 40);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    const preferredTop = rect.bottom + 6 + estimatedHeight <= window.innerHeight
      ? rect.bottom + 6
      : rect.top - estimatedHeight - 6;
    const top = Math.max(8, Math.min(window.innerHeight - estimatedHeight - 8, preferredTop));
    setPosition({ top, left });
  }, [itemCount]);

  useLayoutEffect(() => {
    if (open) placeMenu();
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOrNavigate = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const controls = [...(menuRef.current?.querySelectorAll('button:not(:disabled)') || [])];
      if (!controls.length) return;
      event.preventDefault();
      const current = controls.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? controls.length - 1
          : event.key === 'ArrowUp' ? (current <= 0 ? controls.length - 1 : current - 1)
            : (current + 1) % controls.length;
      controls[next]?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOrNavigate);
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    requestAnimationFrame(() => menuRef.current?.querySelector('button:not(:disabled)')?.focus());
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOrNavigate);
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open, placeMenu]);

  function choose(item) {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect?.();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {label}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="fixed z-[90] max-h-[calc(100vh-1rem)] w-56 overflow-y-auto rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-2 text-sm text-[var(--admin-text)] shadow-2xl"
          style={{ top: position.top, left: position.left }}
        >
          {items.filter(Boolean).map((item) => (
            <button
              key={item.key || item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`block w-full rounded-[var(--radius-admin)] px-3 py-2 text-left hover:bg-[var(--admin-panel)] focus:bg-[var(--admin-panel)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? 'text-[#ff8b98]' : ''}`}
              onClick={() => choose(item)}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
