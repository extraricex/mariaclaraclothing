const express = require('express');
const { getStoreSettings } = require('../settings/storeSettingsRepository');

const router = express.Router();

function routeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function findPublicCollection(definitions, identifier) {
  const lookup = routeKey(identifier);
  if (!lookup) return null;
  return (definitions || []).find((collection) => (
    collection?.visible !== false && (
      routeKey(collection.slug) === lookup ||
      (collection.urlAliases || []).some((alias) => routeKey(alias) === lookup)
    )
  )) || null;
}

router.get('/:slug/route', async (req, res, next) => {
  try {
    const settings = await getStoreSettings();
    const collection = findPublicCollection(settings.collectionDefinitions, req.params.slug);
    if (!collection) return res.status(404).end();

    res.set('X-Collection-Canonical-Slug', collection.slug);
    if (routeKey(req.params.slug) !== routeKey(collection.slug)) {
      const query = new URLSearchParams(req.query).toString();
      res.set('Cache-Control', 'public, max-age=86400');
      return res.redirect(308, `/collections/${encodeURIComponent(collection.slug)}${query ? `?${query}` : ''}`);
    }

    res.set('X-Accel-Redirect', `/index.html?seo_path=${encodeURIComponent(`/collections/${collection.slug}`)}`);
    return res.status(200).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = { collectionRouter: router, findPublicCollection };
