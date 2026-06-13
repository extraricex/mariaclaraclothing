const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'UL', 'OL', 'LI', 'SPAN']);
const ALLOWED_STYLES = new Set(['color', 'font-size', 'font-weight', 'font-style', 'text-decoration']);

function safeStyleValue(property, value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (property === 'color') {
    return /^#[0-9a-f]{3,6}$/i.test(candidate) || /^rgb(a)?\([\d\s,%.]+\)$/i.test(candidate) ? candidate : '';
  }
  if (property === 'font-size') {
    return /^(13|16|20|28)px$/.test(candidate) ? candidate : '';
  }
  if (property === 'font-weight') {
    return /^(400|500|700|bold|normal)$/.test(candidate) ? candidate : '';
  }
  if (property === 'font-style') {
    return /^(normal|italic)$/.test(candidate) ? candidate : '';
  }
  if (property === 'text-decoration') {
    return /^(none|underline)$/.test(candidate) ? candidate : '';
  }
  return '';
}

function copySafeStyles(source, target) {
  ALLOWED_STYLES.forEach((property) => {
    const value = safeStyleValue(property, source.style.getPropertyValue(property));
    if (value) target.style.setProperty(property, value);
  });
}

function sanitizeNode(node, doc) {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName.toUpperCase();
  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = doc.createDocumentFragment();
    node.childNodes.forEach((child) => {
      const clean = sanitizeNode(child, doc);
      if (clean) fragment.appendChild(clean);
    });
    return fragment;
  }

  const element = doc.createElement(tag.toLowerCase());
  if (tag === 'SPAN') {
    copySafeStyles(node, element);
  }
  if (tag === 'A') {
    const href = String(node.getAttribute('href') || '');
    if (/^(https?:|\/)/i.test(href)) {
      element.setAttribute('href', href);
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  node.childNodes.forEach((child) => {
    const clean = sanitizeNode(child, doc);
    if (clean) element.appendChild(clean);
  });
  return element;
}

export function sanitizeRichHtml(html) {
  const source = String(html || '');
  if (!source.trim()) return '';
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const doc = document.implementation.createHTMLDocument('');
  const container = doc.createElement('div');
  parsed.body.childNodes.forEach((node) => {
    const clean = sanitizeNode(node, doc);
    if (clean) container.appendChild(clean);
  });
  return container.innerHTML;
}
