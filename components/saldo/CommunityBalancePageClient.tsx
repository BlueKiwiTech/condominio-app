'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { registerOpeningBalance, registerAdjustment } from '@/lib/actions/communityBalance';
import { currencyLabel, formatAmount } from '@/lib/currency';
import { formatShortDate } from '@/lib/dateFormat';
import type { CurrencyAmountMap } from '@/lib/reporting/dashboard';
import type { CommunityMovement, MovementType } from '@/lib/reporting/communityBalanceQuery';

type Currency = 'USD' | 'Bs' | 'USDT';
const CURRENCIES: Currency[] = ['USD', 'Bs', 'USDT'];

const TYPE_CLASSES: Record<MovementType, string> = {
  opening: 'bg-primary/10 text-primary',
  payment_in: 'bg-success/10 text-success',
  expense_out: 'bg-destructive/10 text-destructive',
  adjustment: 'bg-warning/10 text-warning',
};

export function CommunityBalancePageClient({
  balance,
  movements,
  total,
  pageSize,
  page,
  openingCurrencies,
}: {
  balance: CurrencyAmountMap;
  movements: CommunityMovement[];
  total: number;
  pageSize: number;
  page: number;
  openingCurrencies: string[];
}) {
  const t = useTranslations('communityBalance');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const openingOptions = CURRENCIES.filter((c) => !openingCurrencies.includes(c));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // ---- opening balance dialog
  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingCurrency, setOpeningCurrency] = useState<Currency | null>(null);
  const [openingAmount, setOpeningAmount] = useState<number | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);

  const openOpening = () => {
    setOpeningCurrency(openingOptions[0] ?? null);
    setOpeningAmount(null);
    setOpeningError(null);
    setOpeningOpen(true);
  };
  const submitOpening = () => {
    if (!openingCurrency) return;
    setOpeningError(null);
    startTransition(async () => {
      const result = await registerOpeningBalance({ currency: openingCurrency, amount: openingAmount ?? 0 }, locale);
      if ('error' in result) {
        setOpeningError(result.error);
        return;
      }
      toast.success(t('toasts.opening'));
      setOpeningOpen(false);
    });
  };

  // ---- adjustment dialog
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjCurrency, setAdjCurrency] = useState<Currency>('USD');
  const [adjDirection, setAdjDirection] = useState<'increase' | 'decrease'>('increase');
  const [adjAmount, setAdjAmount] = useState<number | null>(null);
  const [adjNote, setAdjNote] = useState('');
  const [adjError, setAdjError] = useState<string | null>(null);

  const openAdjustment = () => {
    setAdjCurrency('USD');
    setAdjDirection('increase');
    setAdjAmount(null);
    setAdjNote('');
    setAdjError(null);
    setAdjOpen(true);
  };
  const submitAdjustment = () => {
    setAdjError(null);
    startTransition(async () => {
      const amount = (adjAmount ?? 0) * (adjDirection === 'decrease' ? -1 : 1);
      const result = await registerAdjustment({ currency: adjCurrency, amount, note: adjNote }, locale);
      if ('error' in result) {
        setAdjError(result.error);
        return;
      }
      toast.success(t('toasts.adjustment'));
      setAdjOpen(false);
    });
  };

  const currencyItems = (list: Currency[]) => list.map((c) => ({ value: c, label: currencyLabel(c) }));

  return (
    <div className="flex w-full flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('balancesHeading')}</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={openOpening} disabled={openingOptions.length === 0} data-testid="open-opening">
              {t('actions.opening')}
            </Button>
            <Button type="button" onClick={openAdjustment} data-testid="open-adjustment">
              {t('actions.adjustment')}
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {CURRENCIES.map((c) => {
            const amount = balance[c] ?? 0;
            return (
              <Card key={c} className="p-5" data-testid={`balance-${c}`}>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{currencyLabel(c)}</span>
                  <span className={cn('text-2xl font-bold tabular-nums', amount < 0 && 'text-destructive')}>
                    {formatAmount(amount, c)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('ledger.heading')}</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('ledger.empty')}</p>
        ) : (
          <Table data-testid="ledger">
            <TableHeader>
              <TableRow>
                <TableHead>{t('ledger.columns.date')}</TableHead>
                <TableHead>{t('ledger.columns.type')}</TableHead>
                <TableHead className="text-right">{t('ledger.columns.amount')}</TableHead>
                <TableHead>{t('ledger.columns.detail')}</TableHead>
                <TableHead>{t('ledger.columns.author')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatShortDate(m.occurred_on, locale)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TYPE_CLASSES[m.type]}>
                      {t(`ledger.types.${m.type}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums whitespace-nowrap', m.amount < 0 ? 'text-destructive' : 'text-success')}>
                    {m.amount > 0 ? '+' : ''}
                    {formatAmount(m.amount, m.currency)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.note}
                    {m.type === 'payment_in' && m.reference_id && (
                      <Link href={`/pagos/${m.reference_id}`} className="text-primary underline-offset-4 hover:underline">
                        {t('ledger.viewReceipt')}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.author_email ?? t('ledger.system')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3" data-testid="pagination">
            <span className="text-sm text-muted-foreground">{t('ledger.page', { page, pages })}</span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button variant="outline" size="sm" render={<Link href={`/saldo-comunidad?page=${page - 1}`} />} nativeButton={false}>
                  {t('ledger.previous')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  {t('ledger.previous')}
                </Button>
              )}
              {page < pages ? (
                <Button variant="outline" size="sm" render={<Link href={`/saldo-comunidad?page=${page + 1}`} />} nativeButton={false}>
                  {t('ledger.next')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  {t('ledger.next')}
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('openingDialog.heading')}</DialogTitle>
            <DialogDescription>{t('openingDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {openingError && (
              <Alert variant="destructive">
                <AlertDescription>{openingError}</AlertDescription>
              </Alert>
            )}
            {openingOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('openingDialog.allRegistered')}</p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="openingCurrency">{t('openingDialog.currency')}</Label>
                  <Select
                    value={openingCurrency ?? undefined}
                    onValueChange={(v) => v && setOpeningCurrency(v as Currency)}
                    items={currencyItems(openingOptions)}
                  >
                    <SelectTrigger id="openingCurrency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {openingOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {currencyLabel(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="openingAmount">{t('openingDialog.amount')}</Label>
                  <MoneyInput id="openingAmount" value={openingAmount} onChange={setOpeningAmount} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpeningOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" disabled={isPending || openingOptions.length === 0 || !openingAmount} onClick={submitOpening} data-testid="submit-opening">
              {t('openingDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('adjustmentDialog.heading')}</DialogTitle>
            <DialogDescription>{t('adjustmentDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {adjError && (
              <Alert variant="destructive">
                <AlertDescription>{adjError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-4">
              <div className="grid min-w-[160px] flex-1 gap-2">
                <Label htmlFor="adjCurrency">{t('adjustmentDialog.currency')}</Label>
                <Select value={adjCurrency} onValueChange={(v) => v && setAdjCurrency(v as Currency)} items={currencyItems(CURRENCIES)}>
                  <SelectTrigger id="adjCurrency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {currencyLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-[160px] flex-1 gap-2">
                <Label htmlFor="adjDirection">{t('adjustmentDialog.direction')}</Label>
                <Select
                  value={adjDirection}
                  onValueChange={(v) => v && setAdjDirection(v as 'increase' | 'decrease')}
                  items={[
                    { value: 'increase', label: t('adjustmentDialog.increase') },
                    { value: 'decrease', label: t('adjustmentDialog.decrease') },
                  ]}
                >
                  <SelectTrigger id="adjDirection" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">{t('adjustmentDialog.increase')}</SelectItem>
                    <SelectItem value="decrease">{t('adjustmentDialog.decrease')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adjAmount">{t('adjustmentDialog.amount')}</Label>
              <MoneyInput id="adjAmount" value={adjAmount} onChange={setAdjAmount} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adjNote">{t('adjustmentDialog.note')}</Label>
              <Input
                id="adjNote"
                value={adjNote}
                maxLength={300}
                placeholder={t('adjustmentDialog.notePlaceholder')}
                onChange={(e) => setAdjNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" disabled={isPending || !adjAmount} onClick={submitAdjustment} data-testid="submit-adjustment">
              {t('adjustmentDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
