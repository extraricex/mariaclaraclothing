import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CheckoutHeader from '../components/CheckoutHeader.jsx';
import { formatMoney } from '../lib/money.js';

const PAYMENT_METHODS = [
  {
    id: 'cash_on_delivery',
    label: 'Cash on Delivery',
    description: 'Pay cash to the rider when your order arrives.'
  },
  {
    id: 'paymongo',
    label: 'Online Payment',
    description: 'Continue to PayMongo secure checkout to see the available online payment options.'
  }
];

const SAMPLE_ITEM = {
  productName: 'Maria Clara Everyday Dress',
  size: 'Medium',
  quantity: 1,
  unitPriceCents: 129900
};

function PaymentChoice({ method, selected, onSelect }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[8px] border px-4 py-4 text-sm transition-colors ${
        selected ? 'border-ink bg-white shadow-sm' : 'border-line bg-white/60 hover:border-clay'
      }`}
    >
      <input
        type="radio"
        name="preview-payment-method"
        value={method.id}
        checked={selected}
        onChange={() => onSelect(method.id)}
      />
      <span className="min-w-0">
        <span className="block font-semibold">{method.label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{method.description}</span>
      </span>
    </label>
  );
}

export default function CheckoutPaymentTopPreview() {
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const onlinePayment = paymentMethod === 'paymongo';

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Checkout Payment Placement Preview | Maria Clara Clothing';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="customer-checkout-shell min-h-screen min-w-0 overflow-x-hidden bg-[var(--customer-bg)]">
      <div className="border-b border-[#cfaa6d] bg-[#fff5df] px-5 py-3 text-center text-xs font-semibold leading-relaxed text-[#6c471f]">
        Visual companion only — proposed checkout layout. No order will be submitted from this page.
      </div>
      <CheckoutHeader current="review" />

      <main className="mx-auto grid w-full min-w-0 max-w-6xl gap-7 px-5 pb-14 pt-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] lg:px-8">
        <section className="customer-card w-full min-w-0 max-w-full rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm sm:p-7">
          <p className="eyebrow">Final review</p>
          <h1 className="display mt-2 text-3xl leading-tight sm:text-4xl">Review and payment</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Choose how you would like to pay and place your order. Your delivery details remain below for review.
          </p>

          <div className="mt-6 rounded-[8px] border-2 border-ink bg-[var(--customer-accent-soft)]/35 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-deep">Complete your order</p>
                <h2 className="mt-1 text-base font-semibold">Payment method</h2>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-clay">
                Moved to top
              </span>
            </div>

            <fieldset className="mt-4 space-y-3">
              <legend className="sr-only">Payment method</legend>
              {PAYMENT_METHODS.map((method) => (
                <PaymentChoice
                  key={method.id}
                  method={method}
                  selected={paymentMethod === method.id}
                  onSelect={setPaymentMethod}
                />
              ))}
            </fieldset>

            <button
              type="button"
              className="btn-ink customer-compact-button mt-4 w-full"
              onClick={() => {}}
            >
              {onlinePayment ? 'Proceed to Online Payment' : 'Place Order - Cash on Delivery'}
            </button>
            <p className="mt-3 text-center text-xs text-clay">
              {onlinePayment
                ? 'Your payment status becomes Paid only after PayMongo confirms it securely.'
                : 'Your order is created only once when you press the button above.'}
            </p>
          </div>

          <section className="mt-7 min-w-0 max-w-full rounded-[8px] border border-line bg-white p-4 sm:p-5" aria-labelledby="preview-customer-heading">
            <div className="flex items-start justify-between gap-4">
              <h2 id="preview-customer-heading" className="text-sm font-semibold uppercase tracking-[0.12em]">Customer information</h2>
              <span className="shrink-0 text-xs font-semibold text-accent underline">Edit</span>
            </div>
            <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-clay">First Name</dt><dd className="font-semibold">Maria</dd></div>
              <div><dt className="text-clay">Last Name</dt><dd className="font-semibold">Santos</dd></div>
              <div><dt className="text-clay">Mobile</dt><dd>0917 123 4567</dd></div>
              <div className="sm:col-span-2"><dt className="text-clay">House / Street</dt><dd>123 Sampaguita Street</dd></div>
              <div><dt className="text-clay">Barangay</dt><dd>San Lorenzo</dd></div>
              <div><dt className="text-clay">City / Municipality</dt><dd>Makati City</dd></div>
              <div><dt className="text-clay">Province</dt><dd>Metro Manila</dd></div>
            </dl>
          </section>

          <section className="mt-7 border-y border-line py-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-clay">Optional</p>
            <h2 className="mt-1 text-base font-semibold">Add one more favorite</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Product suggestions stay available after the checkout action, so they never hide the payment button.
            </p>
          </section>
        </section>

        <aside className="customer-order-summary w-full min-w-0 max-w-full self-start rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm lg:sticky lg:top-6" aria-label="Preview order summary">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Order summary</h2>
            <span className="text-xs text-accent underline">Edit cart</span>
          </div>

          <article className="mt-6 flex min-w-0 gap-4">
            <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-[6px] border border-line bg-[var(--customer-soft)]">
              <div className="flex h-full items-center justify-center px-2 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-clay">Product photo</div>
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-paper">1</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold leading-snug">{SAMPLE_ITEM.productName}</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">Size {SAMPLE_ITEM.size}</p>
              <p className="mt-1 text-xs text-ink-soft">{formatMoney(SAMPLE_ITEM.unitPriceCents)} each</p>
            </div>
            <strong className="shrink-0 text-sm">{formatMoney(SAMPLE_ITEM.unitPriceCents)}</strong>
          </article>

          <dl className="mt-7 space-y-3 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Subtotal</dt><dd>{formatMoney(129900)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Shipping</dt><dd>{formatMoney(12000)}</dd></div>
            <div className="flex justify-between gap-4 border-t border-line pt-4 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(141900)}</dd></div>
          </dl>

          <Link to="/cart" className="mt-6 block text-center text-xs font-semibold text-accent underline">
            Return to cart
          </Link>
        </aside>
      </main>
    </div>
  );
}
