import { useEffect, useRef, useState } from 'react';
import useAdminCollections from './useAdminCollections.js';

export default function CollectionDropdown({ value = [], onChange }) {
  const { collections } = useAdminCollections();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function closeOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  function toggle(name) {
    onChange(value.includes(name) ? value.filter((item) => item !== name) : [...value, name]);
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
          {collections.map((name) => (
            <label
              key={name}
              className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-cream"
              role="option"
              aria-selected={value.includes(name)}
            >
              <input type="checkbox" checked={value.includes(name)} onChange={() => toggle(name)} />
              {name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
