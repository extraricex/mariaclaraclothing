const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'UL', 'OL', 'LI', 'SPAN']);

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
