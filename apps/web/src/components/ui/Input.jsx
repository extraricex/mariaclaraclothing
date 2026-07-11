import { cn } from './cn.js';

export function CustomerInput({ as: Component = 'input', className = '', ...props }) {
  return (
    <Component
      className={cn(
        'customer-input min-h-11 w-full rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] px-3.5 py-2.5 text-sm text-[var(--customer-ink)] outline-none transition-colors placeholder:text-[var(--customer-muted)] focus:border-[var(--customer-ink)] disabled:bg-[var(--customer-soft)] disabled:text-[var(--customer-muted)]',
        className
      )}
      {...props}
    />
  );
}
