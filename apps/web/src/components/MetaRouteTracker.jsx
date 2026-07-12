import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { META_CONSENT_EVENT, configureFacebookMetaPixel, flushPendingFacebookEvents, initializeFacebookMetaPixel, trackFacebookPageView } from '../lib/metaPixel.js';
import { loadStorefrontSettings } from '../lib/storeSettings.js';

export default function MetaRouteTracker() {
  const location = useLocation();
  const [consentVersion, setConsentVersion] = useState(0);
  const [pixelSettings, setPixelSettings] = useState(null);

  useEffect(() => {
    const changed = () => setConsentVersion((value) => value + 1);
    window.addEventListener(META_CONSENT_EVENT, changed);
    return () => window.removeEventListener(META_CONSENT_EVENT, changed);
  }, []);

  useEffect(() => {
    let active = true;
    loadStorefrontSettings().then((settings) => {
      if (active) setPixelSettings(settings.metaPixel);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (!pixelSettings) return;
    configureFacebookMetaPixel(pixelSettings);
    if (!initializeFacebookMetaPixel({ path, ...pixelSettings })) return;
    trackFacebookPageView(path);
    flushPendingFacebookEvents({ path });
  }, [location.pathname, location.search, consentVersion, pixelSettings]);

  return null;
}
