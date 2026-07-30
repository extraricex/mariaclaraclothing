const routeLoaders = {
  product: () => import('../pages/Product.jsx'),
  shop: () => import('../pages/Shop.jsx')
};
const prefetchedRoutes = new Set();

function connectionAllowsPrefetch() {
  const connection = navigator.connection;
  if (connection?.saveData) return false;
  return !['slow-2g', '2g'].includes(String(connection?.effectiveType || '').toLowerCase());
}

export function prefetchCustomerRoute(route) {
  if (typeof window === 'undefined' || !connectionAllowsPrefetch()) return false;
  const loader = routeLoaders[route];
  if (!loader || prefetchedRoutes.has(route)) return false;
  prefetchedRoutes.add(route);
  const load = () => loader().catch(() => prefetchedRoutes.delete(route));
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 1000 });
  else window.setTimeout(load, 0);
  return true;
}

export function resetRoutePrefetchForTests() {
  prefetchedRoutes.clear();
}
