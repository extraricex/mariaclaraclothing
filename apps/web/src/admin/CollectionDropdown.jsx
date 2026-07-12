import { useEffect, useRef, useState } from 'react';
import useAdminCollections from './useAdminCollections.js';

export default function CollectionDropdown({ value = [], onChange }) {
  const { collectionDefinitions } = useAdminCollections();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function closeOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  function selected(collection) {
    const accepted = new Set([collection.name, ...(collection.aliases || [])].map((name) => name.toLowerCase()));
    return value.some((name) => accepted.has(String(name || '').toLowerCase()));
  }

  function toggle(collection) {
    const accepted = new Set([collection.name, ...(collection.aliases || [])].map((name) => name.toLowerCase()));
    onChange(selected(collection)
      ? value.filter((item) => !accepted.has(String(item || '').toLowerCase()))
      : [...value, collection.name]);
  }

  return (
    <div
      ref={rootRef}
      className="relative mt-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.currentTarget.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        className="field flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value.length ? value.join(', ') : 'Select collections'}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 w-full border border-line bg-paper p-2 shadow-lg"
          role="listbox"
          aria-multiselectable="true"
        >
          {collectionDefinitions.map((collection) => (
            <label
              key={collection.slug}
              className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-cream"
              role="option"
              aria-selected={selected(collection)}
            >
              <input type="checkbox" checked={selected(collection)} onChange={() => toggle(collection)} />
              {collection.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
