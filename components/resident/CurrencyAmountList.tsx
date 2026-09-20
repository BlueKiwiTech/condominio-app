import type { CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { formatAmount } from '@/lib/currency';

// Stacks one amount line per currency present (never a cross-currency sum,
// RPRT-03) — used wherever a single card/row needs to show a total that
// might have more than one currency in it.
export function CurrencyAmountList({ amounts, emptyLabel }: { amounts: CurrencyAmountMap; emptyLabel: string }) {
  const entries = Object.entries(amounts).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {entries.map(([currency, amount]) => (
        <span key={currency} className="text-xl font-bold">
          {formatAmount(amount ?? 0, currency)}
        </span>
      ))}
    </div>
  );
}
