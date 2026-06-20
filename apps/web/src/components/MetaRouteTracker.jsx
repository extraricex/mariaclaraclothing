import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initializeFacebookMetaPixel, trackFacebookPageView } from '../lib/metaPixel.js';

export default function MetaRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (!initializeFacebookMetaPixel({ path })) return;
    trackFacebookPageView(path);
  }, [location.pathname, location.search]);

  return null;
}
