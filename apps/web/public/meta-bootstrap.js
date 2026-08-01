(function bootstrapMariaClaraMetaPixel() {
  var settingsRequest = fetch('/api/storefront-settings', {
    cache: 'no-cache',
    credentials: 'same-origin'
  }).then(function parseSettings(response) {
    if (!response.ok) throw new Error('Could not load storefront settings.');
    return response.json();
  }).then(function selectSettings(body) {
    return body.settings || {};
  });

  window.__mariaClaraStorefrontSettingsPromise = settingsRequest;
})();
