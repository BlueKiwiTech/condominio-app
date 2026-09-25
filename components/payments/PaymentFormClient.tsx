'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DateInput } from '@/components/ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { registerPayment } from '@/lib/actions/payments';
import { extractPaymentFromScreenshot } from '@/lib/actions/paymentOcr';
import { allocateFunds, sortOldestFirst } from '@/lib/payments/allocate';
import { toDateOnly } from '@/lib/cuotas/generate';
import { currencyLabel, formatAmount, formatMoney, CURRENCY_SELECT_OPTIONS } from '@/lib/currency';
import { referenceUsdAmount, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';
import { displayStatus } from '@/lib/resident/portal';
import { formatShortDate } from '@/lib/dateFormat';
import { ListRow } from '@/components/resident/ListRow';
import type { HouseOption, PendingInstallment, HouseCredit, Currency } from './types';

export function PaymentFormClient({
  houses,
  pendingInstallments,
  houseCredits,
  gracePeriodDays,
  exchangeRates,
}: {
  houses: HouseOption[];
  pendingInstallments: PendingInstallment[];
  houseCredits: HouseCredit[];
  gracePeriodDays: number;
  exchangeRates: Record<ExchangeRateType, ExchangeRateRow | null>;
}) {
  const t = useTranslations('payments.new');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const [houseId, setHouseId] = useState<string>('');
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // OCR-prefill from a receipt screenshot (user-requested, 2026-09-13) --
  // purely a convenience: it only fills the fields above, it never submits
  // anything itself, so the admin always reviews/edits before registering.
  const [isScanning, startScanTransition] = useTransition();
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrPrefilled, setOcrPrefilled] = useState(false);
  // Gates the amount/currency/date/reference/notes/submit section: hidden
  // until the admin either scans a receipt (success or failure) or opts to
  // skip straight to manual entry (user-requested flow, 2026-09-13). The
  // due-cuotas card above stays visible throughout -- it doesn't depend on
  // OCR.
  const [ocrStepDone, setOcrStepDone] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setOcrError(null);
    setOcrPrefilled(false);
    startScanTransition(async () => {
      const result = await extractPaymentFromScreenshot(file, locale);
      if ('error' in result) {
        setOcrError(result.error);
        setOcrStepDone(true);
        return;
      }
      const { data } = result;
      if (data.amount !== null) setAmountReceived(data.amount);
      if (data.currency !== null) setCurrency(data.currency);
      if (data.payment_date !== null) setPaymentDate(parseISO(data.payment_date));
      if (data.reference !== null) setReference(data.reference);
      if (data.notes !== null) setNotes(data.notes);
      setOcrPrefilled(true);
      setOcrStepDone(true);
    });
  };

  const houseOptions = houses.map((h) => ({
    label: h.house_name ? `${h.house_number} · ${h.house_name}${h.owner_name ? ` (${h.owner_name})` : ''}` : h.house_number,
    value: h.id,
  }));

  const balanceDue = (i: PendingInstallment) => i.amount - i.amount_paid;
  // Nets out any existing saldo a favor -- if the house already has enough
  // credit to cover its pending cuotas, the suggested "new cash" amount is 0,
  // not the cuotas' raw total (which would double-count credit that's
  // already there and inflate the leftover credit written back after
  // allocation).
  const suggestedAmountFor = (installments: PendingInstallment[], credit: number) =>
    Math.max(0, installments.reduce((sum, i) => sum + balanceDue(i), 0) - credit);

  // Not filtered by currency -- a payment can be received in any currency
  // regardless of what currency the house's pending cuotas are denominated
  // in (user decision, 2026-09-08). Every pending/partial installment for
  // the house is allocated against automatically, oldest-first (2026-09-24
  // decision -- the admin no longer hand-picks which cuotas a payment
  // covers).
  const houseInstallments = useMemo(
    () => sortOldestFirst(pendingInstallments.filter((i) => i.house_id === houseId)),
    [pendingInstallments, houseId],
  );

  const existingCredit = useMemo(
    () => houseCredits.find((c) => c.house_id === houseId && c.currency === currency)?.balance ?? 0,
    [houseCredits, houseId, currency],
  );

  const today = useMemo(() => new Date(), []);

  const overdueItems = useMemo(
    () => houseInstallments.filter((i) => displayStatus(i, gracePeriodDays, today) === 'overdue'),
    [houseInstallments, gracePeriodDays, today],
  );

  const overdueTotals = useMemo(() => {
    const byCurrency = new Map<Currency, { owed: number; since: string }>();
    for (const i of overdueItems) {
      const owed = balanceDue(i);
      const existing = byCurrency.get(i.currency);
      if (existing) {
        existing.owed += owed;
        if (i.due_date < existing.since) existing.since = i.due_date;
      } else {
        byCurrency.set(i.currency, { owed, since: i.due_date });
      }
    }
    return Array.from(byCurrency.entries()).map(([currency, v]) => ({ currency, ...v }));
  }, [overdueItems]);

  const fundsAvailable = useMemo(
    () => (Number.isFinite(amountReceived) ? amountReceived : 0) + existingCredit,
    [amountReceived, existingCredit],
  );

  const preview = useMemo(() => {
    if (houseInstallments.length === 0) return null;
    return allocateFunds(houseInstallments, fundsAvailable);
  }, [houseInstallments, fundsAvailable]);

  // Reference only (PLAN.md's "cada quien saca la cuenta" decision) -- never
  // sent to the server, never affects the allocation above. Null (renders
  // nothing) for USD, or whenever the matching rate is missing/stale.
  const usdReference = useMemo(
    () => (currency ? referenceUsdAmount(amountReceived, currency, exchangeRates) : null),
    [amountReceived, currency, exchangeRates],
  );

  // House change is handled imperatively, not via useEffect + setState — the
  // amount/currency reset that follows is a direct consequence of that one
  // user action, not something to "synchronize" reactively. Every pending
  // cuota for the new house is allocated against automatically (oldest-
  // first, see houseInstallments above), so the suggested amount covers all
  // of them, net of existing credit. Currency defaults to the oldest
  // installment's own currency as a starting point, but is freely
  // changeable.
  const handleHouseSelect = (id: string) => {
    setHouseId(id);
    const nextInstallments = sortOldestFirst(pendingInstallments.filter((i) => i.house_id === id));
    const nextCurrency = nextInstallments[0]?.currency ?? null;
    setCurrency(nextCurrency);
    const nextCredit = nextCurrency ? houseCredits.find((c) => c.house_id === id && c.currency === nextCurrency)?.balance ?? 0 : 0;
    setAmountReceived(suggestedAmountFor(nextInstallments, nextCredit));
    setOcrStepDone(false);
    setOcrError(null);
    setOcrPrefilled(false);
  };

  // amountReceived (new cash) can be 0 -- a house with enough existing
  // credit can have a cuota fully paid off from that credit alone, with
  // nothing new received. fundsAvailable (cash + credit) still has to cover
  // something, or there's nothing to register.
  const canSubmit = houseId && currency && houseInstallments.length > 0 && amountReceived >= 0 && fundsAvailable > 0;

  const onSubmit = () => {
    setServerError(null);
    if (!houseId || !currency) return;
    startTransition(async () => {
      const result = await registerPayment(
        {
          house_id: houseId,
          installment_ids: houseInstallments.map((i) => i.id),
          currency,
          amount_received: amountReceived,
          payment_date: toDateOnly(paymentDate),
          reference: reference || undefined,
          notes: notes || undefined,
        },
        locale,
      );
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      toast.success(t('toastSuccess'));
      router.push(`/pagos/${result.batchId}`);
    });
  };

  return (
    <div className="flex w-full flex-wrap gap-8">
      <div className="flex min-w-[380px] flex-2 flex-col gap-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor="house">{t('fields.house')}</Label>
          <Select value={houseId} onValueChange={(v) => v && handleHouseSelect(v)} items={houseOptions}>
            <SelectTrigger id="house" className="w-full">
              <SelectValue placeholder={t('noHouses')} />
            </SelectTrigger>
            <SelectContent>
              {houseOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('noHouses')}</div>
              ) : (
                houseOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {houseId &&
          (overdueItems.length > 0 ? (
            <Card className="border-destructive/20 bg-destructive/15 p-5">
              <div className="flex w-full flex-col gap-4">
                <div className="flex items-center gap-4">
                  <Image src="/mascota_bad.png" alt="" width={72} height={72} className="w-[72px] h-[72px] shrink-0" priority />
                  <div className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold text-destructive">{t('overdueCard.heading')}</h2>
                    {overdueTotals.map((d) => (
                      <div key={d.currency} className="flex flex-col gap-1">
                        <span className="text-xl font-bold">{formatAmount(d.owed, d.currency)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t('overdueCard.since', { date: formatShortDate(parseISO(d.since), locale) })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2">
                  {overdueItems.map((inst) => (
                    <ListRow
                      key={inst.id}
                      title={inst.name}
                      subtitle={formatShortDate(parseISO(inst.due_date), locale)}
                      amount={formatAmount(balanceDue(inst), inst.currency)}
                      tag={{ label: t('status.overdue'), variant: 'destructive' }}
                    />
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="border-success/20 bg-success/15 p-5">
              <div className="flex items-center gap-4">
                <Image src="/mascota_good.png" alt="" width={72} height={69} className="w-[72px] h-[69px] shrink-0" priority />
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-success">{t('allCaughtUp.heading')}</h2>
                  <p className="text-sm text-muted-foreground">{t('allCaughtUp.subtitle')}</p>
                </div>
              </div>
            </Card>
          ))}

        {houseId && houseInstallments.length === 0 && (
          <Alert>
            <AlertDescription>{t('noPendingInstallments')}</AlertDescription>
          </Alert>
        )}

        {houseId && houseInstallments.length > 0 && (
          <>
            {existingCredit > 0 && (
              <Alert className="border-success/30 bg-success/10">
                <AlertDescription className="text-success">
                  {t('existingCredit', { amount: formatMoney(existingCredit), currency: currency ? currencyLabel(currency) : '' })}
                </AlertDescription>
              </Alert>
            )}

            <input
              ref={scanInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScanFile}
            />

            {!ocrStepDone && (
              <div className="flex flex-col gap-3 rounded-[var(--radius)] bg-muted p-6">
                <p className="text-sm">{t('ocr.stepHint')}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" disabled={isScanning} onClick={() => scanInputRef.current?.click()}>
                    {t('ocr.scanButton')}
                  </Button>
                  <Button type="button" variant="ghost" disabled={isScanning} onClick={() => setOcrStepDone(true)}>
                    {t('ocr.manualEntry')}
                  </Button>
                </div>
              </div>
            )}

            {ocrStepDone && (
              <>
                {ocrError && (
                  <Alert variant="destructive">
                    <AlertDescription>{ocrError}</AlertDescription>
                  </Alert>
                )}
                {ocrPrefilled && !ocrError && (
                  <Alert className="border-success/30 bg-success/10">
                    <AlertDescription className="text-success">{t('ocr.prefilled')}</AlertDescription>
                  </Alert>
                )}
                <div>
                  <Button type="button" variant="ghost" size="sm" disabled={isScanning} onClick={() => scanInputRef.current?.click()}>
                    {t('ocr.rescan')}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-4">
                  <div className="grid min-w-[180px] flex-1 gap-2">
                    <Label htmlFor="amount">{t('fields.amountReceived')}</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={Number.isNaN(amountReceived) ? '' : amountReceived}
                      onChange={(e) => setAmountReceived(e.target.valueAsNumber)}
                    />
                  </div>
                  <div className="grid min-w-[160px] flex-1 gap-2">
                    <Label htmlFor="currency">{t('fields.currency')}</Label>
                    <Select value={currency ?? undefined} onValueChange={(v) => v && setCurrency(v as Currency)} items={CURRENCY_SELECT_OPTIONS}>
                      <SelectTrigger id="currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_SELECT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {usdReference !== null && (
                  <p className="text-xs text-muted-foreground">
                    {t('usdReference', { amount: formatMoney(usdReference), source: currency === 'Bs' ? 'BCV' : 'Binance' })}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{t('currencyFreeHint')}</p>

                <DateInput id="payment_date" label={t('fields.paymentDate')} value={paymentDate} onChange={(date) => setPaymentDate(date)} />
                <div className="grid gap-2">
                  <Label htmlFor="reference">{t('fields.reference')}</Label>
                  <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">{t('fields.notes')}</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>

                <div className="flex gap-3">
                  <Button type="button" disabled={isPending || !canSubmit} onClick={onSubmit}>
                    {t('submit')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push('/pagos')}>
                    {t('cancel')}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* <div className="flex h-fit min-w-[280px] flex-1 flex-col gap-3 rounded-[var(--radius)] bg-muted p-6">
        <h3 className="text-base font-semibold">{t('summary.heading')}</h3>
        {!preview && <p className="text-sm text-muted-foreground">{t('summary.empty')}</p>}
        {preview && (
          <div className="flex flex-col gap-3">
            {preview.allocations.map((a) => {
              const inst = selectedInstallments.find((i) => i.id === a.installment_id)!;
              return (
                <div key={a.installment_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{inst.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums">
                      {formatMoney(a.amountApplied)} {currency ? currencyLabel(currency) : ''}
                    </span>
                    <Badge variant="outline" className={a.newStatus === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}>
                      {t(`status.${a.newStatus}`)}
                    </Badge>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('summary.total')}</span>
              <span className="text-sm font-semibold">
                {formatMoney(amountReceived)} {currency ? currencyLabel(currency) : ''}
              </span>
            </div>
            {existingCredit > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('summary.creditUsed')}</span>
                <span className="text-sm font-semibold">
                  {formatMoney(existingCredit)} {currency ? currencyLabel(currency) : ''}
                </span>
              </div>
            )}
            {preview.leftoverCents > 0 && (
              <Alert>
                <AlertDescription>
                  {t('summary.resultingCredit', {
                    amount: formatMoney(preview.leftoverCents / 100),
                    currency: currency ? currencyLabel(currency) : '',
                  })}
                </AlertDescription>
              </Alert>
            )}
            {preview.leftoverCents === 0 && preview.allocations.every((a) => a.newStatus === 'paid') && (
              <Alert className="border-success/30 bg-success/10">
                <AlertDescription className="text-success">{t('summary.upToDate')}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div> */}
    </div>
  );
}
