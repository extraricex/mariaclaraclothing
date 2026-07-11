import { Link } from 'react-router-dom';
import { useStorefrontSettings } from '../lib/storeSettings.js';

export default function SizeChart() {
  const settings = useStorefrontSettings();
  const sizeChart = settings.sizeChart || {};

  return (
    <div className="mx-auto max-w-4xl px-5 py-14 lg:px-8">
      <p className="eyebrow">Fit guide</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">Size Chart</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Check measurements before ordering. Product measurements may vary slightly because garments are measured by hand.
      </p>

      <div className="mt-8 overflow-hidden border border-line bg-white">
        {sizeChart.imageUrl ? (
          <img
            src={sizeChart.imageUrl}
            alt={sizeChart.altText || 'Maria Clara Clothing size chart'}
            className="w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="p-8 text-sm text-ink-soft">
            Size chart image is not configured yet.
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/" className="btn-ink customer-compact-button">Shop products</Link>
        <Link to="/faq" className="btn-ghost customer-compact-button">Read FAQ</Link>
      </div>
    </div>
  );
}
