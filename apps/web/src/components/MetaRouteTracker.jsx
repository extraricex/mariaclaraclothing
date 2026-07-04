import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { META_CONSENT_EVENT, initializeFacebookMetaPixel, trackFacebookPageView } from '../lib/metaPixel.js';

export default function MetaRouteTracker() {
  const location = useLocation();
  const [consentVersion, setConsentVersion] = useState(0);

  useEffect(() => {
    const changed = () => setConsentVersion((value) => value + 1);
    window.addEventListener(META_CONSENT_EVENT, changed);
    return () => window.removeEventListener(META_CONSENT_EVENT, changed);
  }, []);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (!initializeFacebookMetaPixel({ path })) return;
    trackFacebookPageView(path);
  }, [location.pathname, location.search, consentVersion]);

  return null;
}
