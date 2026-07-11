const COLOR_WORDS = new Set([
  'black',
  'white',
  'cream',
  'offwhite',
  'off',
  'gray',
  'grey',
  'red',
  'blue',
  'green',
  'pink',
  'brown',
  'khaki',
  'beige',
  'yellow',
  'orange',
  'navy'
]);

const NOISE_PATTERNS = [
  /\bcatalog\b/gi,
  /\bmaria\s+clara\s+clothing\b/gi,
  /\boversized\s+fit\s+100\s+cotton\b/gi,
  /\b100\s+cotton\b/gi,
  /\bcopy\s+\d+\b/gi,
  /\bcopy\b/gi
];

const STYLE_WORDS = new Set(['oversized', 'fit', 'shirt', 'tee', 'box', 'crop', 'regular', 'classic']);

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bMc\b/g, 'MC')
    .replace(/\bMcc\b/g, 'MCC');
}

function normalizeText(value) {
  return String(value || '')
    .replace(/[|_/]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeNoise(value) {
  return NOISE_PATTERNS.reduce((text, pattern) => text.replace(pattern, ' '), value)
    .replace(/\s+/g, ' ')
    .trim();
}

function isColorWord(value) {
  return COLOR_WORDS.has(String(value || '').toLowerCase());
}

function extractColor(raw, explicitColor = '') {
  if (explicitColor) return titleCase(explicitColor);
  const words = normalizeText(raw).split(' ').filter(Boolean);
  const pairIndex = words.findIndex((word, index) => word.toLowerCase() === 'off' && words[index + 1]?.toLowerCase() === 'white');
  if (pairIndex >= 0) return 'Off White';
  const color = words.find(isColorWord);
  return color ? titleCase(color) : '';
}

function truncateAdminProductCode(value, maxLength = 55) {
  const text = String(value || '').trim();
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function cleanSlugProductName(value) {
  const words = removeNoise(normalizeText(value))
    .split(' ')
    .map((word) => word.toLowerCase())
    .filter((word) => word && !isColorWord(word) && !/^\d+$/.test(word));

  const mcIndex = words.indexOf('mc');
  if (mcIndex >= 0) {
    const beforeMc = words.slice(0, mcIndex).filter((word) => STYLE_WORDS.has(word));
    const afterMc = words.slice(mcIndex);
    const duplicateStyleStart = afterMc.findIndex((word, index) => index > 0 && beforeMc.includes(word));
    const productWords = duplicateStyleStart > 0
      ? [...afterMc.slice(0, duplicateStyleStart), ...beforeMc]
      : [...afterMc, ...beforeMc];
    return titleCase([...new Set(productWords)].join(' '));
  }

  return titleCase(words.join(' '));
}

function cleanAdminProductName(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Untitled product';

  const pipeParts = raw.split('|').map((part) => normalizeText(part)).filter(Boolean);
  const candidate = pipeParts.length > 1
    ? pipeParts.filter((part) => !/maria clara clothing/i.test(part) && !COLOR_WORDS.has(part.toLowerCase())).join(' ')
    : raw;

  const cleanName = cleanSlugProductName(candidate || raw).trim();
  const fallbackName = titleCase(removeNoise(normalizeText(raw)));
  const displayName = cleanName || fallbackName || raw;

  return displayName.length > 72 ? `${displayName.slice(0, 69)}...` : displayName;
}

function adminProductDisplayParts(item = {}) {
  const rawName = String(item.productName || item.name || item.slug || item.productId || '').trim();
  const productCode = item.productId || item.slug || '';

  return {
    cleanName: cleanAdminProductName(rawName || productCode),
    color: extractColor([rawName, item.color, item.variantColor, item.slug].filter(Boolean).join(' '), item.color || item.variantColor),
    sku: String(item.sku || '').trim(),
    size: String(item.size || item.variantSize || '').trim(),
    productCode: truncateAdminProductCode(productCode)
  };
}

export {
  adminProductDisplayParts,
  cleanAdminProductName,
  truncateAdminProductCode
};
