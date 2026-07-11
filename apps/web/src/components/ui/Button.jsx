import { cn } from './cn.js';

const variants = {
  primary: 'bg-[var(--customer-ink)] text-[var(--customer-bg)] hover:bg-[var(--customer-accent)]',
  secondary: 'border border-[var(--customer-border)] bg-[var(--customer-surface)] text-[var(--customer-ink)] hover:border-[var(--customer-ink)]',
  ghost: 'text-[var(--customer-ink)] hover:bg-[var(--customer-soft)]',
  inverse: 'bg-[var(--customer-bg)] text-[var(--customer-ink)] hover:bg-white'
};

export function CustomerButton({ as: Component = 'button', variant = 'primary', className = '', ...props }) {
  return (
    <Component
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] transition-colors disabled:pointer-events-none disabled:opacity-50',
        variants[variant] || variants.primary,
        className
      )}
      {...props}
    />
  );
}
