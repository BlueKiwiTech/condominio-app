'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DateInput } from '@/components/ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { registerPayment } from '@/lib/actions/payments';
import { extractPaymentFromScreenshot } from '@/lib/actions/paymentOcr';
import { allocateFunds, sortOldestFirst } from '@/lib/payments/allocate';
import { toDateOnly } from '@/lib/cuotas/generate';
import { currencyLabel, formatAmount, formatMoney, CURRENCY_SELECT_OPTIONS } from '@/lib/currency';
import { referenceUsdAmount, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';
import type { HouseOption, PendingInstallment, HouseCredit, Currency } from './types';

export function PaymentFormClient({
  houses,
  pendingInstallments,
  houseCredits,
  exchangeRates,
}: {
  houses: HouseOption[];
  pendingInstallments: PendingInstallment[];
  houseCredits: HouseCredit[];
  exchangeRates: Record<ExchangeRateType, ExchangeRateRow | null>;
}) {
  const t = useTranslations('payments.new');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const [houseId, setHouseId] = useState<string>('');
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [amountEdited, setAmountEdited] = useState(false);
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
  // cuota table above stays visible throughout -- picking which cuota(s)
  // this payment covers doesn't depend on OCR.
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
      if (data.amount !== null) {
        setAmountEdited(true);
        setAmountReceived(data.amount);
      }
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
  // credit to cover the selected cuota(s), the suggested "new cash" amount
  // is 0, not the cuotas' raw total (which would double-count credit that's
  // already there and inflate the leftover credit written back after
  // allocation).
  const suggestedAmountFor = (ids: string[], installments: PendingInstallment[], credit: number) =>
    Math.max(0, installments.filter((i) => ids.includes(i.id)).reduce((sum, i) => sum + balanceDue(i), 0) - credit);

  // Not filtered by currency -- a payment can be received in any currency
  // regardless of what currency the selected cuota(s) are denominated in
  // (user decision, 2026-09-08). All of a house's pending installments are
  // selectable together; each row still shows its own currency so the
  // admin can see exactly what they're mixing.
  const houseInstallments = useMemo(
    () => sortOldestFirst(pendingInstallments.filter((i) => i.house_id === houseId)),
    [pendingInstallments, houseId],
  );
  const selectedInstallments = useMemo(
    () => houseInstallments.filter((i) => selectedIds.includes(i.id)),
    [houseInstallments, selectedIds],
  );

  const existingCredit = useMemo(
    () => houseCredits.find((c) => c.house_id === houseId && c.currency === currency)?.balance ?? 0,
    [houseCredits, houseId, currency],
  );

  const fundsAvailable = useMemo(
    () => (Number.isFinite(amountReceived) ? amountReceived : 0) + existingCredit,
    [amountReceived, existingCredit],
  );

  const preview = useMemo(() => {
    if (selectedInstallments.length === 0) return null;
    return allocateFunds(selectedInstallments, fundsAvailable);
  }, [selectedInstallments, fundsAvailable]);

  // Reference only (PLAN.md's "cada quien saca la cuenta" decision) -- never
  // sent to the server, never affects the allocation above. Null (renders
  // nothing) for USD, or whenever the matching rate is missing/stale.
  const usdReference = useMemo(
    () => (currency ? referenceUsdAmount(amountReceived, currency, exchangeRates) : null),
    [amountReceived, currency, exchangeRates],
  );

  // Every selection change below is handled imperatively (event handlers),
  // not via useEffect + setState — the selection/amount reset that follows
  // a house change is a direct consequence of that one user action, not
  // something to "synchronize" reactively.

  // House change: nothing pre-checked — the admin picks which cuota(s) this
  // payment covers (PMNT-03: adjustable, supports partial payment). Currency
  // defaults to the oldest installment's own currency as a starting point,
  // but is freely changeable regardless of selection.
  const handleHouseSelect = (id: string) => {
    setHouseId(id);
    const nextInstallments = sortOldestFirst(pendingInstallments.filter((i) => i.house_id === id));
    setCurrency(nextInstallments[0]?.currency ?? null);
    setSelectedIds([]);
    setAmountEdited(false);
    setAmountReceived(0);
    setOcrStepDone(false);
    setOcrError(null);
    setOcrPrefilled(false);
  };

  const toggleInstallment = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!amountEdited) setAmountReceived(suggestedAmountFor(next, houseInstallments, existingCredit));
      return next;
    });
  };

  // amountReceived (new cash) can be 0 -- a house with enough existing
  // credit can have a cuota fully paid off from that credit alone, with
  // nothing new received. fundsAvailable (cash + credit) still has to cover
  // something, or there's nothing to register.
  const canSubmit = houseId && currency && selectedIds.length > 0 && amountReceived >= 0 && fundsAvailable > 0;

  const onSubmit = () => {
    setServerError(null);
    if (!houseId || !currency) return;
    startTransition(async () => {
      const result = await registerPayment(
        {
          house_id: houseId,
          installment_ids: selectedIds,
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
          <Select value={houseId} onValueChange={(v) => v && handleHouseSelect(v)}>
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

            <div className="w-full overflow-hidden rounded-[var(--radius)] border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>{t('table.cuota')}</TableHead>
                    <TableHead>{t('table.due')}</TableHead>
                    <TableHead className="text-right">{t('table.balance')}</TableHead>
                    <TableHead>{t('table.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {houseInstallments.map((inst) => (
                    <TableRow key={inst.id} className="h-11">
                      <TableCell>
                        <Checkbox checked={selectedIds.includes(inst.id)} onCheckedChange={() => toggleInstallment(inst.id)} />
                      </TableCell>
                      <TableCell className="whitespace-normal font-medium">{inst.name}</TableCell>
                      <TableCell>{inst.due_date}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(balanceDue(inst), inst.currency)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={inst.status === 'partial' ? 'bg-warning/10 text-warning' : ''}>
                          {t(`status.${inst.status}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
                      onChange={(e) => {
                        setAmountEdited(true);
                        setAmountReceived(e.target.valueAsNumber);
                      }}
                    />
                  </div>
                  <div className="grid min-w-[160px] flex-1 gap-2">
                    <Label htmlFor="currency">{t('fields.currency')}</Label>
                    <Select value={currency ?? undefined} onValueChange={(v) => v && setCurrency(v as Currency)}>
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
