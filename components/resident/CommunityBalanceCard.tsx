'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { buildMonthlyReport, reportTotalsByCurrency, type ReportInstallment, type CreditForReport } from '@/lib/reporting/monthlyReport';
import { paidExpensesInMonth, totalExpensesInMonth, type ExpenseForReport, type CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { CurrencyAmountList } from './CurrencyAmountList';

// V2 addition: a community-wide (not per-house) balance overview for
// residents, reusing the same per-currency reporting the admin's monthly
// report and dashboard already compute -- just no house breakdown, only
// totals, per the user's request ("solo totales para que los vecinos
// tengan una vista del balance de la comunidad").
export function CommunityBalanceCard({
  installments,
  credits,
  expenses,
  today = new Date(),
}: {
  installments: ReportInstallment[];
  credits: CreditForReport[];
  expenses: ExpenseForReport[];
  today?: Date;
}) {
  const t = useTranslations('residentHome.communityBalance');

  // buildMonthlyReport groups per house_id, but this card only shows the
  // per-currency footer totals (reportTotalsByCurrency) -- no house list is
  // needed, so an empty houses array is fine (rows just get a "—" house
  // label internally that's never displayed here).
  const totals = useMemo(() => reportTotalsByCurrency(buildMonthlyReport(installments, [], credits, today, today)), [
    installments,
    credits,
    today,
  ]);

  const expected: CurrencyAmountMap = {};
  const collected: CurrencyAmountMap = {};
  const pending: CurrencyAmountMap = {};
  const favor: CurrencyAmountMap = {};
  for (const row of totals) {
    expected[row.currency] = row.expected;
    collected[row.currency] = row.paid;
    pending[row.currency] = row.pending;
    favor[row.currency] = row.favor;
  }

  const paidExpenses = useMemo(() => paidExpensesInMonth(expenses, today), [expenses, today]);
  const totalExpenses = useMemo(() => totalExpensesInMonth(expenses, today), [expenses, today]);

  const cards: { label: string; amounts: CurrencyAmountMap }[] = [
    { label: t('expected'), amounts: expected },
    { label: t('collected'), amounts: collected },
    { label: t('pending'), amounts: pending },
    { label: t('favor'), amounts: favor },
    { label: t('paidExpenses'), amounts: paidExpenses },
    { label: t('totalExpenses'), amounts: totalExpenses },
  ];

  return (
    <div className="flex w-full flex-col gap-3">
      <h2 className="text-base font-semibold">{t('heading')}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-6">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.label}</span>
              <CurrencyAmountList amounts={c.amounts} emptyLabel={t('empty')} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
