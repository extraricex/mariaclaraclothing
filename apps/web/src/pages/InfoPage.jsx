export const FAQ_SECTIONS = [
  ['How does Cash on Delivery work?', 'Place your order online — no payment needed. We text your mobile number to confirm, then ship via J&T Express. You pay the rider in cash when the parcel arrives.'],
  ['How long is delivery?', 'Metro Manila and Cavite: 2–4 days. Other Luzon provinces: 3–6 days. Visayas and Mindanao: 5–8 days. We confirm by text before shipping.'],
  ['How much is shipping?', 'Metro Manila & Cavite ₱80, Luzon ₱120, Visayas/Mindanao ₱180. Order any 2 items and shipping is free.'],
  ['What if my size is sold out?', 'Drops are limited runs. Follow our socials for restocks — once a run sells through, it usually does not return.'],
  ['What is 240 GSM cotton?', 'GSM is fabric weight. 240 GSM is heavyweight tee territory: structured, opaque, and it keeps its shape after repeated washing.']
];

export const SHIPPING_SECTIONS = [
  ['Shipping coverage', 'We ship nationwide via J&T Express with structured Philippine addresses (province, city/municipality, barangay). Some barangays are not confirmed for door-to-door delivery; we review those orders before shipping and coordinate by text.'],
  ['Shipping rates', 'Metro Manila & Cavite ₱80 · Luzon ₱120 · Visayas/Mindanao ₱180. Free shipping on any order of 2 or more items.'],
  ['Order confirmation', 'Every COD order is confirmed by text message before it ships. Unreachable numbers may cause the order to be cancelled.'],
  ['Returns & exchanges', 'Wrong or damaged item? Message us within 7 days of delivery with photos and we will arrange a replacement. Items must be unworn and unwashed. Size exchanges are subject to stock availability; buyer shoulders return shipping for size exchanges.']
];

export const TERMS_SECTIONS = [
  ['Orders', 'All orders are Cash on Delivery and are confirmed via text message before fulfillment. We reserve the right to cancel orders we cannot confirm.'],
  ['Pricing', 'Prices are in Philippine pesos and may change without notice. The price at the time of your order is what you pay.'],
  ['Product', 'Colors may vary slightly from photos due to screen settings and photography lighting. Measurements in size charts have a ±2cm tolerance.'],
  ['Privacy', 'Your name, mobile number, and address are used only to fulfill and deliver your order. We never sell your information.'],
  ['Contact', 'Questions about these terms? Reach us through our social channels or the contact details on your order confirmation text.']
];

export default function InfoPage({ title, sections }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 lg:px-8">
      <p className="eyebrow">Maria Clara Clothing</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">{title}</h1>
      <div className="mt-10">
        {sections.map(([heading, body], index) => (
          <details key={heading} className="group border-t border-line py-5" open={index === 0}>
            <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold uppercase tracking-[0.12em]">
              {heading}
              <span className="text-accent transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
          </details>
        ))}
        <div className="hairline" />
      </div>
    </div>
  );
}
