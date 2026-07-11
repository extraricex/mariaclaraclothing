import { useCallback, useEffect, useState } from 'react';
import { adminJson } from '../lib/adminApi.js';

export const DEFAULT_STOREFRONT_COLLECTIONS = ['New Arrivals'];

export default function useAdminCollections() {
  const [collections, setCollections] = useState(DEFAULT_STOREFRONT_COLLECTIONS);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const body = await adminJson('/api/admin/collections');
      const next = Array.isArray(body.collections) && body.collections.length
        ? body.collections
        : DEFAULT_STOREFRONT_COLLECTIONS;
      setCollections(next);
      setError('');
      return next;
    } catch (requestError) {
      setError(requestError.message);
      return DEFAULT_STOREFRONT_COLLECTIONS;
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { collections, error, reload };
}
