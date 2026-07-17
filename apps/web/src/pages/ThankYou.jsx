import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { claimMetaPurchase, completeMetaPurchase, fetchOrderConfirmation } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';
import { clearCart, clearCheckoutIdempotencyKey, resetCartSessionId } from '../lib/cart.js';
import { clearCheckoutReviewDraft } from '../lib/checkoutDraft.js';
import { isFacebookBrowserPurchaseReady, trackFacebookPurchasePayload, wasFacebookPurchaseTracked } from '../lib/metaPixel.js';

function storedConfirmation() {
  try {
    return JSON.parse(sessionStorage.getItem('maria-clara-last-order') || 'null');
  } catch (_error) {
    return null;
  }
}

export default function ThankYou() {
  const [params] = useSearchParams();
  const orderNumber = params.get('order') || '';
  const [order, setOrder] = useState(null);
  const [confirmation] = useState(storedConfirmation);
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [storefrontSettingsLoaded, setStorefrontSettingsLoaded] = useState(false);
  const [purchaseRetry, setPurchaseRetry] = useState(0);
  const purchaseAttempts = useRef(new Set());

  useEffect(() => {
    let timer;
    let stopped = false;
    if (orderNumber && confirmation?.orderNumber === orderNumber && confirmation.confirmationToken) {
      const refresh = () => fetchOrderConfirmation(orderNumber, confirmation.confirmationToken)
        .then((body) => {
          if (stopped) return;
          setOrder(body.order);
          if (body.order.paymentMethod === 'paymongo' && body.order.paymentStatus === 'pending_payment') {
            timer = setTimeout(refresh, 2500);
          }
        }).catch(() => {
          if (!stopped) timer = setTimeout(refresh, 2500);
        });
      refresh();
    }
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [orderNumber, confirmation]);

  useEffect(() => {
    const orderStatus = String(order?.status || '').toLowerCase();
    const unsuccessfulOrder = ['cancelled', 'failed', 'expired', 'unreachable'].includes(orderStatus);
    const successfulOrder = ['received', 'confirmed', 'packed', 'shipped', 'delivered'].includes(orderStatus);
    const eligible = order?.paymentMethod === 'cash_on_delivery'
      ? !unsuccessfulOrder && successfulOrder
      : order?.paymentMethod === 'paymongo' && order.paymentStatus === 'paid' && !unsuccessfulOrder && successfulOrder;
    if (!eligible || !confirmation?.confirmationToken || confirmation.orderNumber !== order.orderNumber) return;

    clearCheckoutReviewDraft(); clearCart(); clearCheckoutIdempotencyKey(); resetCartSessionId();
    if (!storefrontSettingsLoaded || !isFacebookBrowserPurchaseReady({
      browserPurchaseEnabled: settings.metaPixel?.browserPurchaseEnabled,
      requireConsent: Boolean(settings.metaPixel?.requireConsent)
    })) return;

    const attemptKey = `${order.orderNumber}:${order.paymentStatus}:${purchaseRetry}`;
    if (purchaseAttempts.current.has(attemptKey)) return;
    purchaseAttempts.current.add(attemptKey);

    void claimMetaPurchase(order.orderNumber, confirmation.confirmationToken)
      .then(async (claim) => {
        if (!claim.shouldSend) {
          if (claim.reason === 'claim_active') {
            window.setTimeout(() => setPurchaseRetry((value) => value + 1), 125_000);
          }
          return;
        }
        const alreadyTracked = wasFacebookPurchaseTracked(claim.purchase?.eventId);
        const sent = alreadyTracked || trackFacebookPurchasePayload(claim.purchase, {
          browserPurchaseEnabled: true,
          requireConsent: Boolean(settings.metaPixel.requireConsent)
        });
        await completeMetaPurchase(
          order.orderNumber,
          confirmation.confirmationToken,
          claim.claimId,
          sent
        );
      })
      .catch(() => {
        purchaseAttempts.current.delete(attemptKey);
        window.setTimeout(() => setPurchaseRetry((value) => value + 1), 2500);
      });

  }, [confirmation, order, purchaseRetry, settings.metaPixel, storefrontSettingsLoaded]);

  useEffect(() => {
    loadStorefrontSettings().then((nextSettings) => {
      setSettings(nextSettings);
      setStorefrontSettingsLoaded(true);
    });
  }, []);

  const summary = order;

  if (!summary) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="display text-3xl">No recent order found</p>
        <Link to="/" className="btn-ink mt-8">Back to shop</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 text-center lg:py-24">
      <p className="eyebrow text-accent">Order received</p>
      <h1 className="display mt-3 text-4xl sm:text-6xl">Salamat{summary.customerFirstName ? `, ${summary.customerFirstName}` : ''}.</h1>
      <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-ink-soft">
        Your order <strong className="break-all text-ink">{summary.orderNumber}</strong> is in.
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        {summary.paymentMethod === 'cash_on_delivery'
          ? 'Thank you for your order! Your order is now complete and will be prepared for packing and shipping.'
          : summary.paymentStatus === 'paid'
            ? 'Thank you for your payment! Your order is now confirmed and will be prepared for packing and shipping.'
            : 'Your order is waiting for payment confirmation. Please complete your payment to confirm your order.'}
      </p>

      <dl className="mx-auto mt-10 max-w-md space-y-3 border border-line bg-white p-6 text-left text-sm">
        <div className="flex justify-between gap-6"><dt className="text-clay">Order no.</dt><dd className="min-w-0 break-words text-right font-semibold">{summary.orderNumber}</dd></div>
        {summary.customerName && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Customer</dt><dd className="min-w-0 break-words text-right">{summary.customerName}</dd></div>
        )}
        {summary.customer?.phone && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Contact number</dt><dd className="min-w-0 break-words text-right">{summary.customer.phone}</dd></div>
        )}
        {summary.addressLine && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Deliver to</dt><dd className="min-w-0 break-words text-right">{summary.addressLine}</dd></div>
        )}
        <div className="flex justify-between gap-6"><dt className="text-clay">Payment</dt><dd>{summary.paymentMethodLabel}</dd></div>
        <div className="flex justify-between gap-6"><dt className="text-clay">Payment status</dt><dd className="capitalize">{String(summary.paymentStatus || '').replaceAll('_', ' ')}</dd></div>
        {summary.subtotalCents !== undefined && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Subtotal</dt><dd>{formatMoney(summary.subtotalCents)}</dd></div>
        )}
        {Number(summary.discountTotalCents || 0) > 0 && (
          <div className="flex justify-between gap-6 text-accent-deep">
            <dt>{summary.discountCode ? `Discount (${summary.discountCode})` : 'Discount'}</dt>
            <dd>-{formatMoney(summary.discountTotalCents)}</dd>
          </div>
        )}
        {summary.shippingFeeCents !== undefined && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Shipping</dt><dd>{summary.shippingFeeCents ? formatMoney(summary.shippingFeeCents) : 'Free'}</dd></div>
        )}
        {summary.totalCents !== undefined && (
          <div className="flex justify-between gap-6 border-t border-line pt-3 text-base font-semibold"><dt>{summary.paymentStatus === 'paid' ? 'Total paid' : 'Total due'}</dt><dd>{formatMoney(summary.totalCents)}</dd></div>
        )}
      </dl>

      {summary.items?.length > 0 && (
        <section className="mx-auto mt-5 max-w-md border border-line bg-white p-5 text-left">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">Items ordered</h2>
          <div className="mt-4 space-y-3">
            {summary.items.map((item, index) => (
              <article key={`${item.variantId || item.productName || 'item'}-${index}`} className="flex min-w-0 items-start gap-3 border-b border-line/60 pb-3 last:border-0 last:pb-0">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.productName || 'Ordered product'} className="product-photo-blend h-20 w-16 shrink-0 object-contain" loading="lazy" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-semibold">{item.productName || 'Product'}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">
                    Qty {item.quantity}{item.size ? ` · Size ${item.size}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="font-semibold">{formatMoney(Number(item.unitPriceCents || 0) * Number(item.quantity || 0))}</p>
                  <p className="text-xs text-clay">{formatMoney(Number(item.unitPriceCents || 0))} each</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link to="/" className="btn-ink customer-compact-button">Continue shopping</Link>
        {settings.messengerUrl && (
          <a href={settings.messengerUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost customer-compact-button">
            Message Us About Your Order
          </a>
        )}
      </div>
    </div>
  );
}
