import { cn } from './cn.js';

export function CustomerSeparator({ className = '', ...props }) {
  return <div className={cn('h-px w-full bg-[var(--customer-border)]', className)} {...props} />;
}
