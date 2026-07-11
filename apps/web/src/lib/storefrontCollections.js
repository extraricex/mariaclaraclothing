const COLLECTION_COPY = {
  'New Arrivals': 'Oversized premium shirt.',
  'Freedom of Mind': 'The statement line — graphics for loud thoughts and quiet days.'
};

function sectionId(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'collection';
}

export function buildStorefrontCollectionSections(products, collectionNames) {
  const catalog = Array.isArray(products) ? products : [];
  const names = Array.isArray(collectionNames) ? collectionNames : [];
  return names.reduce((sections, name) => {
    if (String(name || '').trim().toLowerCase() === 'best sellers') return sections;
    const members = collectionMembers(catalog, name);
    if (!members.length) return sections;
    sections.push({
      id: sectionId(name),
      index: String(sections.length + 1).padStart(2, '0'),
      title: name,
      blurb: COLLECTION_COPY[name] || `Explore the latest pieces in ${name}.`,
      products: members
    });
    return sections;
  }, []);
}

function collectionMembers(catalog, name) {
  return catalog.filter((product) => (product.collections || []).includes(name));
}
