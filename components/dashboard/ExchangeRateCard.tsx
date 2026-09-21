'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { setExchangeRate } from '@/lib/actions/exchangeRate';
import { isRateFresh, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';
import { formatShortDateTime } from '@/lib/dateFormat';
import { StatCard } from './StatCard';

function RateColumn({ rateType, label, row }: { rateType: ExchangeRateType; label: string; row: ExchangeRateRow | null }) {
  const t = useTranslations('dashboard.exchangeRate');
  const locale = useLocale();
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
    <div className="flex w-full flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>

      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`rate-${rateType}`}>{t('fieldLabel')}</Label>
              <Input
                id={`rate-${rateType}`}
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {t('save')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : fresh && row ? (
        <div className="flex flex-col gap-1">
          <span className="text-xl font-bold">
            {t('rateValue', {
              rate: row.rate.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
            })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('updatedAt', { date: formatShortDateTime(new Date(row.updated_at), locale) })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={startEditing}>
              {t('edit')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Alert>
            <AlertDescription>{row ? t('stale') : t('noData')}</AlertDescription>
          </Alert>
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            {t('setNow')}
          </Button>
        </div>
      )}
    </div>
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
    <StatCard stripeColor="primary">
      <div className="flex w-full flex-col gap-4">
        <span className="text-xs font-medium text-muted-foreground">{t('heading')}</span>
        <RateColumn rateType="bcv" label={t('bcv')} row={rates.bcv} />
        <RateColumn rateType="binance" label={t('binance')} row={rates.binance} />
      </div>
    </StatCard>
  );
}
