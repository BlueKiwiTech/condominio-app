'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Row, Column, Card, Text, Button, Input, Feedback } from '@once-ui-system/core';
import { setExchangeRate } from '@/lib/actions/exchangeRate';
import { isRateFresh, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';

function RateColumn({ rateType, label, row }: { rateType: ExchangeRateType; label: string; row: ExchangeRateRow | null }) {
  const t = useTranslations('dashboard.exchangeRate');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? enUS : es;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // User decision (2026-09-08): a rate older than 24h is treated as stale
  // and its VALUE is hidden -- shown as "needs updating" instead of a
  // number nobody can trust anymore, regardless of whether it came from
  // the daily cron or an admin's manual entry.
  const fresh = row ? isRateFresh(row.updated_at) : false;

  const startEditing = () => {
    setValue(row ? String(row.rate) : '');
    setError(null);
    setEditing(true);
  };

  const handleSave = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('invalidValue'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setExchangeRate(rateType, parsed, locale);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <Column gap="8" fillWidth>
      <Text variant="label-default-s" onBackground="neutral-weak">
        {label}
      </Text>

      {editing ? (
        <Column gap="8">
          <Row gap="8" wrap>
            <Input
              id={`rate-${rateType}`}
              type="number"
              label={t('fieldLabel')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Row>
          {error && <Feedback variant="danger" description={error} />}
          <Row gap="8">
            <Button type="button" variant="primary" size="s" loading={isPending} onClick={handleSave}>
              {t('save')}
            </Button>
            <Button type="button" variant="tertiary" size="s" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </Row>
        </Column>
      ) : fresh && row ? (
        <Column gap="4">
          <Text variant="heading-strong-m">{t('rateValue', { rate: row.rate.toFixed(4) })}</Text>
          <Row gap="8" vertical="center" wrap>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {t('updatedAt', { date: format(new Date(row.updated_at), 'dd/MM HH:mm', { locale: dateLocale }) })}
            </Text>
            <Button type="button" variant="tertiary" size="s" onClick={startEditing}>
              {t('edit')}
            </Button>
          </Row>
        </Column>
      ) : (
        <Column gap="8">
          <Feedback variant="warning" description={row ? t('stale') : t('noData')} />
          <Button type="button" variant="secondary" size="s" onClick={startEditing}>
            {t('setNow')}
          </Button>
        </Column>
      )}
    </Column>
  );
}

// Purely a reference for the admin (PLAN.md's "cada quien saca la cuenta"
// decision -- payments never auto-convert). Sourced daily by
// app/api/cron/exchange-rate/route.ts, or set by hand here at any time;
// both write to the same condo_exchange_rates history table. Rendered as a
// 5th card alongside the KPI grid (components/dashboard/DashboardPageClient.
// tsx) -- BCV/Binance stacked rather than side-by-side so both fit in one
// grid-column-width card instead of needing their own full-width row.
export function ExchangeRateCard({ rates }: { rates: Record<ExchangeRateType, ExchangeRateRow | null> }) {
  const t = useTranslations('dashboard.exchangeRate');

  return (
    <Card padding="24" radius="l" background="neutral-alpha-weak" fillWidth>
      <Column gap="16" fillWidth>
        <Text variant="label-default-s" onBackground="neutral-weak">
          {t('heading')}
        </Text>
        <RateColumn rateType="bcv" label={t('bcv')} row={rates.bcv} />
        <RateColumn rateType="binance" label={t('binance')} row={rates.binance} />
      </Column>
    </Card>
  );
}
