export function collectionSlug(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'collection';
}

export function normalizeCollectionDefinitions(collections) {
  const incoming = Array.isArray(collections) ? collections : [];
  return incoming.map((collection, index) => {
    const record = collection && typeof collection === 'object' ? collection : { name: collection };
    return {
      name: String(record.name || '').trim(),
      slug: String(record.slug || collectionSlug(record.name)).trim().toLowerCase(),
      description: String(record.description || `Explore the latest pieces in ${record.name}.`).trim(),
      imageUrl: String(record.imageUrl || '').trim(),
      visible: record.visible !== false,
      showOnHomepage: record.showOnHomepage !== false,
      showOnShop: record.showOnShop !== false,
      sortOrder: Number.isInteger(Number(record.sortOrder)) ? Number(record.sortOrder) : index,
      aliases: Array.isArray(record.aliases) ? record.aliases.map((alias) => String(alias || '').trim()).filter(Boolean) : []
    };
  }).filter((collection) => collection.name && collection.slug)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function buildStorefrontCollectionSections(products, collections) {
  const catalog = Array.isArray(products) ? products : [];
  return normalizeCollectionDefinitions(collections).reduce((sections, collection) => {
    if (!collection.visible || !collection.showOnHomepage) return sections;
    const members = collectionMembers(catalog, collection);
    if (!members.length) return sections;
    sections.push({
      id: collection.slug,
      index: String(sections.length + 1).padStart(2, '0'),
      title: collection.name,
      blurb: collection.description,
      slug: collection.slug,
      imageUrl: collection.imageUrl,
      products: members
    });
    return sections;
  }, []);
}

export function collectionMembers(catalog, collection) {
  const record = collection && typeof collection === 'object' ? collection : { name: collection, aliases: [] };
  const accepted = new Set([record.name, ...(record.aliases || [])].map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));
  return catalog.filter((product) => (product.collections || []).some((name) => accepted.has(String(name || '').trim().toLowerCase())));
}
