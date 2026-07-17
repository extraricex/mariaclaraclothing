const express = require('express');
const { storefrontOrigin } = require('../seo/storefrontSeo');

const router = express.Router();

function buildRobotsTxt(siteUrl) {
  const origin = storefrontOrigin(siteUrl);
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /account',
    'Disallow: /checkout',
    'Disallow: /thank-you',
    'Disallow: /cart',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    ''
  ].join('\n');
}

router.get('/', (_req, res) => {
  res.set({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  });
  res.status(200).send(buildRobotsTxt(process.env.FRONTEND_URL));
});

module.exports = { buildRobotsTxt, robotsRouter: router };
