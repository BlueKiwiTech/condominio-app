import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from 'cn';

type TagVariant = 'success' | 'warning' | 'destructive' | 'neutral';

const TAG_CLASSES: Record<TagVariant, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
};

// Standard resident-portal list row: title + subtitle on the left, amount
// (+ optional status tag) right-aligned on the right — used by
// MisCuotasClient's InstallmentCard, MiComunidadClient's expense breakdown,
// and MisPagosClient's payment/report rows so every list row in the portal
// reads the same way. Always a plain bordered row on an explicit light
// background — status is communicated only through the tag, never a colored
// background — so it stays visually lighter than the container it sits in,
// e.g. the tinted "vencidas" mascot card.
export function ListRow({
  title,
  subtitle,
  amount,
  tag,
  href,
}: {
  title: string;
  subtitle: string;
  amount: string;
  tag?: { label: string; variant: TagVariant };
  // When set, the whole row links out (e.g. to the abono's detail page) --
  // MisPagosClient's confirmed-with-batch reports.
  href?: string;
}) {
  const content = (
    <>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end gap-1">
          <span className="whitespace-nowrap text-sm font-semibold">{amount}</span>
          {tag && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                TAG_CLASSES[tag.variant]
              )}
            >
              {tag.label}
            </span>
          )}
        </div>
        {href && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex w-full items-center justify-between gap-4 rounded-[var(--radius)] border bg-background p-4 transition-colors hover:bg-muted/50"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-[var(--radius)] border bg-background p-4">
      {content}
    </div>
  );
}
