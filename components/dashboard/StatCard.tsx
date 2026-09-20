import type { ReactNode } from 'react';
import { cn } from 'cn';

const STRIPE_CLASSES = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const;

// Quiet-outline KPI card: thin border, flat surface, optional 3px stripe on
// top for semantic color (destructive/warning/success/primary) instead of
// a full-color fill.
export function StatCard({
  stripeColor,
  children,
  className,
}: {
  stripeColor?: keyof typeof STRIPE_CLASSES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[var(--radius)] border bg-card p-5 shadow-sm',
        className
      )}
    >
      {stripeColor && (
        <div className={cn('absolute inset-x-0 top-0 h-[3px]', STRIPE_CLASSES[stripeColor])} />
      )}
      {children}
    </div>
  );
}
