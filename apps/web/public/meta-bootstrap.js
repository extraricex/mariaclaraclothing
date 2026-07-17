(function bootstrapMariaClaraMetaPixel() {
  var privacySafeFallback = {
    enabled: false,
    pixelId: '',
    requireConsent: true
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
    var customerPath = !window.location.pathname.startsWith('/admin');

    window.__mariaClaraFacebookPixelConfig = {
      enabled: enabled,
      pixelId: enabled ? pixelId : '',
      requireConsent: requireConsent
    };
    if (!enabled || !customerPath) return;

    var consent = !requireConsent ||
      localStorage.getItem('maria-clara-meta-tracking-consent') === 'accepted';
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
    fbq('track', 'PageView');
    window.__mariaClaraFacebookConsent = 'grant';
    window.__mariaClaraFacebookPixelId = pixelId;
    window.__mariaClaraInitialMetaPageViewPath =
      window.location.pathname + window.location.search;
  }

  settingsRequest
    .then(function useSettings(settings) { startMetaPixel(settings.metaPixel || privacySafeFallback); })
    .catch(function disableOnSettingsFailure() { startMetaPixel(privacySafeFallback); });
})();
