'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { cn } from 'cn';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createTemplateSchema, type CreateTemplateInput, type Cadence } from '@/lib/validation/cuotas';
import { createInstallmentTemplate } from '@/lib/actions/cuotas';
import { buildPreview, splitAmount, toDateOnly, type DueDateMode } from '@/lib/cuotas/generate';
import { CURRENCY_SELECT_OPTIONS, formatAmount, formatMoney } from '@/lib/currency';
import type { HouseOption } from './types';

type FormValues = {
  installment_type: 'recurring' | 'special';
  name: string;
  description: string;
  currency: 'USD' | 'Bs' | 'USDT';
  amount: number;
  start_date: Date;
  cadence: Cadence;
  number_of_installments: number;
  is_divided: boolean;
};

export function CuotaFormClient({ houses }: { houses: HouseOption[] }) {
  const t = useTranslations('cuotas');
  const tv = useTranslations('validation.cuotas');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [houseSelection, setHouseSelection] = useState<'all' | string[]>('all');

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      installment_type: 'recurring',
      name: '',
      description: '',
      currency: 'USD',
      amount: 0,
      start_date: new Date(),
      cadence: 'monthly',
      number_of_installments: 1,
      is_divided: false,
    },
  });

  const values = watch();
  const installmentType = values.installment_type;
  const isDivided = installmentType === 'special' && values.is_divided;
  const showInstallmentCount = installmentType === 'recurring' || isDivided;

  const selectedHouseCount = houseSelection === 'all' ? houses.length : houseSelection.length;

  // Per-installment amounts for a divided special cuota, editable individually
  // — they don't have to be equal, only sum to the total. Reset to an even
  // split whenever the count or total changes; the admin's own edits persist
  // until one of those two changes again. Mirrors components/gastos/GastoFormClient.tsx's
  // variable-expense amounts pattern.
  const [amounts, setAmounts] = useState<number[]>([]);
  useEffect(() => {
    if (!isDivided) {
      setAmounts([]);
      return;
    }
    const count = values.number_of_installments && values.number_of_installments > 0 ? values.number_of_installments : 0;
    const total = values.amount && values.amount > 0 ? values.amount : 0;
    if (count === 0 || total === 0) {
      setAmounts([]);
      return;
    }
    setAmounts(splitAmount(total, count));
  }, [isDivided, values.number_of_installments, values.amount]);

  const amountsSum = useMemo(() => amounts.reduce((sum, a) => sum + (Number.isFinite(a) ? a : 0), 0), [amounts]);
  const amountsMismatch =
    isDivided && amounts.length > 0 && Math.round(amountsSum * 100) !== Math.round((values.amount || 0) * 100);

  const updateAmount = (index: number, value: number) => {
    setAmounts((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const preview = useMemo(() => {
    if (!values.amount || values.amount <= 0 || !values.start_date) return null;
    const mode: DueDateMode =
      installmentType === 'recurring'
        ? { kind: 'recurring', cadence: values.cadence }
        : isDivided
          ? { kind: 'special-divided' }
          : { kind: 'special-single' };
    const count = installmentType === 'recurring' ? values.number_of_installments : isDivided ? values.number_of_installments : 1;
    if (!count || count < 1) return null;
    const base = buildPreview({ mode, startDate: values.start_date, count, amount: values.amount, isDivided });
    if (isDivided && amounts.length === count) {
      return { ...base, amounts, totalPerHouse: amountsSum };
    }
    return base;
  }, [installmentType, isDivided, values.amount, values.start_date, values.cadence, values.number_of_installments, amounts, amountsSum]);

  const toggleHouse = (houseId: string) => {
    setHouseSelection((prev) => {
      const list = prev === 'all' ? [] : prev;
      return list.includes(houseId) ? list.filter((id) => id !== houseId) : [...list, houseId];
    });
  };

  const onSubmit = (data: FormValues) => {
    setServerError(null);
    const applicable_houses = houseSelection === 'all' ? [] : houseSelection;
    const shared = {
      name: data.name,
      description: data.description,
      currency: data.currency,
      amount: data.amount,
      start_date: toDateOnly(data.start_date),
      applicable_houses,
    };
    const payload: CreateTemplateInput =
      data.installment_type === 'recurring'
        ? {
            installment_type: 'recurring',
            ...shared,
            cadence: data.cadence,
            number_of_installments: data.number_of_installments,
          }
        : {
            installment_type: 'special',
            ...shared,
            is_divided: data.is_divided,
            number_of_installments: data.is_divided ? data.number_of_installments : 1,
            amounts: data.is_divided ? amounts : undefined,
          };

    const parsed = createTemplateSchema(tv).safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t('errors.invalid'));
      return;
    }

    startTransition(async () => {
      const result = await createInstallmentTemplate(parsed.data, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      router.push('/cuotas');
      router.refresh();
    });
  };

  return (
    <div className="flex w-full flex-col gap-8 lg:flex-row">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-2 flex-col gap-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Controller
          control={control}
          name="installment_type"
          render={({ field }) => (
            <div className="inline-flex w-fit gap-1 rounded-lg border bg-muted p-1">
              <Button
                type="button"
                size="sm"
                variant={field.value === 'recurring' ? 'default' : 'ghost'}
                onClick={() => field.onChange('recurring')}
              >
                {t('form.typeRecurring')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={field.value === 'special' ? 'default' : 'ghost'}
                onClick={() => field.onChange('special')}
              >
                {t('form.typeSpecial')}
              </Button>
            </div>
          )}
        />

        <div className="grid gap-1.5">
          <Label htmlFor="name">{t('fields.name')}</Label>
          <Input id="name" {...register('name', { required: true })} aria-invalid={!!errors.name} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">{t('fields.description')}</Label>
          <Textarea id="description" {...register('description')} />
        </div>

        <div className="flex flex-wrap gap-4">
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="amount">
                  {installmentType === 'recurring' ? t('form.amountPerInstallment') : t('form.amountTotal')}
                </Label>
                <Input
                  id="amount"
                  type="number"
                  value={Number.isNaN(field.value) ? '' : field.value}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  aria-invalid={!!errors.amount}
                />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
            )}
          />
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="currency">{t('fields.currency')}</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_SELECT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
        </div>

        {installmentType === 'recurring' && (
          <Controller
            control={control}
            name="cadence"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="cadence">{t('form.cadence')}</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="cadence" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{t('cadence.weekly')}</SelectItem>
                    <SelectItem value="monthly">{t('cadence.monthly')}</SelectItem>
                    <SelectItem value="annual">{t('cadence.annual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          />
        )}

        {installmentType === 'special' && (
          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="is_divided"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={t('form.isDivided')} />
              )}
            />
            <span className="text-sm">{t('form.isDivided')}</span>
          </div>
        )}

        <Controller
          control={control}
          name="start_date"
          render={({ field }) => (
            <DateInput
              id="start_date"
              label={
                installmentType === 'recurring'
                  ? t('form.startDate')
                  : isDivided
                    ? t('form.firstInstallmentDate')
                    : t('form.dueDate')
              }
              value={field.value}
              onChange={(date) => field.onChange(date)}
            />
          )}
        />

        {showInstallmentCount && (
          <Controller
            control={control}
            name="number_of_installments"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label htmlFor="number_of_installments">{t('form.numberOfInstallments')}</Label>
                <Input
                  id="number_of_installments"
                  type="number"
                  value={Number.isNaN(field.value) ? '' : field.value}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
              </div>
            )}
          />
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('form.applicableHouses')}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHouseSelection('all')}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                houseSelection === 'all'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t('form.allHouses')}
            </button>
            {houses.map((house) => {
              const selected = houseSelection !== 'all' && houseSelection.includes(house.id);
              return (
                <button
                  key={house.id}
                  type="button"
                  onClick={() => toggleHouse(house.id)}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending || (isDivided && amountsMismatch)}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {t('form.submit')}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/cuotas')}>
            {t('cancel')}
          </Button>
        </div>
      </form>

      <div className="flex flex-1 flex-col gap-3 rounded-[var(--radius)] border bg-muted/50 p-6">
        <h2 className="text-lg font-semibold">{t('preview.heading')}</h2>
        {!preview && <span className="text-sm text-muted-foreground">{t('preview.empty')}</span>}
        {preview && (
          <div className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">{t('preview.info')}</span>
            <div className={cn('flex flex-col', isDivided ? 'gap-2' : 'gap-1')}>
              {preview.dueDates.map((date, idx) =>
                isDivided ? (
                  <div key={idx} className="grid gap-1.5">
                    <Label htmlFor={`installment-amount-${idx}`}>
                      {`${t('form.installmentAmount', { number: idx + 1 })} — ${toDateOnly(date)}`}
                    </Label>
                    <Input
                      id={`installment-amount-${idx}`}
                      type="number"
                      value={Number.isNaN(amounts[idx]) ? '' : amounts[idx]}
                      onChange={(e) => updateAmount(idx, e.target.valueAsNumber)}
                    />
                  </div>
                ) : (
                  <div key={idx} className="flex justify-between">
                    <span className="text-sm">{toDateOnly(date)}</span>
                    <span className="text-sm">{formatAmount(preview.amounts[idx], values.currency)}</span>
                  </div>
                ),
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('preview.totalPerHouse')}</span>
              <span className="text-sm font-semibold">{formatAmount(preview.totalPerHouse, values.currency)}</span>
            </div>
            {isDivided && amountsMismatch && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t('form.amountsSumMismatch', {
                    sum: formatMoney(amountsSum),
                    total: formatMoney(values.amount || 0),
                  })}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('preview.houses')}</span>
              <span className="text-sm font-semibold">{selectedHouseCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('preview.expectedTotal')}</span>
              <span className="text-sm font-semibold">{formatAmount(preview.totalPerHouse * selectedHouseCount, values.currency)}</span>
            </div>
            <Alert>
              <AlertDescription>{t('preview.noConversionNote')}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}
