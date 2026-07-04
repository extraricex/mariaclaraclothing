export function freeShippingOffer(shipping, quantity) {
  if (!shipping?.freeShippingEnabled) return null;
  const threshold = Math.max(1, Number(shipping.freeShippingMinimumItems || 2));
  const itemCount = Math.max(0, Number(quantity || 0));
  const remaining = Math.max(0, threshold - itemCount);
  if (!remaining) {
    return {
      state: 'unlocked',
      title: 'FREE SHIPPING UNLOCKED',
      body: 'Your order qualifies automatically.'
    };
  }
  if (!itemCount) {
    return {
      state: 'offer',
      title: `GET ${threshold}+ ITEMS — FREE SHIPPING`,
      body: 'Your shipping fee is on us.'
    };
  }
  return {
    state: 'progress',
    title: `ADD ${remaining} MORE ITEM${remaining === 1 ? '' : 'S'}`,
    body: 'Unlock free shipping on this order.'
  };
}

export function selectNewArrivalRecommendation(products, randomValue = Math.random()) {
  const eligible = (Array.isArray(products) ? products : []).filter((product) => {
    const collections = Array.isArray(product?.collections) ? product.collections : [product?.collection];
    return collections.includes('New Arrivals')
      && Boolean(product?.slug)
      && Boolean(product?.images?.[0]?.url);
  });
  if (!eligible.length) return null;
  const normalizedRandom = Math.min(0.999999, Math.max(0, Number(randomValue) || 0));
  return eligible[Math.floor(normalizedRandom * eligible.length)];
}
