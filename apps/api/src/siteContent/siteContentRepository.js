const fs = require('node:fs');
const path = require('node:path');

const siteContentPath = path.join(__dirname, '..', '..', 'data', 'site-content.json');

function activeSiteContentPath() {
  return process.env.SITE_CONTENT_FILE || siteContentPath;
}

function defaultSiteContent() {
  return {
    logo: { url: '/brand/logo.png', altText: 'Maria Clara Clothing logo' },
    footerLogo: { url: '/brand/logo.png', altText: 'Maria Clara Clothing footer logo' },
    homepageBanners: [
      { url: '/brand/hero1v2.jpg', altText: 'Maria Clara campaign', sortOrder: 0 },
      { url: '/brand/hero2-web.jpg', altText: 'Maria Clara streetwear editorial', sortOrder: 1 }
    ]
  };
}

function getSiteContent() {
  try {
    return normalizeSiteContent(JSON.parse(fs.readFileSync(activeSiteContentPath(), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return defaultSiteContent();
  }
}

function saveSiteContent(content) {
  const normalized = normalizeSiteContent(content);
  const filePath = activeSiteContentPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function updateHomepageBanners(banners) {
  const content = getSiteContent();
  return saveSiteContent({
    ...content,
    homepageBanners: normalizeBanners(banners)
  });
}

function appendHomepageBanners(banners) {
  const content = getSiteContent();
  return updateHomepageBanners([
    ...content.homepageBanners,
    ...banners
  ]);
}

function updateLogo(logo) {
  const content = getSiteContent();
  return saveSiteContent({
    ...content,
    logo: normalizeLogo(logo)
  });
}

function updateFooterLogo(footerLogo) {
  const content = getSiteContent();
  return saveSiteContent({
    ...content,
    footerLogo: normalizeLogo(footerLogo, 'Maria Clara Clothing footer logo')
  });
}

function normalizeSiteContent(content) {
  const logo = normalizeLogo(content?.logo);
  return {
    logo,
    footerLogo: normalizeLogo(content?.footerLogo || logo, 'Maria Clara Clothing footer logo'),
    homepageBanners: normalizeBanners(content?.homepageBanners)
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
  getSiteContent,
  normalizeLogo,
  saveSiteContent,
  updateFooterLogo,
  updateLogo,
  updateHomepageBanners,
  normalizeBanners
};
