'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Column, Row, Grid, Card, Heading, Text, Select, Chip } from '@once-ui-system/core';
import { creditsByCurrency, outstandingByCurrency, type CurrencyAmountMap } from '@/lib/reporting/dashboard';
import { currencyLabel } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { ResidentPortalData, CommunityBalanceData } from '@/lib/resident/queries';
import { ListRow } from './ListRow';
import { CurrencyAmountList } from './CurrencyAmountList';

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currencyLabel(currency)}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// V3 · Mi comunidad (replaces Mi hogar as the resident landing page, per
// board feedback 2026-09-18): "lo más sencilla e intuitiva posible" -- this
// screen drops the per-house credit/debt cards, upcoming-installments list,
// and "reportar pago" button that used to live here (those belong to
// Mis cuotas / Mis pagos going forward, not built as part of this change).
// What's left: two always-current community totals (saldo disponible =
// favor, saldo pendiente = pending, reusing the same buildMonthlyReport/
// reportTotalsByCurrency math CommunityBalanceCard already uses for
// /mi-hogar) plus a month/year-filterable expense total + breakdown list.
export function MiComunidadClient({
  data,
  communityBalance,
}: {
  data: ResidentPortalData;
  communityBalance: CommunityBalanceData;
}) {
  const t = useTranslations('residentHome');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const house = data.house!;
  const today = useMemo(() => new Date(), []);

  // No individual resident identity exists (login is per-house PIN, not
  // per-person) -- owner_name is the closest thing to a personal greeting,
  // falling back to the house label when it's unset.
  const displayName = house.owner_name ?? (house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number);

  // All-time, not month-scoped: every house's positive credit balance
  // (saldo disponible) and every non-paid installment's remaining balance
  // (saldo pendiente), regardless of due date -- not just the current month.
  const available = useMemo(() => creditsByCurrency(communityBalance.credits), [communityBalance.credits]);
  const pending = useMemo(() => outstandingByCurrency(communityBalance.installments), [communityBalance.installments]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([getYear(today)]);
    for (const e of communityBalance.expenses) years.add(getYear(parseISO(e.period_date)));
    return Array.from(years).sort((a, b) => a - b);
  }, [communityBalance.expenses, today]);

  const [yearValue, setYearValue] = useState(String(getYear(today)));
  const [monthValue, setMonthValue] = useState(String(getMonth(today) + 1));
  // Separate toggle rather than a 13th "all" entry inside the month select
  // (board request 2026-09-18: "todo el año" is a different kind of filter
  // than a specific month, so it gets its own control) -- picking a month
  // turns it back off, since the two are mutually exclusive.
  const [wholeYear, setWholeYear] = useState(false);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        label: capitalize(format(new Date(2000, i, 1), 'LLLL', { locale: dateLocale })),
        value: String(i + 1),
      })),
    [dateLocale],
  );

  const yearOptions = useMemo(() => availableYears.map((y) => ({ label: String(y), value: String(y) })), [availableYears]);

  const scopedExpenses = useMemo(() => {
    const year = Number(yearValue);
    return communityBalance.expenses
      .filter((e) => {
        const d = parseISO(e.period_date);
        if (getYear(d) !== year) return false;
        if (!wholeYear && getMonth(d) + 1 !== Number(monthValue)) return false;
        return true;
      })
      .sort((a, b) => a.period_date.localeCompare(b.period_date));
  }, [communityBalance.expenses, yearValue, monthValue, wholeYear]);

  const expensesTotal = useMemo(() => {
    const out: CurrencyAmountMap = {};
    for (const e of scopedExpenses) out[e.currency] = (out[e.currency] ?? 0) + e.amount;
    return out;
  }, [scopedExpenses]);

  const periodLabel = useMemo(() => {
    if (wholeYear) return t('communityDashboard.expensesOfYear', { year: yearValue });
    const monthLabel = capitalize(format(new Date(2000, Number(monthValue) - 1, 1), 'LLLL', { locale: dateLocale }));
    return t('communityDashboard.expensesOfMonth', { period: `${monthLabel} ${yearValue}` });
  }, [t, wholeYear, monthValue, yearValue, dateLocale]);

  return (
    <Column fillWidth gap="24" paddingY="32" paddingX="32">
      <Column gap="4">
        <Heading variant="display-strong-s">{t('greeting', { house: displayName })}</Heading>
        <Text variant="body-default-m" onBackground="neutral-weak">
          {t('communityDashboard.subtitle')}
        </Text>
      </Column>

      <Column gap="12" fillWidth>
        <Heading variant="heading-strong-s">{t('communityDashboard.heading')}</Heading>
        <Grid columns="2" s={{ columns: 1 }} gap="16" fillWidth>
          <Card padding="24" radius="s" background="success-alpha-weak" fillWidth>
            <Column gap="8">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('communityDashboard.available')}
              </Text>
              <CurrencyAmountList amounts={available} emptyLabel={t('communityDashboard.empty')} />
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {t('communityDashboard.availableCaption')}
              </Text>
            </Column>
          </Card>
          <Card padding="24" radius="s" background="warning-alpha-weak" fillWidth>
            <Column gap="8">
              <Text variant="label-default-s" onBackground="neutral-weak">
                {t('communityDashboard.pending')}
              </Text>
              <CurrencyAmountList amounts={pending} emptyLabel={t('communityDashboard.empty')} />
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {t('communityDashboard.pendingCaption')}
              </Text>
            </Column>
          </Card>
        </Grid>
      </Column>

      <Column gap="12" fillWidth>
        <Row horizontal="between" vertical="end" wrap gap="12" fillWidth>
          <Heading variant="heading-strong-s">{t('communityDashboard.expensesHeading')}</Heading>
          <Row gap="8" vertical="center" wrap>
            <Select
              id="communityMonthFilter"
              label={t('communityDashboard.monthFilterLabel')}
              fillWidth={false}
              minWidth={10}
              disabled={wholeYear}
              options={monthOptions}
              value={monthValue}
              onSelect={(value) => {
                setMonthValue(Array.isArray(value) ? value[0] : value);
                setWholeYear(false);
              }}
            />
            <Select
              id="communityYearFilter"
              label={t('communityDashboard.yearFilterLabel')}
              fillWidth={false}
              minWidth={8}
              options={yearOptions}
              value={yearValue}
              onSelect={(value) => setYearValue(Array.isArray(value) ? value[0] : value)}
            />
            <Chip
              label={t('communityDashboard.allYear')}
              selected={wholeYear}
              onClick={() => setWholeYear((w) => !w)}
            />
          </Row>
        </Row>
        <Card padding="24" radius="s" background="danger-alpha-weak" fillWidth>
          <Column gap="8">
            <Text variant="label-default-s" onBackground="neutral-weak">
              {periodLabel}
            </Text>
            <CurrencyAmountList amounts={expensesTotal} emptyLabel={t('communityDashboard.empty')} />
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {t('communityDashboard.expensesCaption')}
            </Text>
          </Column>
        </Card>
      </Column>

      <Column gap="12" fillWidth>
        <Heading variant="heading-strong-s">{t('communityDashboard.breakdownHeading')}</Heading>
        {scopedExpenses.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t('communityDashboard.breakdownEmpty')}
          </Text>
        ) : (
          <Column gap="8" fillWidth>
            {scopedExpenses.map((e) => (
              <ListRow
                key={e.id}
                title={e.name}
                subtitle={formatShortDate(parseISO(e.period_date), locale)}
                amount={formatAmount(e.amount, e.currency)}
              />
            ))}
          </Column>
        )}
      </Column>
    </Column>
  );
}
