'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DateInput } from '@/components/ui/date-input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { createExpenseTemplateSchema, type CreateExpenseTemplateInput, type Cadence } from '@/lib/validation/gastos';
import { createExpenseTemplate } from '@/lib/actions/gastos';
import { computeVariablePeriodDates, splitAmount, toDateOnly } from '@/lib/gastos/generate';
import { CURRENCY_SELECT_OPTIONS, formatAmount, formatMoney } from '@/lib/currency';
import type { CategoryOption } from './types';

type FormValues = {
  kind: 'fixed' | 'variable';
  name: string;
  category_id: string;
  provider: string;
  currency: 'USD' | 'Bs' | 'USDT';
  default_amount: number;
  start_date: Date;
  cadence: Cadence;
  installment_count: number;
};

export function GastoFormClient({ categories }: { categories: CategoryOption[] }) {
  const t = useTranslations('gastos');
  const tv = useTranslations('validation.gastos');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      kind: 'fixed',
      name: '',
      category_id: categories[0]?.id ?? '',
      provider: '',
      currency: 'USD',
      default_amount: 0,
      start_date: new Date(),
      cadence: 'monthly',
      installment_count: 1,
    },
  });
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = form;

  const values = watch();
  const isVariable = values.kind === 'variable';

  const categoryOptions = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name })), [categories]);
  const cadenceOptions: { value: Cadence; label: string }[] = [
    { value: 'weekly', label: t('cadence.weekly') },
    { value: 'biweekly', label: t('cadence.biweekly') },
    { value: 'monthly', label: t('cadence.monthly') },
    { value: 'quarterly', label: t('cadence.quarterly') },
    { value: 'annual', label: t('cadence.annual') },
  ];

  const periodDates = useMemo(() => {
    if (!isVariable) return null;
    if (!values.start_date) return null;
    if (!values.installment_count || values.installment_count < 1) return null;
    return computeVariablePeriodDates(values.start_date, values.installment_count, values.cadence);
  }, [isVariable, values.start_date, values.installment_count, values.cadence]);

  // Per-installment amounts the admin can edit individually -- they don't
  // have to be equal, only sum to the total. Reset to an even split
  // whenever the count or total changes; the admin's own edits persist
  // until one of those two changes again.
  const [amounts, setAmounts] = useState<number[]>([]);
  useEffect(() => {
    if (!isVariable) return;
    const count = values.installment_count && values.installment_count > 0 ? values.installment_count : 0;
    const total = values.default_amount && values.default_amount > 0 ? values.default_amount : 0;
    if (count === 0 || total === 0) {
      setAmounts([]);
      return;
    }
    setAmounts(splitAmount(total, count));
  }, [isVariable, values.installment_count, values.default_amount]);

  const amountsSum = useMemo(() => amounts.reduce((sum, a) => sum + (Number.isFinite(a) ? a : 0), 0), [amounts]);
  const amountsMismatch =
    isVariable && amounts.length > 0 && Math.round(amountsSum * 100) !== Math.round((values.default_amount || 0) * 100);

  const updateAmount = (index: number, value: number) => {
    setAmounts((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const onSubmit = (data: FormValues) => {
    setServerError(null);
    const shared = {
      name: data.name,
      category_id: data.category_id,
      provider: data.provider,
      currency: data.currency,
      default_amount: data.default_amount,
      start_date: toDateOnly(data.start_date),
    };
    const payload: CreateExpenseTemplateInput =
      data.kind === 'fixed'
        ? { kind: 'fixed', ...shared, cadence: data.cadence }
        : { kind: 'variable', ...shared, cadence: data.cadence, installment_count: data.installment_count, amounts };

    const parsed = createExpenseTemplateSchema(tv).safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t('errors.invalid'));
      return;
    }

    startTransition(async () => {
      const result = await createExpenseTemplate(parsed.data, locale);
      if ('error' in result) {
        setServerError(result.error);
        return;
      }
      router.push('/gastos');
      router.refresh();
    });
  };

  return (
    <div className="flex w-full flex-wrap gap-8">
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-w-[350px] flex-2 flex-col gap-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <FormField
            control={control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <ToggleGroup
                  variant="outline"
                  value={[field.value]}
                  onValueChange={(vals) => vals[0] && field.onChange(vals[0] as FormValues['kind'])}
                >
                  <ToggleGroupItem value="fixed">{t('form.kindFixed')}</ToggleGroupItem>
                  <ToggleGroupItem value="variable">{t('form.kindVariable')}</ToggleGroupItem>
                </ToggleGroup>
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="name"
            rules={{ required: true }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fields.name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage>{errors.name?.message}</FormMessage>
              </FormItem>
            )}
          />

          <div className="flex flex-wrap gap-4">
            <FormField
              control={control}
              name="category_id"
              render={({ field }) => (
                <FormItem className="min-w-[200px] flex-1">
                  <FormLabel>{t('fields.category')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} items={categoryOptions}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="provider"
              render={({ field }) => (
                <FormItem className="min-w-[200px] flex-1">
                  <FormLabel>{t('fields.provider')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <FormField
              control={control}
              name="default_amount"
              render={({ field }) => (
                <FormItem className="min-w-[200px] flex-1">
                  <FormLabel>{isVariable ? t('form.amountTotal') : t('form.amountPerPeriod')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={Number.isNaN(field.value) ? '' : field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage>{errors.default_amount?.message}</FormMessage>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="currency"
              render={({ field }) => (
                <FormItem className="min-w-[160px] flex-1">
                  <FormLabel>{t('fields.currency')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} items={CURRENCY_SELECT_OPTIONS}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRENCY_SELECT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>

          {!isVariable && (
            <FormField
              control={control}
              name="cadence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.cadence')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} items={cadenceOptions}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cadenceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          )}

          <FormField
            control={control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <DateInput
                  id="start_date"
                  label={t('fields.startDate')}
                  value={field.value}
                  onChange={(date) => date && field.onChange(date)}
                />
              </FormItem>
            )}
          />

          {isVariable && (
            <FormField
              control={control}
              name="installment_count"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.installmentCount')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={Number.isNaN(field.value) ? '' : field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending || (isVariable && amountsMismatch)}>
              {t('form.submit')}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push('/gastos')}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </Form>

      {isVariable && (
        <div className="flex h-fit min-w-[280px] flex-1 flex-col gap-3 rounded-[var(--radius)] bg-muted p-6">
          <h3 className="text-base font-semibold">{t('new.previewHeading')}</h3>
          {!periodDates || amounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('new.previewEmpty')}</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {periodDates.map((date, idx) => (
                  <div key={idx} className="grid gap-2">
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
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('form.amountTotal')}
                </span>
                <span className="text-sm font-semibold">{formatAmount(amountsSum, values.currency)}</span>
              </div>
              {amountsMismatch && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t('form.amountsSumMismatch', {
                      sum: formatMoney(amountsSum),
                      total: formatMoney(values.default_amount || 0),
                    })}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
