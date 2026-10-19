'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import {
  createExpenseTemplateSchema,
  createExpenseCategorySchema,
  markExpensePaidSchema,
  type CreateExpenseTemplateInput,
  type CreateExpenseCategoryInput,
  type MarkExpensePaidInput,
} from '@/lib/validation/gastos';
import { computeVariablePeriodDates, parseDateOnly, toDateOnly, computeHorizonEnd } from '@/lib/gastos/generate';
import { topUpFixedExpense } from '@/lib/gastos/topUp';
import { referenceAmount, referenceCurrencyFor, type ExpensePaymentCurrency } from '@/lib/gastos/paymentRate';
import { isRateFresh } from '@/lib/exchangeRate';
import { getExchangeRatesAsOf } from '@/lib/actions/exchangeRate';

type ActionResult = { error: string } | { success: true };
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Network-verified — never getSession() as an authorization gate (CLAUDE.md). */
async function requireAdmin(tc: Awaited<ReturnType<typeof getTranslations>>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: tc('sessionExpired'), supabase: null, userId: null };
  }
  return { error: null, supabase, userId: data.user.id };
}

/** Single-tenant: there is exactly one condo_communities row (Phase 2, D-05). */
async function getCommunityId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from('condo_communities').select('id').limit(1).maybeSingle();
  return data?.id ?? null;
}

function normalizeOptional(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createExpenseTemplate(
  input: CreateExpenseTemplateInput,
  locale: string,
): Promise<ActionResult> {
  const [tv, tc, tg] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.gastos' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'gastos' }),
  ]);
  const parsed = createExpenseTemplateSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  const data = parsed.data;

  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const communityId = await getCommunityId(supabase);
  if (!communityId) return { error: tc('communityNotFound') };

  const { data: template, error: templateError } = await supabase
    .from('condo_expense_templates')
    .insert({
      community_id: communityId,
      name: data.name,
      category_id: data.category_id,
      provider: normalizeOptional(data.provider),
      kind: data.kind,
      cadence: data.cadence,
      currency: data.currency,
      default_amount: data.default_amount,
      start_date: data.start_date,
      installment_count: data.kind === 'variable' ? data.installment_count : null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (templateError || !template) return { error: (templateError ? await friendlyError(templateError) : tg('errors.createFailed')) };

  // Fixed templates now generate immediately through the rolling horizon
  // (Recurring Horizon Generation design) -- the admin sees a populated
  // schedule right away instead of waiting for tomorrow's cron. The same
  // topUpFixedExpense function the cron calls is the single source of truth
  // for "how a fixed gasto's periods are computed," so this is never a
  // second, divergent implementation of that math.
  if (data.kind === 'fixed') {
    const horizonEnd = computeHorizonEnd(new Date());
    const { error: topUpError } = await topUpFixedExpense(
      supabase,
      {
        id: template.id as string,
        category_id: data.category_id,
        provider: normalizeOptional(data.provider),
        currency: data.currency,
        cadence: data.cadence,
        default_amount: data.default_amount,
        start_date: data.start_date,
      },
      horizonEnd,
    );
    if (topUpError) {
      await supabase.from('condo_expense_templates').delete().eq('id', template.id);
      return { error: topUpError };
    }
    revalidatePath('/gastos');
    return { success: true };
  }

  // kind === 'variable': generate all installment_count rows now, staggered
  // per the admin-chosen cadence. Amounts are admin-entered per installment
  // (not necessarily equal) -- createExpenseTemplateSchema already verified
  // data.amounts.length === installment_count and their sum === default_amount.
  const startDate = new Date(`${data.start_date}T00:00:00`);
  // Admin-entered per-installment dates (validated by createExpenseTemplateSchema
  // to have exactly installment_count distinct entries) take precedence; fall
  // back to the cadence-derived baseline if they somehow didn't come through
  // (shouldn't happen given the schema's refine, but this keeps the action
  // safe on its own) -- same tolerance as `amounts` below.
  const periodDates =
    data.period_dates.length === data.installment_count
      ? data.period_dates.map(parseDateOnly)
      : computeVariablePeriodDates(startDate, data.installment_count, data.cadence);

  const rows = periodDates.map((date, idx) => ({
    template_id: template.id,
    category_id: data.category_id,
    provider: normalizeOptional(data.provider),
    currency: data.currency,
    amount: data.amounts[idx],
    installment_number: idx + 1,
    period_date: toDateOnly(date),
    status: 'pending' as const,
  }));

  // A single multi-row INSERT is one atomic SQL statement (mirrors CUOT-05's
  // transactional generation for special-divided cuotas). upsert +
  // ignoreDuplicates -> ON CONFLICT (template_id, period_date) DO NOTHING,
  // backed by condo_expenses' unique constraint -- idempotent against a
  // retried/double-submitted generation call.
  const { error: expensesError } = await supabase
    .from('condo_expenses')
    .upsert(rows, { onConflict: 'template_id,period_date', ignoreDuplicates: true });

  if (expensesError) {
    await supabase.from('condo_expense_templates').delete().eq('id', template.id);
    return { error: await friendlyError(expensesError) };
  }

  revalidatePath('/gastos');
  return { success: true };
}

export async function createExpenseCategory(
  input: CreateExpenseCategoryInput,
  locale: string,
): Promise<{ error: string } | { success: true; category: { id: string; name: string } }> {
  const [tv, tc, tg] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.gastos' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'gastos' }),
  ]);
  const parsed = createExpenseCategorySchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };

  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const communityId = await getCommunityId(supabase);
  if (!communityId) return { error: tc('communityNotFound') };

  const { data: category, error } = await supabase
    .from('condo_expense_categories')
    .insert({ community_id: communityId, name: parsed.data.name })
    .select('id, name')
    .single();

  if (error || !category) {
    if (error?.code === '23505') return { error: tg('categories.errors.duplicateName') };
    return { error: tg('categories.errors.createFailed') };
  }

  revalidatePath('/gastos');
  revalidatePath('/gastos/new');
  return { success: true, category };
}

/** Delete-if-unused: attempts the delete directly and reports the FK violation instead of pre-checking usage. */
export async function deleteExpenseCategory(categoryId: string, locale: string): Promise<ActionResult> {
  const [tc, tg] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'gastos' }),
  ]);
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_expense_categories').delete().eq('id', categoryId);
  if (error) {
    if (error.code === '23503') return { error: tg('categories.errors.inUse') };
    return { error: await friendlyError(error) };
  }

  revalidatePath('/gastos');
  revalidatePath('/gastos/new');
  return { success: true };
}

// `onHold`: bcv/eur has no fresh rate for the payment's date yet, so the expense
// was parked as 'on_hold' instead of rejected (change pagos-en-espera-por-tasa);
// lib/payments/releaseHeld.ts pays it by itself once the rate arrives.
export async function markExpensePaid(
  expenseId: string,
  input: MarkExpensePaidInput,
  locale: string,
): Promise<ActionResult | { success: true; onHold: true }> {
  const [tv, tc, tg] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.gastos' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'gastos' }),
  ]);
  const parsed = markExpensePaidSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  const data = parsed.data;

  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { data: expense, error: fetchError } = await supabase
    .from('condo_expenses')
    .select('id, status, currency')
    .eq('id', expenseId)
    .maybeSingle();
  if (fetchError) return { error: await friendlyError(fetchError) };
  if (!expense) return { error: tg('errors.notFound') };
  if (expense.status === 'paid') return { error: tg('errors.alreadyPaid') };
  // Already marked as paid and only waiting for its rate: it releases by itself.
  if (expense.status === 'on_hold') return { error: tg('errors.alreadyOnHold') };

  // Which currency the expense is paid in (change gastos-pago-multimoneda).
  // Default: its own. USDT expenses are always paid in USDT, untouched -- a
  // client asking for another payment currency on one is a malformed request.
  const expenseCurrency = expense.currency as ExpensePaymentCurrency | 'USDT';
  if (expenseCurrency === 'USDT' && data.payment_currency) return { error: tc('invalidData') };
  const paymentCurrency: ExpensePaymentCurrency | 'USDT' =
    expenseCurrency === 'USDT' ? 'USDT' : (data.payment_currency ?? expenseCurrency);
  const crossCurrency = paymentCurrency !== expenseCurrency;
  // A rate is needed whenever either side is Bs (USD <-> Bs, or Bs -> Bs to
  // record the equivalent); USD -> USD and USDT never use one.
  const needsRate = expenseCurrency !== 'USDT' && (expenseCurrency === 'Bs' || paymentCurrency === 'Bs');

  let rateColumns: {
    exchange_rate: number | null;
    exchange_rate_type: string | null;
    reference_amount: number | null;
    reference_currency: string | null;
    paid_currency: string | null;
    paid_amount: number | null;
  } = {
    exchange_rate: null,
    exchange_rate_type: null,
    reference_amount: null,
    reference_currency: null,
    paid_currency: null,
    paid_amount: null,
  };

  let onHold = false;
  if (needsRate) {
    const rateType = data.exchange_rate_type;
    if (!rateType) return { error: tg('errors.rateTypeRequired') };

    // null = no fresh bcv/eur rate for the payment's date: the expense waits.
    let rate: number | null;
    if (rateType === 'custom') {
      // Typed by the admin for this one expense: no freshness rule. Rounded to
      // the column's 4 decimals so what is stored matches the stored rate.
      rate = Math.round(data.custom_rate! * 10000) / 10000;
      // A tiny rate (0.00004) passes validation but rounds to 0: reject it here
      // instead of letting the database's `exchange_rate > 0` check fail with a generic error.
      if (!(rate > 0)) return { error: tv('customRatePositive') };
    } else {
      // bcv/eur are never taken from the client: re-read here as of the
      // payment's own date and held to the 24h freshness rule, same as the
      // payments flow (lib/payments/applyAllocation.ts).
      const rates = await getExchangeRatesAsOf(data.paid_date);
      const row = rates[rateType];
      rate = row && isRateFresh(row.updated_at, parseDateOnly(data.paid_date)) ? row.rate : null;
    }
    onHold = rate === null;

    if (crossCurrency) {
      // The amount actually paid is what the admin confirmed in the dialog
      // (prefilled from the rate, editable), so it is not recomputed here.
      if (data.paid_amount === undefined) return { error: tg('errors.paidAmountRequired') };
      // On hold the rate is still unknown: only the type is stored and the
      // release fills `exchange_rate` in.
      rateColumns = {
        ...rateColumns,
        exchange_rate: rate,
        exchange_rate_type: rateType,
        paid_currency: paymentCurrency,
        paid_amount: data.paid_amount,
      };
    } else if (rate === null) {
      // Bs paid in Bs, rate still unknown: the equivalent is computed on release.
      rateColumns = { ...rateColumns, exchange_rate_type: rateType };
    } else {
      // Bs paid in Bs: nothing to convert, but keep the USD (or EUR) equivalent.
      const reference = referenceAmount(data.amount, rate);
      if (reference === null) return { error: tc('invalidData') };
      rateColumns = {
        ...rateColumns,
        exchange_rate: rate,
        exchange_rate_type: rateType,
        reference_amount: reference,
        reference_currency: referenceCurrencyFor(rateType),
      };
    }
  }

  // Same currency: "Monto final" overwrites `amount`, as before. Different
  // currency: `amount` keeps what was owed and the payment lives in paid_*.
  const amountUpdate = crossCurrency ? {} : { amount: data.amount };

  // `.eq('status', 'pending')` + checking a row was touched closes the gap
  // between the read above and this write: two simultaneous submits can't
  // overwrite the rate of an expense that was just paid.
  const { data: updated, error: updateError } = await supabase
    .from('condo_expenses')
    .update({
      ...amountUpdate,
      paid_date: data.paid_date,
      notes: normalizeOptional(data.notes),
      status: onHold ? 'on_hold' : 'paid',
      ...rateColumns,
    })
    .eq('id', expenseId)
    .eq('status', 'pending')
    .select('id');
  if (updateError) return { error: await friendlyError(updateError) };
  if (!updated || updated.length === 0) return { error: tg('errors.alreadyPaid') };

  await logAudit(supabase, {
    userId,
    action: 'expense.mark_paid',
    entityType: 'expense',
    entityId: expenseId,
  });

  revalidatePath('/gastos');
  return onHold ? { success: true, onHold: true } : { success: true };
}

export async function setExpenseTemplateActive(
  templateId: string,
  active: boolean,
  locale: string,
): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_expense_templates').update({ active }).eq('id', templateId);
  if (error) return { error: await friendlyError(error) };

  // Same "void still-pending instances" behavior as cuotas'
  // setInstallmentTemplateActive -- deactivating hides every not-yet-paid
  // generated expense from admin/resident views (deleted_at is null on
  // every read) without losing the row. Paid expenses are left alone.
  if (!active) {
    const { error: voidError } = await supabase
      .from('condo_expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('template_id', templateId)
      .eq('status', 'pending')
      .is('deleted_at', null);
    if (voidError) return { error: await friendlyError(voidError) };
  }

  revalidatePath('/gastos');
  revalidatePath('/dashboard');
  return { success: true };
}

/** Soft delete: sets deleted_at, never removes the row (keeps the financial record). */
export async function deleteExpense(expenseId: string, locale: string): Promise<ActionResult> {
  const [tc, tg] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'gastos' }),
  ]);
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { data: expense, error: fetchError } = await supabase
    .from('condo_expenses')
    .select('id, status')
    .eq('id', expenseId)
    .maybeSingle();
  if (fetchError) return { error: await friendlyError(fetchError) };
  if (!expense) return { error: tg('errors.notFound') };
  // An expense waiting for its exchange rate is already marked as paid: it gets paid by itself when the rate arrives, so it can't be deleted either.
  if (expense.status === 'paid' || expense.status === 'on_hold') return { error: tg('errors.cannotDeletePaid') };

  const { error } = await supabase
    .from('condo_expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId);
  if (error) return { error: await friendlyError(error) };

  revalidatePath('/gastos');
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * Soft delete a whole expense template (fixed or variable) plus every one of
 * its still-pending instances. Refuses if ANY instance for this template is
 * already paid -- same guard as cuotas' deleteInstallmentTemplate ("only
 * allowed before any payment exists against it").
 */
export async function deleteExpenseTemplate(templateId: string, locale: string): Promise<ActionResult> {
  const [tc, tg] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'gastos' }),
  ]);
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { count: paidCount, error: paidError } = await supabase
    .from('condo_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)
    .in('status', ['paid', 'on_hold']); // a held expense is committed too (it will be paid by itself)
  if (paidError) return { error: await friendlyError(paidError) };
  if (paidCount && paidCount > 0) return { error: tg('errors.hasPayments') };

  const now = new Date().toISOString();

  const { error: expensesError } = await supabase
    .from('condo_expenses')
    .update({ deleted_at: now })
    .eq('template_id', templateId)
    .eq('status', 'pending');
  if (expensesError) return { error: await friendlyError(expensesError) };

  const { error: templateError } = await supabase
    .from('condo_expense_templates')
    .update({ deleted_at: now })
    .eq('id', templateId);
  if (templateError) return { error: await friendlyError(templateError) };

  revalidatePath('/gastos');
  revalidatePath('/dashboard');
  return { success: true };
}
