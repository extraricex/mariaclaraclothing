import { useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { applySeoDescriptor, routeSeoDescriptor } from '../lib/seo.js';

export default function SEO(props) {
  const location = useLocation();
  const signature = useMemo(() => JSON.stringify({ ...props, route: location.pathname, search: location.search }), [props, location.pathname, location.search]);

  useLayoutEffect(() => {
    applySeoDescriptor({ pathname: location.pathname, ...props });
  }, [signature]);

  return null;
}

export function RouteSeoDefaults() {
  const location = useLocation();
  const firstRoute = useRef({ pathname: location.pathname, search: location.search });
  const firstPass = useRef(true);
  const hadServerSeo = useRef(typeof document !== 'undefined' && Boolean(
    document.head.querySelector('link[rel="canonical"]') || document.head.querySelector('script[data-mcc-schema]')
  ));

  useLayoutEffect(() => {
    const isInitialRoute = firstPass.current &&
      firstRoute.current.pathname === location.pathname &&
      firstRoute.current.search === location.search;
    firstPass.current = false;
    if (isInitialRoute && hadServerSeo.current) return;
    applySeoDescriptor(routeSeoDescriptor(location.pathname, location.search));
  }, [location.pathname, location.search]);

  return null;
}
