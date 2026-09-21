'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { parseISO } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { computeMorosos } from '@/lib/reporting/morosos';
import { creditsByCurrency } from '@/lib/reporting/dashboard';
import { upcomingInstallments } from '@/lib/resident/portal';
import { ReportPaymentDialog } from './ReportPaymentDialog';
import { CommunityBalanceCard } from './CommunityBalanceCard';
import { ListRow } from './ListRow';
import { formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { ResidentPortalData, CommunityBalanceData } from '@/lib/resident/queries';

export function MiHogarClient({
  data,
  communityBalance,
}: {
  data: ResidentPortalData;
  communityBalance: CommunityBalanceData;
}) {
  const t = useTranslations('residentHome');
  const locale = useLocale();
  const house = data.house!;
  const today = useMemo(() => new Date(), []);
  const [reportOpen, setReportOpen] = useState(false);

  const pendingInstallments = useMemo(() => data.installments.filter((i) => i.status !== 'paid'), [data.installments]);

  const houseLabel = house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number;

  const credits = useMemo(
    () => Object.entries(creditsByCurrency(data.credits)).filter(([, v]) => (v ?? 0) > 0),
    [data.credits],
  );

  const morosos = useMemo(
    () => computeMorosos(data.installments, [{ id: house.id, house_number: house.house_number, house_name: house.house_name, owner_name: house.owner_name }], data.community?.grace_period_days ?? 0, today),
    [data.installments, house, data.community, today],
  );

  const graceDays = data.community?.grace_period_days ?? 0;

  const upcoming = useMemo(
    () => upcomingInstallments(data.installments, graceDays, today, 5),
    [data.installments, graceDays, today],
  );

  const isUpToDate = credits.length === 0 && morosos.length === 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">{t('greeting', { house: houseLabel })}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <CommunityBalanceCard
        installments={communityBalance.installments}
        credits={communityBalance.credits}
        expenses={communityBalance.expenses}
        graceDays={graceDays}
        today={today}
      />

      <div className="flex w-full flex-col gap-3">
        {isUpToDate && (
          <Card className="border-success/20 bg-success/5 p-5">
            <span className="text-base font-semibold text-success">{t('upToDate')}</span>
          </Card>
        )}
        {credits.map(([currency, amount]) => (
          <Card key={`credit-${currency}`} className="border-success/20 bg-success/5 p-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('creditLabel')}
              </span>
              <span className="text-2xl font-bold">{formatAmount(amount ?? 0, currency)}</span>
            </div>
          </Card>
        ))}
        {morosos.map((m) => (
          <Card key={`debt-${m.currency}`} className="border-destructive/20 bg-destructive/5 p-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('debtLabel', { date: formatShortDate(parseISO(m.owedSince), locale) })}
              </span>
              <span className="text-2xl font-bold">{formatAmount(m.owed, m.currency)}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t('upcoming.heading')}</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setReportOpen(true)}>
            {t('reportPayment')}
          </Button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('upcoming.empty')}</p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {upcoming.map((inst) => (
              <ListRow
                key={inst.id}
                title={inst.name}
                subtitle={formatShortDate(parseISO(inst.due_date), locale)}
                amount={formatAmount(inst.amount - inst.amount_paid, inst.currency)}
              />
            ))}
          </div>
        )}
      </div>

      {reportOpen && (
        <ReportPaymentDialog
          pendingInstallments={pendingInstallments}
          exchangeRates={data.exchangeRates}
          graceDays={graceDays}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
