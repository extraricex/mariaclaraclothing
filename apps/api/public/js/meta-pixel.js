(function retireLegacyMetaPixel() {
  // The static storefront is retained only as a compatibility fallback. Meta
  // tracking belongs exclusively to the React storefront and its first-party
  // CAPI bridge, so this file intentionally contains no Pixel initialization
  // or event dispatch implementation.
  function retiredMetaPixelEvent() { return false; }
  window.trackMetaPixelEvent = retiredMetaPixelEvent;
  window.trackMetaPixelViewContent = retiredMetaPixelEvent;
  window.trackMetaPixelAddToCart = retiredMetaPixelEvent;
  window.trackMetaPixelInitiateCheckout = retiredMetaPixelEvent;
})();
