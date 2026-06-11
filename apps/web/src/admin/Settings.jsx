const WORKING_NOW = [
  'Dashboard overview with sales trend, work queues, and inventory health',
  'Order review, status management, and J&T Excel export',
  'Product editor with variants, pricing, and image manager',
  'Storefront collections manager',
  'Homepage banner editor'
];

const COMING_NEXT = [
  'Customer profiles (repeat-buyer history for COD trust)',
  'Discount rules and promo codes',
  'Shipping settings editor (fees and regions)',
  'Order status SMS notifications',
  'Inventory movement history'
];

const SHIPPING_RULES = [
  ['Metro Manila & Cavite', '₱80'],
  ['Luzon provinces', '₱120'],
  ['Visayas & Mindanao', '₱180'],
  ['Any 2+ items', 'Free shipping']
];

export default function Settings() {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Settings</p>
      <h1 className="display mt-1 text-3xl">Control center</h1>
      <p className="mt-2 text-sm text-ink-soft">
        What is ready now and what is coming later. The "coming next" items are detailed in
        the enhancement proposals document awaiting review.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="border border-line bg-paper p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Working now</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
            {WORKING_NOW.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="font-bold text-[#2f7d32]">✓</span>{item}
              </li>
            ))}
          </ul>
        </section>
        <section className="border border-line bg-paper p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Coming next</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
            {COMING_NEXT.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="font-bold text-accent">→</span>{item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4 border border-line bg-paper p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Current shipping rules</h2>
        <p className="mt-1 text-xs text-clay">
          Fixed business rules applied at checkout. Editing these requires a code change until
          the shipping settings editor ships.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          {SHIPPING_RULES.map(([region, fee]) => (
            <div key={region} className="flex justify-between border-b border-line/60 pb-2 last:border-0">
              <dt className="text-ink-soft">{region}</dt>
              <dd className="font-semibold">{fee}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-4 border border-line bg-paper p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Store defaults</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {[
            ['Payment method', 'Cash on Delivery only'],
            ['Courier', 'J&T Express'],
            ['Low stock threshold', '12 pieces'],
            ['Currency', 'Philippine Peso (₱)'],
            ['Order confirmation', 'Text message before shipping']
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-line/60 pb-2 last:border-0">
              <dt className="text-ink-soft">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
