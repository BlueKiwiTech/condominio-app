'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import {
  createExpenseTemplateSchema,
  markExpensePaidSchema,
  type CreateExpenseTemplateInput,
  type MarkExpensePaidInput,
} from '@/lib/validation/gastos';
import { computeVariablePeriodDates, splitAmount, toDateOnly } from '@/lib/gastos/generate';

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
      cadence: data.kind === 'fixed' ? data.cadence : null,
      currency: data.currency,
      default_amount: data.default_amount,
      start_date: data.start_date,
      installment_count: data.kind === 'variable' ? data.installment_count : null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (templateError || !template) return { error: templateError?.message ?? tg('errors.createFailed') };

  // Fixed templates generate no rows here -- the daily cron
  // (app/api/cron/generate-expenses/route.ts) creates the first (and every
  // subsequent) pending instance once start_date has arrived, so there's a
  // single source of truth for "how a fixed gasto's periods are computed."
  if (data.kind === 'fixed') {
    revalidatePath('/gastos');
    return { success: true };
  }

  // kind === 'variable': generate all installment_count rows now, staggered
  // one month apart, total split via splitAmount — same shape as special-
  // divided cuotas (lib/actions/cuotas.ts's createInstallmentTemplate).
  const startDate = new Date(`${data.start_date}T00:00:00`);
  const periodDates = computeVariablePeriodDates(startDate, data.installment_count);
  const amounts = splitAmount(data.default_amount, data.installment_count);

  const rows = periodDates.map((date, idx) => ({
    template_id: template.id,
    category_id: data.category_id,
    provider: normalizeOptional(data.provider),
    currency: data.currency,
    amount: amounts[idx],
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
    return { error: expensesError.message };
  }

  revalidatePath('/gastos');
  return { success: true };
}

export async function markExpensePaid(
  expenseId: string,
  input: MarkExpensePaidInput,
  locale: string,
): Promise<ActionResult> {
  const [tv, tc, tg] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.gastos' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'gastos' }),
  ]);
  const parsed = markExpensePaidSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  const data = parsed.data;

  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { data: expense, error: fetchError } = await supabase
    .from('condo_expenses')
    .select('id, status')
    .eq('id', expenseId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!expense) return { error: tg('errors.notFound') };
  if (expense.status === 'paid') return { error: tg('errors.alreadyPaid') };

  const { error: updateError } = await supabase
    .from('condo_expenses')
    .update({
      amount: data.amount,
      paid_date: data.paid_date,
      notes: normalizeOptional(data.notes),
      status: 'paid',
    })
    .eq('id', expenseId);
  if (updateError) return { error: updateError.message };

  revalidatePath('/gastos');
  return { success: true };
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
  if (error) return { error: error.message };

  revalidatePath('/gastos');
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
  if (fetchError) return { error: fetchError.message };
  if (!expense) return { error: tg('errors.notFound') };
  if (expense.status === 'paid') return { error: tg('errors.cannotDeletePaid') };

  const { error } = await supabase
    .from('condo_expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId);
  if (error) return { error: error.message };

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
    .eq('status', 'paid');
  if (paidError) return { error: paidError.message };
  if (paidCount && paidCount > 0) return { error: tg('errors.hasPayments') };

  const now = new Date().toISOString();

  const { error: expensesError } = await supabase
    .from('condo_expenses')
    .update({ deleted_at: now })
    .eq('template_id', templateId)
    .eq('status', 'pending');
  if (expensesError) return { error: expensesError.message };

  const { error: templateError } = await supabase
    .from('condo_expense_templates')
    .update({ deleted_at: now })
    .eq('id', templateId);
  if (templateError) return { error: templateError.message };

  revalidatePath('/gastos');
  revalidatePath('/dashboard');
  return { success: true };
}
