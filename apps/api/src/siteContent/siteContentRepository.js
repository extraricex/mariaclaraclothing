const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const siteContentPath = path.join(__dirname, '..', '..', 'data', 'site-content.json');
const SITE_CONTENT_KEY = 'siteContent';

function activeSiteContentPath() {
  return process.env.SITE_CONTENT_FILE || siteContentPath;
}

function usePostgresSiteContent() {
  return hasDatabaseUrl() && !process.env.SITE_CONTENT_FILE;
}

function isPromise(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function defaultSiteContent() {
  return {
    logo: { url: '/brand/logo.png', altText: 'Maria Clara Clothing logo' },
    blackLogo: { url: '/brand/logo.png', altText: 'Maria Clara Clothing black logo' },
    menuLogo: { url: '/brand/logo.png', altText: 'Maria Clara Clothing menu logo' },
    footerLogo: { url: '/brand/logo.png', altText: 'Maria Clara Clothing footer logo' },
    homepageBanners: [
      { url: '/brand/hero1v2-2400.webp', altText: 'Maria Clara Clothing models wearing oversized graphic shirts', sortOrder: 0 },
      { url: '/brand/hero2-2200.webp', altText: 'Maria Clara Clothing streetwear campaign photographed in Manila', sortOrder: 1 }
    ],
    collectionBanner: defaultCollectionBanner()
  };
}

function defaultCollectionBanner() {
  return {
    visible: true,
    desktopImage: { url: '/brand/hero1v2-2400.webp', width: 2400, height: 902 },
    mobileImage: { url: '', width: 0, height: 0 },
    altText: 'Maria Clara Clothing Freedom of Mind collection campaign',
    link: '/collections/freedom-of-mind',
    openInNewTab: false,
    label: '',
    title: '',
    subtitle: '',
    buttonText: '',
    buttonLink: '',
    textAlignment: 'left',
    textColor: 'light',
    overlayOpacity: 0
  };
}

async function readPostgresValue(key) {
  const result = await query('SELECT value FROM store_settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

async function writePostgresValue(key, value) {
  await query(
    `INSERT INTO store_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

function readJsonSiteContent() {
  try {
    return normalizeSiteContent(JSON.parse(fs.readFileSync(activeSiteContentPath(), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return defaultSiteContent();
  }
}

function getSiteContent() {
  if (usePostgresSiteContent()) {
    return readPostgresValue(SITE_CONTENT_KEY).then((stored) =>
      (stored ? normalizeSiteContent(stored) : defaultSiteContent())
    );
  }
  return readJsonSiteContent();
}

function saveSiteContent(content) {
  const normalized = normalizeSiteContent(content);
  if (usePostgresSiteContent()) {
    return writePostgresValue(SITE_CONTENT_KEY, normalized).then(() => normalized);
  }
  const filePath = activeSiteContentPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function updateHomepageBanners(banners) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      saveSiteContent({ ...current, homepageBanners: normalizeBanners(banners) })
    );
  }
  return saveSiteContent({ ...content, homepageBanners: normalizeBanners(banners) });
}

function appendHomepageBanners(banners) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      updateHomepageBanners([...current.homepageBanners, ...banners])
    );
  }
  return updateHomepageBanners([...content.homepageBanners, ...banners]);
}

function updateCollectionBanner(banner) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      saveSiteContent({ ...current, collectionBanner: normalizeCollectionBanner(banner) })
    );
  }
  return saveSiteContent({ ...content, collectionBanner: normalizeCollectionBanner(banner) });
}

function updateLogo(logo) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) => saveSiteContent({ ...current, logo: normalizeLogo(logo) }));
  }
  return saveSiteContent({ ...content, logo: normalizeLogo(logo) });
}

function updateBlackLogo(blackLogo) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      saveSiteContent({ ...current, blackLogo: normalizeLogo(blackLogo, 'Maria Clara Clothing black logo') })
    );
  }
  return saveSiteContent({
    ...content,
    blackLogo: normalizeLogo(blackLogo, 'Maria Clara Clothing black logo')
  });
}

function updateMenuLogo(menuLogo) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      saveSiteContent({ ...current, menuLogo: normalizeLogo(menuLogo, 'Maria Clara Clothing menu logo') })
    );
  }
  return saveSiteContent({
    ...content,
    menuLogo: normalizeLogo(menuLogo, 'Maria Clara Clothing menu logo')
  });
}

function updateFooterLogo(footerLogo) {
  const content = getSiteContent();
  if (isPromise(content)) {
    return content.then((current) =>
      saveSiteContent({ ...current, footerLogo: normalizeLogo(footerLogo, 'Maria Clara Clothing footer logo') })
    );
  }
  return saveSiteContent({
    ...content,
    footerLogo: normalizeLogo(footerLogo, 'Maria Clara Clothing footer logo')
  });
}

function normalizeSiteContent(content) {
  const logo = normalizeLogo(content?.logo);
  return {
    logo,
    blackLogo: normalizeLogo(content?.blackLogo || logo, 'Maria Clara Clothing black logo'),
    menuLogo: normalizeLogo(content?.menuLogo || logo, 'Maria Clara Clothing menu logo'),
    footerLogo: normalizeLogo(content?.footerLogo || logo, 'Maria Clara Clothing footer logo'),
    homepageBanners: normalizeBanners(content?.homepageBanners),
    collectionBanner: content?.collectionBanner === undefined
      ? defaultCollectionBanner()
      : normalizeCollectionBanner(content.collectionBanner)
  };
}

function normalizeCollectionBannerImage(image) {
  const record = typeof image === 'string' ? { url: image } : (image || {});
  const width = Number(record.width || 0);
  const height = Number(record.height || 0);
  return {
    url: String(record.url || '').trim(),
    width: Number.isInteger(width) && width > 0 ? width : 0,
    height: Number.isInteger(height) && height > 0 ? height : 0
  };
}

function normalizeCollectionBannerLink(value) {
  const link = String(value || '').trim();
  if (!link) return '';
  if ((link.startsWith('/') && !link.startsWith('//')) || link.startsWith('#')) return link;
  try {
    const parsed = new URL(link);
    return ['http:', 'https:'].includes(parsed.protocol) ? link : '';
  } catch (_error) {
    return '';
  }
}

function normalizeCollectionBanner(banner) {
  const record = banner && typeof banner === 'object' ? banner : {};
  const desktopImage = normalizeCollectionBannerImage(record.desktopImage || record.desktopImageUrl);
  const mobileImage = normalizeCollectionBannerImage(record.mobileImage || record.mobileImageUrl);
  const alignment = String(record.textAlignment || 'left').trim().toLowerCase();
  const textColor = String(record.textColor || 'light').trim().toLowerCase();
  const opacity = Number(record.overlayOpacity || 0);
  return {
    visible: Boolean(record.visible),
    desktopImage,
    mobileImage,
    altText: String(record.altText || 'Maria Clara Clothing collection banner').trim(),
    link: normalizeCollectionBannerLink(record.link),
    openInNewTab: Boolean(record.openInNewTab),
    label: String(record.label || '').trim(),
    title: String(record.title || '').trim(),
    subtitle: String(record.subtitle || '').trim(),
    buttonText: String(record.buttonText || '').trim(),
    buttonLink: normalizeCollectionBannerLink(record.buttonLink),
    textAlignment: ['left', 'center', 'right'].includes(alignment) ? alignment : 'left',
    textColor: ['light', 'dark'].includes(textColor) ? textColor : 'light',
    overlayOpacity: Number.isFinite(opacity) ? Math.min(80, Math.max(0, Math.round(opacity))) : 0
  };
}

function normalizeLogo(logo, defaultAltText = 'Maria Clara Clothing logo') {
  const url = String(logo?.url || '').trim();
  const altText = String(logo?.altText || defaultAltText).trim();
  return {
    url: url || '/brand/logo.png',
    altText: altText || defaultAltText
  };
}

function normalizeBanners(banners) {
  const records = Array.isArray(banners) ? banners : [];
  return records
    .map((banner, index) => ({
      url: String(banner.url || banner).trim(),
      altText: String(banner.altText || 'Homepage banner').trim(),
      sortOrder: Number.isInteger(Number(banner.sortOrder)) ? Number(banner.sortOrder) : index
    }))
    .filter((banner) => banner.url)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    .map((banner, index) => ({ ...banner, sortOrder: index }));
}

module.exports = {
  appendHomepageBanners,
  defaultCollectionBanner,
  getSiteContent,
  normalizeCollectionBanner,
  normalizeCollectionBannerLink,
  normalizeLogo,
  saveSiteContent,
  updateBlackLogo,
  updateFooterLogo,
  updateLogo,
  updateMenuLogo,
  updateCollectionBanner,
  updateHomepageBanners,
  normalizeBanners
};
