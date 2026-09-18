import { Column, Text } from '@once-ui-system/core';
import type { CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { formatAmount } from '@/lib/currency';

// Stacks one amount line per currency present (never a cross-currency sum,
// RPRT-03) -- used wherever a single card/row needs to show a total that
// might have more than one currency in it (MiComunidadClient's balance
// cards, MisPagosClient's totals card).
export function CurrencyAmountList({ amounts, emptyLabel }: { amounts: CurrencyAmountMap; emptyLabel: string }) {
  const entries = Object.entries(amounts).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return (
      <Text variant="body-default-s" onBackground="neutral-weak">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <Column gap="4">
      {entries.map(([currency, amount]) => (
        <Text key={currency} variant="heading-strong-m">
          {formatAmount(amount ?? 0, currency)}
        </Text>
      ))}
    </Column>
  );
}
