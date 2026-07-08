import { cn } from './cn.js';

const tones = {
  default: 'border-[var(--customer-border)] bg-[var(--customer-surface)] text-[var(--customer-ink)]',
  dark: 'border-[var(--customer-ink)] bg-[var(--customer-ink)] text-[var(--customer-bg)]',
  warm: 'border-[var(--customer-accent)] bg-[var(--customer-accent-soft)] text-[var(--customer-accent)]',
  success: 'border-[#a9d7b1] bg-[#edf8ef] text-[#17682b]'
};

export function CustomerBadge({ tone = 'default', className = '', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
        tones[tone] || tones.default,
        className
      )}
      {...props}
    />
  );
}
