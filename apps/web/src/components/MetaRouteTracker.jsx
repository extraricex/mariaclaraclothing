import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { META_CONSENT_EVENT, configureFacebookMetaPixel, flushPendingFacebookEvents, initializeFacebookMetaPixel, trackFacebookPageView } from '../lib/metaPixel.js';
import { loadStorefrontSettings } from '../lib/storeSettings.js';

export default function MetaRouteTracker() {
  const location = useLocation();
  const [consentVersion, setConsentVersion] = useState(0);
  const [pixelSettings, setPixelSettings] = useState(null);
  const [pixelReady, setPixelReady] = useState(false);

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
    if (!pixelSettings?.enabled) return undefined;
    let completed = false;
    let idleId = 0;
    const finish = () => {
      if (completed) return;
      completed = true;
      setPixelReady(true);
    };
    const afterLoad = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(finish, { timeout: 1500 });
      } else {
        idleId = window.setTimeout(finish, 250);
      }
    };
    const interactionEvents = ['pointerdown', 'touchstart', 'keydown'];
    interactionEvents.forEach((eventName) => window.addEventListener(eventName, finish, { once: true, passive: true }));
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once: true });
    const maximumDelay = window.setTimeout(finish, 3500);
    return () => {
      window.removeEventListener('load', afterLoad);
      interactionEvents.forEach((eventName) => window.removeEventListener(eventName, finish));
      window.clearTimeout(maximumDelay);
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [pixelSettings]);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (!pixelSettings) return;
    configureFacebookMetaPixel(pixelSettings);
    if (!pixelReady) {
      trackFacebookPageView(path);
      return;
    }
    const initialized = initializeFacebookMetaPixel({ path, ...pixelSettings });
    trackFacebookPageView(path);
    if (initialized) flushPendingFacebookEvents({ path });
  }, [location.pathname, location.search, consentVersion, pixelReady, pixelSettings]);

  return null;
}
