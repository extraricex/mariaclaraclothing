import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { CustomerButton } from '../components/ui/Button.jsx';
import { useStorefrontSettings } from '../lib/storeSettings.js';
import SEO from '../components/SEO.jsx';
import { absoluteSeoUrl, breadcrumbStructuredData } from '../lib/seo.js';

const GUIDE_COPY = {
  '240-gsm-shirts': {
    eyebrow: 'Fabric guide',
    title: 'What Is a 240 GSM T-Shirt?',
    description: 'Learn what 240 GSM fabric weight means and how it affects the structure, coverage, and feel of a T-shirt.',
    sections: [
      ['What GSM measures', 'GSM means grams per square metre and describes fabric weight. A 240 GSM shirt uses more fabric weight than a lightweight everyday tee, giving it a more structured feel and greater coverage.'],
      ['Weight is not fit', 'Fabric weight does not describe how a shirt fits. Check the exact product page for its oversized, regular, or crop-box cut, garment measurements, and available sizes.'],
      ['Choose with real measurements', 'Compare the width and length shown on the product size chart with a shirt you already own and like. Product measurements are more useful than relying on a usual size label alone.']
    ]
  },
  't-shirt-fit-guide': {
    eyebrow: 'Fit guide',
    title: 'Choose the Right T-Shirt Fit',
    description: 'Compare oversized, regular-fit, and crop-box T-shirt cuts, then use the product measurements to choose a size.',
    sections: [
      ['Oversized fit', 'An oversized cut is intentionally roomier through the body and sleeves. The exact width, length, and shoulder measurement still varies by design.'],
      ['Regular fit', 'A regular-fit shirt follows a more familiar T-shirt shape. Review the product measurements instead of assuming that the same size fits identically across every cut.'],
      ['Crop-box fit', 'A crop-box cut combines a wider body with a shorter length. Compare both width and length with a shirt you already wear comfortably.'],
      ['Before adding to cart', 'Open the size chart beside the size choices, check current stock for the selected size, and message Maria Clara Clothing if you need help reading the measurements.']
    ]
  }
};

function paymentShippingGuide(settings) {
  const methods = (settings.paymentMethods || []).map((method) => method.label).filter(Boolean);
  const regions = (settings.shipping?.regions || []).map((region) => {
    const fee = Number(region.feeCents || 0) / 100;
    return [region.label, `Shipping is ₱${fee.toLocaleString('en-PH')}. ${region.deliveryEstimate || ''}`.trim()];
  });
  const freeShipping = settings.shipping?.freeShippingEnabled
    ? [['Free shipping', `Shipping is free when your order contains at least ${Number(settings.shipping.freeShippingMinimumItems || 2)} items.`]]
    : [];
  return {
    eyebrow: 'Order guide',
    title: 'Payment & Nationwide Shipping',
    description: 'Review the currently enabled payment methods, regional shipping fees, and delivery estimates before checkout.',
    sections: [
      ['Payment methods', methods.length
        ? `Checkout currently offers ${methods.join(' and ')}. Online-payment orders are confirmed only after the payment provider verifies payment.`
        : 'The currently available payment method is shown at checkout.'],
      ...regions,
      ...freeShipping,
      ['Delivery estimates', 'Delivery estimates begin after an order has been reviewed and prepared. The final shipping fee is calculated from the validated delivery region at checkout.']
    ]
  };
}

export default function Guide() {
  const { slug } = useParams();
  const settings = useStorefrontSettings();
  const guide = useMemo(() => slug === 'payment-and-shipping'
    ? paymentShippingGuide(settings)
    : GUIDE_COPY[slug], [settings, slug]);

  if (!guide) return null;

  const canonicalPath = `/guides/${encodeURIComponent(slug)}`;

  return (
    <article className="customer-page mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
      <SEO
        title={`${guide.title} | Maria Clara Clothing`}
        description={guide.description}
        canonical={canonicalPath}
        type="article"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: guide.title,
            description: guide.description,
            mainEntityOfPage: absoluteSeoUrl(canonicalPath),
            author: { '@type': 'Organization', name: 'Maria Clara Clothing' },
            publisher: { '@type': 'Organization', name: 'Maria Clara Clothing' }
          },
          breadcrumbStructuredData([
            { name: 'Home', path: '/' },
            { name: 'Guides', path: '/size-chart' },
            { name: guide.title }
          ])
        ]}
      />
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Guides', to: '/size-chart' }, { label: guide.title }]} />
      <p className="eyebrow mt-8">{guide.eyebrow}</p>
      <h1 className="display mt-3 text-4xl leading-tight sm:text-6xl">{guide.title}</h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-soft">{guide.description}</p>
      <div className="mt-10 space-y-8 border-t border-line pt-8">
        {guide.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2 className="text-base font-semibold uppercase tracking-[0.1em]">{heading}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{body}</p>
          </section>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <CustomerButton as={Link} to="/shop">Shop current products</CustomerButton>
        <CustomerButton as={Link} to="/size-chart" variant="secondary">View size chart</CustomerButton>
      </div>
    </article>
  );
}
