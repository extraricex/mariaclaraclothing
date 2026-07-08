import { cn } from './cn.js';

export function CustomerCard({ as: Component = 'div', className = '', ...props }) {
  return (
    <Component
      className={cn('customer-card rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)]', className)}
      {...props}
    />
  );
}

export function CustomerCardBody({ className = '', ...props }) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />;
}
