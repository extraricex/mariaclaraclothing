const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const sharp = require('sharp');

const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REVIEW_IMAGES = 3;
const REVIEW_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const REVIEW_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);

function reviewUploadDir() {
  return process.env.REVIEW_UPLOAD_DIR || path.join(__dirname, '..', '..', 'public', 'uploads', 'reviews');
}

function reviewImageFileAllowed(file) {
  const extension = path.extname(file?.originalname || '').toLowerCase();
  return REVIEW_IMAGE_MIME_TYPES.has(String(file?.mimetype || '').toLowerCase()) &&
    ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
}

async function cleanupReviewFiles(files) {
  await Promise.all((Array.isArray(files) ? files : []).map(async (file) => {
    if (!file?.path) return;
    try { await fs.unlink(file.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }));
}

async function optimizeReviewImages(files) {
  const output = [];
  try {
    for (const file of Array.isArray(files) ? files : []) {
      const metadata = await sharp(file.path, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
      if (!REVIEW_IMAGE_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
        const error = new Error('Review photos must be valid JPG, PNG, or WebP images.');
        error.status = 400;
        throw error;
      }
      const outputName = `${path.parse(file.filename).name}.webp`;
      const outputPath = path.join(reviewUploadDir(), outputName);
      await sharp(file.path, { failOn: 'error', limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(outputPath);
      await fs.unlink(file.path);
      output.push({
        imageUrl: `/uploads/reviews/${outputName}`,
        path: outputPath,
        sortOrder: output.length
      });
    }
    return output;
  } catch (error) {
    await cleanupReviewFiles(files);
    await cleanupReviewFiles(output);
    throw error;
  }
}

function safeRemoteReviewImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 2048 || /^[=+\-@]/.test(raw)) throw new Error('Photo URL is invalid or unsafe.');
  let parsed;
  try { parsed = new URL(raw); } catch (_error) { throw new Error('Photo URL must be a valid HTTPS URL.'); }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateHost = host === 'localhost' || host.endsWith('.local') || privateIpAddress(host);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || privateHost) {
    throw new Error('Photo URL must be a public HTTPS URL.');
  }
  if (!/\.(jpe?g|png|webp)(?:$|\?)/i.test(parsed.pathname + parsed.search)) {
    throw new Error('Photo URL must point to a JPG, PNG, or WebP image.');
  }
  return parsed.toString();
}

function privateIpAddress(host) {
  const version = net.isIP(host);
  if (version === 4) {
    const [first, second] = host.split('.').map(Number);
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && [0, 168].includes(second)) ||
      (first === 198 && [18, 19].includes(second));
  }
  if (version === 6) {
    const firstGroup = Number.parseInt(host.split(':')[0] || '0', 16);
    return host === '::' || host === '::1' || host.startsWith('::ffff:') ||
      (firstGroup >= 0xfc00 && firstGroup <= 0xfdff) ||
      (firstGroup >= 0xfe80 && firstGroup <= 0xfebf) ||
      firstGroup >= 0xff00 || host.startsWith('2001:db8:');
  }
  return false;
}

module.exports = {
  MAX_REVIEW_IMAGE_BYTES,
  MAX_REVIEW_IMAGES,
  cleanupReviewFiles,
  optimizeReviewImages,
  reviewImageFileAllowed,
  reviewUploadDir,
  privateIpAddress,
  safeRemoteReviewImageUrl
};
