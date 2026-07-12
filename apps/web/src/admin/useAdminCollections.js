import { useCallback, useEffect, useState } from 'react';
import { adminJson } from '../lib/adminApi.js';
import { DEFAULT_COLLECTION_DEFINITIONS } from '../lib/storeSettings.js';
import { normalizeCollectionDefinitions } from '../lib/storefrontCollections.js';

export const DEFAULT_STOREFRONT_COLLECTIONS = DEFAULT_COLLECTION_DEFINITIONS.map((collection) => collection.name);

export default function useAdminCollections() {
  const [collections, setCollections] = useState(DEFAULT_STOREFRONT_COLLECTIONS);
  const [collectionDefinitions, setCollectionDefinitions] = useState(DEFAULT_COLLECTION_DEFINITIONS);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const body = await adminJson('/api/admin/collections');
      const definitions = normalizeCollectionDefinitions(
        Array.isArray(body.collectionDefinitions) && body.collectionDefinitions.length
          ? body.collectionDefinitions
          : (body.collections || DEFAULT_COLLECTION_DEFINITIONS)
      );
      const next = definitions.map((collection) => collection.name);
      setCollections(next);
      setCollectionDefinitions(definitions);
      setError('');
      return next;
    } catch (requestError) {
      setError(requestError.message);
      return DEFAULT_STOREFRONT_COLLECTIONS;
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { collections, collectionDefinitions, error, reload };
}
