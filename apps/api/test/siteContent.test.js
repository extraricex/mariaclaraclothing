const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

const ADMIN_TOKEN = 'local-admin-token';

function adminRequest(method = 'GET', body) {
  return {
    method,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
}

test('site content APIs expose and update homepage banners', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-site-content-'));
  const siteContentFile = path.join(tempDir, 'site-content.json');
  const uploadDir = path.join(tempDir, 'public', 'uploads', 'banners');
  const logoUploadDir = path.join(tempDir, 'public', 'uploads', 'logos');
  const previousSiteContentFile = process.env.SITE_CONTENT_FILE;
  const previousBannerUploadDir = process.env.BANNER_UPLOAD_DIR;
  const previousLogoUploadDir = process.env.LOGO_UPLOAD_DIR;
  const previousAdminToken = process.env.ADMIN_TOKEN;

  process.env.SITE_CONTENT_FILE = siteContentFile;
  process.env.BANNER_UPLOAD_DIR = uploadDir;
  process.env.LOGO_UPLOAD_DIR = logoUploadDir;
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;

  await fs.writeFile(siteContentFile, JSON.stringify({
    logo: { url: '/brand/logo.png', altText: 'Current logo' },
    blackLogo: { url: '/brand/logo-black.png', altText: 'Current black logo' },
    menuLogo: { url: '/brand/logo-menu.png', altText: 'Current menu logo' },
    footerLogo: { url: '/brand/footer-logo.png', altText: 'Current footer logo' },
    homepageBanners: [
      { url: '/brand/hero1v2.jpg', altText: 'Current banner', sortOrder: 0 }
    ]
  }), 'utf8');

  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const { port } = server.address();

  try {
    const publicResponse = await fetch(`http://127.0.0.1:${port}/api/site-content`);
    const publicBody = await publicResponse.json();

    assert.equal(publicResponse.status, 200);
    assert.equal(publicBody.siteContent.logo.url, '/brand/logo.png');
    assert.equal(publicBody.siteContent.blackLogo.url, '/brand/logo-black.png');
    assert.equal(publicBody.siteContent.menuLogo.url, '/brand/logo-menu.png');
    assert.equal(publicBody.siteContent.footerLogo.url, '/brand/footer-logo.png');
    assert.equal(publicBody.siteContent.homepageBanners[0].url, '/brand/hero1v2.jpg');

    const blockedResponse = await fetch(`http://127.0.0.1:${port}/api/admin/site-content`);
    assert.equal(blockedResponse.status, 401);

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/admin/site-content/homepage-banners`, adminRequest('PUT', {
      banners: [
        { url: '/brand/hero2-web.jpg', altText: 'Updated banner', sortOrder: 0 }
      ]
    }));
    const updateBody = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.siteContent.homepageBanners[0].altText, 'Updated banner');

    const uploadBody = new FormData();
    uploadBody.append('images', new Blob([Buffer.from('banner bytes')], { type: 'image/png' }), 'new-banner.png');
    const uploadResponse = await fetch(`http://127.0.0.1:${port}/api/admin/site-content/homepage-banners/images`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: uploadBody
    });
    const uploadJson = await uploadResponse.json();

    assert.equal(uploadResponse.status, 201);
    assert.match(uploadJson.banners.at(-1).url, /^\/uploads\/banners\/homepage-banner-/);

    const savedContent = JSON.parse(await fs.readFile(siteContentFile, 'utf8'));
    assert.equal(savedContent.homepageBanners.length, 2);
    assert.equal(savedContent.homepageBanners[1].altText, 'Homepage banner');

    const logoBody = new FormData();
    logoBody.append('image', new Blob([Buffer.from('logo bytes')], { type: 'image/png' }), 'new-logo.png');
    const logoResponse = await fetch(`http://127.0.0.1:${port}/api/admin/site-content/logo/image`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: logoBody
    });
    const logoJson = await logoResponse.json();

    assert.equal(logoResponse.status, 201);
    assert.match(logoJson.siteContent.logo.url, /^\/uploads\/logos\/site-logo-/);
    assert.equal(logoJson.siteContent.logo.altText, 'Maria Clara Clothing logo');

    const savedLogoContent = JSON.parse(await fs.readFile(siteContentFile, 'utf8'));
    assert.match(savedLogoContent.logo.url, /^\/uploads\/logos\/site-logo-/);

    const blackLogoBody = new FormData();
    blackLogoBody.append('image', new Blob([Buffer.from('black logo bytes')], { type: 'image/png' }), 'black-logo.png');
    const blackLogoResponse = await fetch(`http://127.0.0.1:${port}/api/admin/site-content/black-logo/image`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: blackLogoBody
    });
    const blackLogoJson = await blackLogoResponse.json();

    assert.equal(blackLogoResponse.status, 201);
    assert.match(blackLogoJson.siteContent.blackLogo.url, /^\/uploads\/logos\/site-logo-/);
    assert.equal(blackLogoJson.siteContent.blackLogo.altText, 'Maria Clara Clothing black logo');

    const menuLogoBody = new FormData();
    menuLogoBody.append('image', new Blob([Buffer.from('menu logo bytes')], { type: 'image/png' }), 'menu-logo.png');
    const menuLogoResponse = await fetch(`http://127.0.0.1:${port}/api/admin/site-content/menu-logo/image`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: menuLogoBody
    });
    const menuLogoJson = await menuLogoResponse.json();

    assert.equal(menuLogoResponse.status, 201);
    assert.match(menuLogoJson.siteContent.menuLogo.url, /^\/uploads\/logos\/site-logo-/);
    assert.equal(menuLogoJson.siteContent.menuLogo.altText, 'Maria Clara Clothing menu logo');

    const footerLogoBody = new FormData();
    footerLogoBody.append('image', new Blob([Buffer.from('footer logo bytes')], { type: 'image/png' }), 'footer-logo.png');
    const footerLogoResponse = await fetch(`http://127.0.0.1:${port}/api/admin/site-content/footer-logo/image`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: footerLogoBody
    });
    const footerLogoJson = await footerLogoResponse.json();

    assert.equal(footerLogoResponse.status, 201);
    assert.match(footerLogoJson.siteContent.footerLogo.url, /^\/uploads\/logos\/site-logo-/);
    assert.equal(footerLogoJson.siteContent.logo.url, savedLogoContent.logo.url);

    const savedFooterLogoContent = JSON.parse(await fs.readFile(siteContentFile, 'utf8'));
    assert.match(savedFooterLogoContent.footerLogo.url, /^\/uploads\/logos\/site-logo-/);
    assert.match(savedFooterLogoContent.blackLogo.url, /^\/uploads\/logos\/site-logo-/);
    assert.match(savedFooterLogoContent.menuLogo.url, /^\/uploads\/logos\/site-logo-/);
    assert.match(savedFooterLogoContent.logo.url, /^\/uploads\/logos\/site-logo-/);
  } finally {
    server.close();
    if (previousSiteContentFile === undefined) delete process.env.SITE_CONTENT_FILE;
    else process.env.SITE_CONTENT_FILE = previousSiteContentFile;
    if (previousBannerUploadDir === undefined) delete process.env.BANNER_UPLOAD_DIR;
    else process.env.BANNER_UPLOAD_DIR = previousBannerUploadDir;
    if (previousLogoUploadDir === undefined) delete process.env.LOGO_UPLOAD_DIR;
    else process.env.LOGO_UPLOAD_DIR = previousLogoUploadDir;
    if (previousAdminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previousAdminToken;
  }
});
