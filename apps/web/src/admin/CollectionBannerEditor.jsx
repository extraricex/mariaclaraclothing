import { useEffect, useMemo, useState } from 'react';
import { adminFetch, adminSend } from '../lib/adminApi.js';

const EMPTY_IMAGE = Object.freeze({ url: '', width: 0, height: 0 });

const DEFAULT_BANNER = Object.freeze({
  visible: false,
  desktopImage: EMPTY_IMAGE,
  mobileImage: EMPTY_IMAGE,
  altText: 'Maria Clara Clothing collection banner',
  link: '',
  openInNewTab: false,
  label: '',
  title: '',
  subtitle: '',
  buttonText: '',
  buttonLink: '',
  textAlignment: 'left',
  textColor: 'light',
  overlayOpacity: 0
});

function normalizedBanner(value) {
  return {
    ...DEFAULT_BANNER,
    ...(value || {}),
    desktopImage: { ...EMPTY_IMAGE, ...(value?.desktopImage || {}) },
    mobileImage: { ...EMPTY_IMAGE, ...(value?.mobileImage || {}) }
  };
}

function useObjectUrl(file) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function PreviewOverlay({ banner }) {
  const hasText = Boolean(banner.label || banner.title || banner.subtitle || banner.buttonText);
  if (!hasText) return null;
  const alignment = banner.textAlignment === 'center'
    ? 'items-center text-center'
    : banner.textAlignment === 'right'
      ? 'items-end text-right'
      : 'items-start text-left';
  return (
    <div className={`pointer-events-none absolute inset-0 flex flex-col justify-end p-4 text-xs sm:p-6 ${alignment} ${banner.textColor === 'dark' ? 'text-ink' : 'text-white'}`}>
      {banner.label && <p className="font-semibold uppercase tracking-[0.14em]">{banner.label}</p>}
      {banner.title && <p className="display mt-1 text-xl sm:text-3xl">{banner.title}</p>}
      {banner.subtitle && <p className="mt-2 max-w-lg">{banner.subtitle}</p>}
      {banner.buttonText && <span className="mt-3 inline-flex border border-current px-3 py-2 font-semibold uppercase">{banner.buttonText}</span>}
    </div>
  );
}

function ImagePicker({ label, file, image, previewUrl, onFile, onRemove }) {
  return (
    <div className="border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{label}</p>
          <p className="mt-1 break-all text-xs text-clay">{file?.name || image.url || 'No image selected'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn-ghost cursor-pointer !px-3 !py-2 text-xs">
            {image.url || file ? 'Replace image' : 'Choose image'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff" hidden onChange={(event) => onFile(event.target.files?.[0] || null)} />
          </label>
          <button type="button" className="btn-ghost !px-3 !py-2 text-xs" disabled={!image.url && !file} onClick={onRemove}>Remove image</button>
        </div>
      </div>
      {previewUrl && (
        <div className="mt-3 overflow-hidden border border-line bg-cream">
          <img src={previewUrl} alt="" className="max-h-48 w-full object-contain" />
        </div>
      )}
    </div>
  );
}

export default function CollectionBannerEditor({ initial }) {
  const [banner, setBanner] = useState(() => normalizedBanner(initial));
  const [desktopFile, setDesktopFile] = useState(null);
  const [mobileFile, setMobileFile] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const desktopObjectUrl = useObjectUrl(desktopFile);
  const mobileObjectUrl = useObjectUrl(mobileFile);
  const desktopPreview = desktopObjectUrl || banner.desktopImage.url;
  const mobilePreview = mobileObjectUrl || banner.mobileImage.url || desktopPreview;

  useEffect(() => {
    if (initial) setBanner(normalizedBanner(initial));
  }, [initial]);

  function update(field, value) {
    setBanner((current) => ({ ...current, [field]: value }));
  }

  function chooseFile(slot, file) {
    if (file && !String(file.type || '').startsWith('image/')) {
      setMessage('Choose a valid image file.');
      return;
    }
    setMessage('');
    if (slot === 'desktop') setDesktopFile(file);
    else setMobileFile(file);
  }

  function removeImage(slot) {
    if (slot === 'desktop') {
      setDesktopFile(null);
      setBanner((current) => ({ ...current, desktopImage: { ...EMPTY_IMAGE } }));
    } else {
      setMobileFile(null);
      setBanner((current) => ({ ...current, mobileImage: { ...EMPTY_IMAGE } }));
    }
  }

  async function uploadImage(slot, file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await adminFetch(`/api/admin/site-content/collection-banner/images/${slot}`, {
      method: 'POST',
      body: formData
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Collection banner upload failed.');
    return body.image;
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const next = {
        ...banner,
        desktopImage: desktopFile ? await uploadImage('desktop', desktopFile) : banner.desktopImage,
        mobileImage: mobileFile ? await uploadImage('mobile', mobileFile) : banner.mobileImage
      };
      const body = await adminSend('PUT', '/api/admin/site-content/collection-banner', { banner: next });
      setBanner(normalizedBanner(body.collectionBanner));
      setDesktopFile(null);
      setMobileFile(null);
      window.dispatchEvent(new Event('maria-clara-site-content-changed'));
      setMessage('Collection banner updated successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 border border-line bg-paper p-4 sm:p-6" aria-labelledby="collection-banner-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Homepage sections</p>
          <h2 id="collection-banner-heading" className="display mt-1 text-2xl">Collection banner</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">Shown immediately above the Freedom of Mind collection.</p>
        </div>
        <button type="button" className="btn-ink" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save collection banner'}</button>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ImagePicker
          label="Desktop image"
          file={desktopFile}
          image={banner.desktopImage}
          previewUrl={desktopPreview}
          onFile={(file) => chooseFile('desktop', file)}
          onRemove={() => removeImage('desktop')}
        />
        <ImagePicker
          label="Mobile image (optional)"
          file={mobileFile}
          image={banner.mobileImage}
          previewUrl={mobileFile || banner.mobileImage.url ? mobilePreview : ''}
          onFile={(file) => chooseFile('mobile', file)}
          onRemove={() => removeImage('mobile')}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex min-h-12 items-center justify-between gap-4 border border-line px-4 py-3">
          <span><strong className="block text-sm">Banner visibility</strong><span className="text-xs text-clay">Hidden removes the section and its spacing.</span></span>
          <input type="checkbox" checked={banner.visible} onChange={(event) => update('visible', event.target.checked)} aria-label="Show collection banner" />
        </label>
        <label className="flex min-h-12 items-center justify-between gap-4 border border-line px-4 py-3">
          <span><strong className="block text-sm">Open link in new tab</strong><span className="text-xs text-clay">Applies to the banner destination.</span></span>
          <input type="checkbox" checked={banner.openInNewTab} onChange={(event) => update('openInNewTab', event.target.checked)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="eyebrow">Alternative text</span>
          <input className="field mt-1" value={banner.altText} onChange={(event) => update('altText', event.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="eyebrow">Banner destination link</span>
          <input className="field mt-1" value={banner.link} onChange={(event) => update('link', event.target.value)} placeholder="/collections/freedom-of-mind" />
        </label>
      </div>

      <details className="mt-5 border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold">Optional banner text</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="eyebrow">Small label</span><input className="field mt-1" value={banner.label} onChange={(event) => update('label', event.target.value)} /></label>
          <label className="block"><span className="eyebrow">Main title</span><input className="field mt-1" value={banner.title} onChange={(event) => update('title', event.target.value)} /></label>
          <label className="block sm:col-span-2"><span className="eyebrow">Subtitle</span><textarea className="field mt-1 min-h-24" value={banner.subtitle} onChange={(event) => update('subtitle', event.target.value)} /></label>
          <label className="block"><span className="eyebrow">Button text</span><input className="field mt-1" value={banner.buttonText} onChange={(event) => update('buttonText', event.target.value)} /></label>
          <label className="block"><span className="eyebrow">Button link</span><input className="field mt-1" value={banner.buttonLink} onChange={(event) => update('buttonLink', event.target.value)} /></label>
          <label className="block"><span className="eyebrow">Text alignment</span><select className="field mt-1" value={banner.textAlignment} onChange={(event) => update('textAlignment', event.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          <label className="block"><span className="eyebrow">Text color</span><select className="field mt-1" value={banner.textColor} onChange={(event) => update('textColor', event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label className="block sm:col-span-2"><span className="eyebrow">Overlay opacity: {banner.overlayOpacity}%</span><input className="mt-2 w-full" type="range" min="0" max="80" step="5" value={banner.overlayOpacity} onChange={(event) => update('overlayOpacity', Number(event.target.value))} /></label>
        </div>
      </details>

      <div className="mt-5">
        <p className="eyebrow">Current banner preview</p>
        {desktopPreview ? (
          <div className="relative mt-2 aspect-[16/6] overflow-hidden border border-line bg-cream">
            <img src={desktopPreview} alt={banner.altText || ''} className="h-full w-full object-cover" />
            {banner.overlayOpacity > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: banner.overlayOpacity / 100 }} />}
            <PreviewOverlay banner={banner} />
          </div>
        ) : (
          <p className="mt-2 border border-line p-6 text-sm text-clay">No desktop image. The customer banner will stay hidden.</p>
        )}
      </div>
    </section>
  );
}
