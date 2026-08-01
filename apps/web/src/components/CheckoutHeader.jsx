import { Link } from 'react-router-dom';

export default function CheckoutHeader({ current }) {
  return (
    <>
      <header className="border-b border-[var(--customer-border)] bg-[var(--customer-surface)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-5 lg:px-8">
          <Link to="/" className="display text-xl">Maria<span className="text-accent">Clara</span></Link>
          <Link to="/cart" className="text-[12px] font-semibold uppercase tracking-[0.18em] hover:text-accent">Back to cart</Link>
        </div>
      </header>
      <nav className="mx-auto flex max-w-4xl items-center gap-2 overflow-x-auto px-4 pt-6 text-[10px] font-semibold uppercase tracking-[0.1em] text-clay sm:px-5 sm:pt-7 sm:text-[11px] sm:tracking-[0.12em] lg:px-8" aria-label="Checkout progress">
        <Link to="/cart" className="hover:text-ink">Cart</Link>
        <span aria-hidden="true">/</span>
        <span className={current === 'information' ? 'text-ink' : ''}>Information</span>
        <span aria-hidden="true">/</span>
        <span className={current === 'review' ? 'text-ink' : ''}>Review & payment</span>
      </nav>
    </>
  );
}
