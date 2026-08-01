const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const RESPONSIVE_WIDTHS = new Set([320, 800, 1600]);
const inFlight = new Map();

function responsiveUploadRequest(requestPath) {
  const normalized = String(requestPath || '').split('?', 1)[0];
  const match = normalized.match(/^\/uploads\/(.+)-(320|800|1600)\.webp$/i);
  if (!match || match[1].includes('..') || match[1].includes('\\')) return null;
  const width = Number(match[2]);
  if (!RESPONSIVE_WIDTHS.has(width)) return null;
  return { relativeStem: match[1], width };
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) return candidate;
    } catch (_error) {
      // Try the next supported original format.
    }
  }
  return '';
}

async function ensureResponsiveUpload({ publicDirectory, requestPath }) {
  const request = responsiveUploadRequest(requestPath);
  if (!request) return false;
  const uploadsRoot = path.resolve(publicDirectory, 'uploads');
  const target = path.resolve(uploadsRoot, `${request.relativeStem}-${request.width}.webp`);
  if (!inside(uploadsRoot, target)) return false;

  try {
    const stats = await fs.stat(target);
    if (stats.isFile()) return true;
  } catch (_error) {
    // Generate the missing derivative below.
  }

  const sourceStem = path.resolve(uploadsRoot, request.relativeStem);
  if (!inside(uploadsRoot, sourceStem)) return false;
  const source = await firstExisting([
    `${sourceStem}-optimized.webp`,
    `${sourceStem}.webp`,
    `${sourceStem}.png`,
    `${sourceStem}.jpg`,
    `${sourceStem}.jpeg`
  ]);
  if (!source) return false;

  const key = target;
  if (!inFlight.has(key)) {
    inFlight.set(key, (async () => {
      const temporary = `${target}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await sharp(source, { animated: false })
          .rotate()
          .resize({ width: request.width, height: request.width, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: request.width <= 320 ? 78 : 82, alphaQuality: 92 })
          .toFile(temporary);
        await fs.rename(temporary, target);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return true;
    })().finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

function createResponsiveUploadMiddleware({ publicDirectory }) {
  return async function responsiveUploadMiddleware(req, _res, next) {
    try {
      await ensureResponsiveUpload({ publicDirectory, requestPath: req.path });
    } catch (_error) {
      // The original image remains the client-side fallback. A derivative
      // generation failure must never take down the storefront.
    }
    return next();
  };
}

module.exports = {
  RESPONSIVE_WIDTHS,
  createResponsiveUploadMiddleware,
  ensureResponsiveUpload,
  responsiveUploadRequest
};
