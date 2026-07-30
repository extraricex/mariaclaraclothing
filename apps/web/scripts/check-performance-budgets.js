import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const webRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(webRoot, 'dist');
const assetRoot = path.join(distRoot, 'assets');
const budgets = {
  largestJavaScriptGzip: 100 * 1024,
  customerCssGzip: 20 * 1024,
  headerLogo: 20 * 1024,
  mobileHero: 60 * 1024
};

async function builtAssets(extension) {
  return (await readdir(assetRoot))
    .filter((name) => name.endsWith(extension))
    .map((name) => path.join(assetRoot, name));
}

async function compressedBytes(filePath) {
  return gzipSync(await readFile(filePath), { level: 9 }).byteLength;
}

async function largestCompressed(files) {
  const records = await Promise.all(files.map(async (filePath) => ({
    filePath,
    bytes: await compressedBytes(filePath)
  })));
  return records.sort((left, right) => right.bytes - left.bytes)[0] || { filePath: '', bytes: 0 };
}

async function assertBudget(label, actual, maximum) {
  if (actual <= maximum) {
    console.log(`PASS ${label}: ${actual} bytes <= ${maximum} bytes`);
    return;
  }
  throw new Error(`${label} exceeded: ${actual} bytes > ${maximum} bytes`);
}

const largestJavaScript = await largestCompressed(await builtAssets('.js'));
const largestCss = await largestCompressed(await builtAssets('.css'));
const headerLogo = await stat(path.join(webRoot, '..', 'api', 'public', 'brand', 'logo-256.webp'));
const mobileHero = await stat(path.join(webRoot, '..', 'api', 'public', 'brand', 'hero1v2-1200.webp'));

await assertBudget(`largest JS gzip (${path.basename(largestJavaScript.filePath)})`, largestJavaScript.bytes, budgets.largestJavaScriptGzip);
await assertBudget(`customer CSS gzip (${path.basename(largestCss.filePath)})`, largestCss.bytes, budgets.customerCssGzip);
await assertBudget('header logo', headerLogo.size, budgets.headerLogo);
await assertBudget('mobile hero', mobileHero.size, budgets.mobileHero);
