'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, Column, Grid, Heading, Text } from '@once-ui-system/core';
import { buildMonthlyReport, reportTotalsByCurrency, type ReportInstallment, type CreditForReport } from '@/lib/reporting/monthlyReport';
import { paidExpensesInMonth, totalExpensesInMonth, type ExpenseForReport, type CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { currencyLabel } from '@/lib/currency';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

function CurrencyAmountList({ amounts, emptyLabel }: { amounts: CurrencyAmountMap; emptyLabel: string }) {
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

  return (
    <Column gap="12" fillWidth>
      <Heading variant="heading-strong-s">{t('heading')}</Heading>
      <Grid columns="3" m={{ columns: 2 }} s={{ columns: 1 }} gap="16" fillWidth>
        <Card padding="24" radius="l" background="neutral-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('expected')}
            </Text>
            <CurrencyAmountList amounts={expected} emptyLabel={t('empty')} />
          </Column>
        </Card>
        <Card padding="24" radius="l" background="success-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('collected')}
            </Text>
            <CurrencyAmountList amounts={collected} emptyLabel={t('empty')} />
          </Column>
        </Card>
        <Card padding="24" radius="l" background="warning-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('pending')}
            </Text>
            <CurrencyAmountList amounts={pending} emptyLabel={t('empty')} />
          </Column>
        </Card>
        <Card padding="24" radius="l" background="success-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('favor')}
            </Text>
            <CurrencyAmountList amounts={favor} emptyLabel={t('empty')} />
          </Column>
        </Card>
        <Card padding="24" radius="l" background="neutral-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('paidExpenses')}
            </Text>
            <CurrencyAmountList amounts={paidExpenses} emptyLabel={t('empty')} />
          </Column>
        </Card>
        <Card padding="24" radius="l" background="warning-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {t('totalExpenses')}
            </Text>
            <CurrencyAmountList amounts={totalExpenses} emptyLabel={t('empty')} />
          </Column>
        </Card>
      </Grid>
    </Column>
  );
}
