import { useEffect, useState } from 'react';
import { adminFetch, adminJson, adminSend } from '../lib/adminApi.js';
import TickerEditor from './TickerEditor.jsx';
import InfoPagesEditor from './InfoPagesEditor.jsx';
import HeroTextEditor from './HeroTextEditor.jsx';
import CollectionBannerEditor from './CollectionBannerEditor.jsx';

function notifySiteContentChanged() {
  window.dispatchEvent(new Event('maria-clara-site-content-changed'));
}

export default function Banners() {
  const [logo, setLogo] = useState(null);
  const [blackLogo, setBlackLogo] = useState(null);
  const [menuLogo, setMenuLogo] = useState(null);
  const [footerLogo, setFooterLogo] = useState(null);
  const [banners, setBanners] = useState([]);
  const [collectionBanner, setCollectionBanner] = useState(null);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(null);

  function load() {
    adminJson('/api/admin/site-content')
      .then((body) => {
        setLogo(body.siteContent?.logo || null);
        setBlackLogo(body.siteContent?.blackLogo || body.siteContent?.logo || null);
        setMenuLogo(body.siteContent?.menuLogo || body.siteContent?.logo || null);
        setFooterLogo(body.siteContent?.footerLogo || body.siteContent?.logo || null);
        setBanners(body.siteContent?.homepageBanners || []);
        setCollectionBanner(body.siteContent?.collectionBanner || null);
      })
      .catch((err) => setMessage(err.message));
  }

  useEffect(load, []);

  useEffect(() => {
    adminJson('/api/admin/settings')
      .then((body) => setWebsite(body.settings.website))
      .catch((err) => setMessage(err.message));
  }, []);

  function updateBanner(index, field, value) {
    setBanners((previous) => previous.map((banner, i) => i === index ? { ...banner, [field]: value } : banner));
  }

  function move(index, delta) {
    setBanners((previous) => {
      const next = [...previous];
      const target = index + delta;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((banner, i) => ({ ...banner, sortOrder: i }));
    });
  }

  async function save() {
    setMessage('');
    try {
      const body = await adminSend('PUT', '/api/admin/site-content/homepage-banners', {
        banners: banners.map((banner, index) => ({ ...banner, sortOrder: index }))
      });
      setBanners(body.siteContent?.homepageBanners || []);
      setMessage('Changes saved successfully.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function upload(files) {
    if (!files.length) return;
    const formData = new FormData();
    [...files].forEach((file) => formData.append('images', file));
    try {
      const response = await adminFetch('/api/admin/site-content/homepage-banners/images', {
        method: 'POST',
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Upload failed.');
      setBanners(body.siteContent?.homepageBanners || []);
      notifySiteContentChanged();
      setMessage('Banner uploaded.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadLogo(files) {
    if (!files.length) return;
    const formData = new FormData();
    formData.append('image', files[0]);
    try {
      const response = await adminFetch('/api/admin/site-content/logo/image', {
        method: 'POST',
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Upload failed.');
      setLogo(body.siteContent?.logo || null);
      notifySiteContentChanged();
      setMessage('Logo uploaded.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadFooterLogo(files) {
    if (!files.length) return;
    const formData = new FormData();
    formData.append('image', files[0]);
    try {
      const response = await adminFetch('/api/admin/site-content/footer-logo/image', {
        method: 'POST',
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Upload failed.');
      setFooterLogo(body.siteContent?.footerLogo || null);
      notifySiteContentChanged();
      setMessage('Footer logo uploaded.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadBlackLogo(files) {
    if (!files.length) return;
    const formData = new FormData();
    formData.append('image', files[0]);
    try {
      const response = await adminFetch('/api/admin/site-content/black-logo/image', {
        method: 'POST',
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Upload failed.');
      setBlackLogo(body.siteContent?.blackLogo || null);
      notifySiteContentChanged();
      setMessage('Black navbar logo uploaded.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadMenuLogo(files) {
    if (!files.length) return;
    const formData = new FormData();
    formData.append('image', files[0]);
    try {
      const response = await adminFetch('/api/admin/site-content/menu-logo/image', {
        method: 'POST',
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Upload failed.');
      setMenuLogo(body.siteContent?.menuLogo || null);
      notifySiteContentChanged();
      setMessage('Mobile menu drawer logo uploaded.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="admin-content-shell">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Website content</p>
          <h1 className="display mt-1 text-3xl">Logo, banners & website text</h1>
        </div>
        <div className="flex gap-2">
          <label className="btn-ghost cursor-pointer">
            Upload banner
            <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </label>
          <button type="button" className="btn-ink" onClick={save}>Save</button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <section className="mt-8 border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Default / light navbar logo</p>
            <p className="mt-1 text-sm text-ink-soft">Used on the transparent homepage navbar over the banner.</p>
          </div>
          <label className="btn-ghost cursor-pointer">
            Upload light logo
            <input type="file" accept="image/*" hidden onChange={(e) => uploadLogo(e.target.files)} />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-4 border border-line p-4">
          {logo?.url ? (
            <img src={logo.url} alt={logo.altText || 'Maria Clara Clothing logo'} className="max-h-20 max-w-64 object-contain" />
          ) : (
            <p className="text-sm text-clay">No logo uploaded yet.</p>
          )}
          <div className="text-xs text-clay">
            <p>{logo?.url || '/brand/logo.png'}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Black navbar logo</p>
            <p className="mt-1 text-sm text-ink-soft">Used when the customer navbar changes to a white background after scrolling.</p>
          </div>
          <label className="btn-ghost cursor-pointer">
            Upload black logo
            <input type="file" accept="image/*" hidden onChange={(e) => uploadBlackLogo(e.target.files)} />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-4 border border-line p-4">
          {blackLogo?.url ? (
            <img src={blackLogo.url} alt={blackLogo.altText || 'Maria Clara Clothing black logo'} className="max-h-20 max-w-64 object-contain" />
          ) : (
            <p className="text-sm text-clay">No black logo uploaded yet.</p>
          )}
          <div className="text-xs text-clay">
            <p>{blackLogo?.url || logo?.url || '/brand/logo.png'}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Mobile menu drawer logo</p>
            <p className="mt-1 text-sm text-ink-soft">Used inside the mobile slide-out navigation drawer.</p>
          </div>
          <label className="btn-ghost cursor-pointer">
            Upload menu logo
            <input type="file" accept="image/*" hidden onChange={(e) => uploadMenuLogo(e.target.files)} />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-4 border border-line p-4">
          {menuLogo?.url ? (
            <img src={menuLogo.url} alt={menuLogo.altText || 'Maria Clara Clothing menu logo'} className="max-h-20 max-w-64 object-contain" />
          ) : (
            <p className="text-sm text-clay">No menu drawer logo uploaded yet.</p>
          )}
          <div className="text-xs text-clay">
            <p>{menuLogo?.url || logo?.url || '/brand/logo.png'}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Footer logo</p>
            <p className="mt-1 text-sm text-ink-soft">Used only in the customer website footer.</p>
          </div>
          <label className="btn-ghost cursor-pointer">
            Upload footer logo
            <input type="file" accept="image/*" hidden onChange={(e) => uploadFooterLogo(e.target.files)} />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-4 border border-line p-4">
          {footerLogo?.url ? (
            <img src={footerLogo.url} alt={footerLogo.altText || 'Maria Clara Clothing footer logo'} className="max-h-20 max-w-64 object-contain" />
          ) : (
            <p className="text-sm text-clay">No footer logo uploaded yet.</p>
          )}
          <div className="text-xs text-clay">
            <p>{footerLogo?.url || logo?.url || '/brand/logo.png'}</p>
          </div>
        </div>
      </section>

      <CollectionBannerEditor initial={collectionBanner} />

      <div className="mt-8 space-y-4">
        {banners.map((banner, index) => (
          <article key={`${banner.url}-${index}`} className="flex gap-4 border border-line bg-paper p-4">
            <img src={banner.url} alt={banner.altText || ''} className="h-24 w-40 shrink-0 object-cover" />
            <div className="flex-1">
              <label className="block">
                <span className="eyebrow">Alt text</span>
                <input className="field mt-1" value={banner.altText || ''} onChange={(e) => updateBanner(index, 'altText', e.target.value)} />
              </label>
              <div className="mt-3 flex gap-3 text-xs">
                <button type="button" className="border border-line px-3 py-1 hover:border-ink" onClick={() => move(index, -1)} disabled={index === 0}>↑ Up</button>
                <button type="button" className="border border-line px-3 py-1 hover:border-ink" onClick={() => move(index, 1)} disabled={index === banners.length - 1}>↓ Down</button>
                <button type="button" className="text-clay underline hover:text-accent" onClick={() => setBanners((previous) => previous.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
        {!banners.length && <p className="border border-line bg-paper p-6 text-sm text-clay">No banners yet. Upload one to get started.</p>}
      </div>

      {website && <HeroTextEditor initial={website.hero} />}
      {website && <TickerEditor initial={website.ticker} />}
      {website && <InfoPagesEditor initial={website.infoPages} />}
    </div>
  );
}
