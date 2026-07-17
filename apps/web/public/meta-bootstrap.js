(function bootstrapMariaClaraMetaPixel() {
  var privacySafeFallback = {
    enabled: false,
    pixelId: '',
    requireConsent: true,
    browserPurchaseEnabled: false
  };
  var settingsRequest = fetch('/api/storefront-settings', {
    cache: 'no-store',
    credentials: 'same-origin'
  }).then(function parseSettings(response) {
    if (!response.ok) throw new Error('Could not load storefront settings.');
    return response.json();
  }).then(function selectSettings(body) {
    return body.settings || {};
  });

  window.__mariaClaraStorefrontSettingsPromise = settingsRequest;

  function startMetaPixel(pixel) {
    var config = pixel || privacySafeFallback;
    var pixelId = String(config.pixelId || '').trim();
    var enabled = Boolean(config.enabled && /^\d{5,30}$/.test(pixelId));
    var requireConsent = Boolean(config.requireConsent);
    var browserPurchaseEnabled = Boolean(config.browserPurchaseEnabled);
    var normalizedPath = (window.location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    var customerPath = normalizedPath !== '/admin' && !normalizedPath.startsWith('/admin/');

    window.__mariaClaraFacebookPixelConfig = {
      enabled: enabled,
      pixelId: enabled ? pixelId : '',
      requireConsent: requireConsent,
      browserPurchaseEnabled: browserPurchaseEnabled
    };
    // Server CAPI is authoritative until Meta account-side automatic Purchase
    // rules and browser/server deduplication are verified in Test Events.
    if (!enabled || !customerPath) return;

    var storedConsent = '';
    try { storedConsent = localStorage.getItem('maria-clara-meta-tracking-consent') || ''; }
    catch (_error) { storedConsent = ''; }
    var consent = !requireConsent || storedConsent === 'accepted';
    if (!consent) {
      window.__mariaClaraFacebookConsent = 'revoke';
      window.__mariaClaraFacebookPixelId = '';
      return;
    }

    !function initializePixel(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');

    if (requireConsent) fbq('consent', 'revoke');
    fbq('set', 'autoConfig', false, pixelId);
    fbq('init', pixelId);

    if (requireConsent) fbq('consent', 'grant');
    window.__mariaClaraFacebookConsent = 'grant';
    window.__mariaClaraFacebookPixelId = pixelId;
    // React's centralized route tracker sends the initial PageView with one
    // event ID shared by Pixel and the first-party CAPI bridge.
  }

  settingsRequest
    .then(function useSettings(settings) { startMetaPixel(settings.metaPixel || privacySafeFallback); })
    .catch(function disableOnSettingsFailure() { startMetaPixel(privacySafeFallback); });
})();
