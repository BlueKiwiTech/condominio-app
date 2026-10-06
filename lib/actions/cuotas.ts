'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import {
  createTemplateSchema,
  updateTemplateSchema,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from '@/lib/validation/cuotas';
import {
  buildInstallmentRows,
  computeDueDates,
  computeHorizonEnd,
  parseDateOnly,
  splitAmount,
  toDateOnly,
  type Cadence,
  type Currency,
  type DueDateMode,
} from '@/lib/cuotas/generate';
import { generateRecurringCuotaInstallments, type OpenEndedRecurringTemplate } from '@/lib/cuotas/recurringGeneration';
import { sweepCreditForNewInstallments } from '@/lib/payments/creditSweep';
import type { AllocatableInstallment } from '@/lib/payments/allocate';

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

function dueDateModeFor(input: CreateTemplateInput): DueDateMode {
  if (input.installment_type === 'recurring') return { kind: 'recurring', cadence: input.cadence };
  return input.is_divided ? { kind: 'special-divided', cadence: input.cadence } : { kind: 'special-single' };
}

export async function createInstallmentTemplate(input: CreateTemplateInput, locale: string): Promise<ActionResult> {
  const [tv, tc, tq] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.cuotas' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'cuotas' }),
  ]);
  const parsed = createTemplateSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  const data = parsed.data;

  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const communityId = await getCommunityId(supabase);
  if (!communityId) return { error: tc('communityNotFound') };

  // Resolve target houses — empty selection ("Todas") snapshots the FULL
  // house list at creation time (PLAN.md Phase 4 decision: a template's
  // house scope is fixed at creation; a house added later needs its own new
  // cuota, it is never retroactively folded into this one).
  let houseIds = data.applicable_houses;
  if (houseIds.length === 0) {
    const { data: allHouses, error: housesError } = await supabase.from('condo_houses').select('id');
    if (housesError) return { error: await friendlyError(housesError) };
    houseIds = (allHouses ?? []).map((h) => h.id as string);
  }
  if (houseIds.length === 0) return { error: tq('errors.noHousesAvailable') };

  if (data.installment_type === 'recurring') {
    const { data: template, error: templateError } = await supabase
      .from('condo_installment_templates')
      .insert({
        community_id: communityId,
        name: data.name,
        description: normalizeOptional(data.description),
        installment_type: 'recurring',
        cadence: data.cadence,
        amount: data.amount,
        currency: data.currency,
        start_date: data.start_date,
        number_of_installments: null,
        is_divided: false,
        applicable_houses: houseIds,
        created_by: userId,
      })
      .select('id')
      .single();

    if (templateError || !template) return { error: (templateError ? await friendlyError(templateError) : tq('errors.createFailed')) };

    const openEndedTemplate: OpenEndedRecurringTemplate = {
      id: template.id as string,
      name: data.name,
      cadence: data.cadence,
      amount: data.amount,
      currency: data.currency,
      start_date: data.start_date,
      applicable_houses: houseIds,
      created_by: userId,
    };

    const horizonEnd = computeHorizonEnd(new Date());
    const { error: generationError } = await generateRecurringCuotaInstallments(supabase, openEndedTemplate, horizonEnd);
    if (generationError) {
      // Same rollback rationale as the special-cuota path below: the
      // multi-row insert is its own atomic statement, but it isn't wrapped
      // in a single DB transaction with the template-row insert above
      // (Server Actions call PostgREST over HTTP, not a shared connection).
      await supabase.from('condo_installment_templates').delete().eq('id', template.id);
      return { error: generationError };
    }

    revalidatePath('/cuotas');
    revalidatePath('/pagos');
    return { success: true };
  }

  // installment_type === 'special' (single or divided) -- unchanged finite
  // model, generated in full at creation, no cron involved.
  const isDivided = data.is_divided;
  const count = isDivided ? data.number_of_installments : 1;
  const startDate = parseDateOnly(data.start_date);
  const mode = dueDateModeFor(data);
  // Admin-entered per-installment due dates (validated by createTemplateSchema
  // to have exactly `count` entries when divided) take precedence; fall back
  // to the cadence-derived baseline if the divided branch somehow didn't send
  // any (shouldn't happen given the schema's refine, but this keeps the
  // action safe on its own) -- same tolerance as `amounts` below.
  const customDueDates = data.due_dates;
  const dueDates =
    isDivided && customDueDates && customDueDates.length === count
      ? customDueDates.map(parseDateOnly)
      : computeDueDates(mode, startDate, count);
  // Admin-entered per-installment amounts (validated by createTemplateSchema
  // to sum to data.amount) take precedence; fall back to an even split if
  // the divided branch somehow didn't send any (shouldn't happen given the
  // schema's refine, but this keeps the action safe on its own).
  const customAmounts = data.amounts;
  const amounts = isDivided
    ? (customAmounts && customAmounts.length === count ? customAmounts : splitAmount(data.amount, count))
    : Array(count).fill(data.amount);

  const { data: template, error: templateError } = await supabase
    .from('condo_installment_templates')
    .insert({
      community_id: communityId,
      name: data.name,
      description: normalizeOptional(data.description),
      installment_type: 'special',
      cadence: null,
      amount: data.amount,
      currency: data.currency,
      start_date: data.start_date,
      number_of_installments: count,
      is_divided: isDivided,
      applicable_houses: houseIds,
      created_by: userId,
    })
    .select('id')
    .single();

  if (templateError || !template) return { error: (templateError ? await friendlyError(templateError) : tq('errors.createFailed')) };

  const rows = buildInstallmentRows({
    name: data.name,
    currency: data.currency,
    houseIds,
    dueDates,
    amounts,
  }).map((row) => ({ ...row, template_id: template.id }));

  // A single multi-row INSERT is one atomic SQL statement (CUOT-05:
  // transactional generation). upsert + ignoreDuplicates -> ON CONFLICT
  // (template_id, house_id, installment_number) DO NOTHING, backed by the
  // unique constraint from the initial schema migration -- idempotent
  // against a retried/double-submitted generation call (CUOT-05).
  //
  // Note: this is NOT wrapped with the template insert above in a single DB
  // transaction (Server Actions call PostgREST over HTTP, not a shared
  // connection/BEGIN block) -- if this second statement fails, the template
  // row is explicitly rolled back below instead, which covers the realistic
  // failure mode (the multi-row insert itself is atomic on its own).
  const { data: insertedRows, error: installmentsError } = await supabase
    .from('condo_installments')
    .upsert(rows, { onConflict: 'template_id,house_id,installment_number', ignoreDuplicates: true })
    .select('id, house_id, installment_number, due_date, amount');

  if (installmentsError) {
    await supabase.from('condo_installment_templates').delete().eq('id', template.id);
    return { error: await friendlyError(installmentsError) };
  }

  // PLAN.md Phase 5 decision: a house's saldo a favor (credit) is
  // "auto-applied to the next cuota that becomes due" — a freshly generated
  // installment IS exactly that case. Best-effort per house: a credit-sweep
  // failure here doesn't roll back the cuota that was just created (the
  // installments themselves are already valid pending rows either way).
  const byHouse = new Map<string, AllocatableInstallment[]>();
  for (const row of insertedRows ?? []) {
    const list = byHouse.get(row.house_id as string) ?? [];
    list.push({
      id: row.id as string,
      amount: row.amount as number,
      amount_paid: 0,
      due_date: row.due_date as string,
      installment_number: row.installment_number as number,
      currency: data.currency,
    });
    byHouse.set(row.house_id as string, list);
  }
  for (const [houseId, newInstallments] of byHouse) {
    await sweepCreditForNewInstallments(supabase, {
      houseId,
      currency: data.currency,
      createdBy: userId,
      newInstallments,
      paymentDate: toDateOnly(new Date()),
      notes: 'Aplicado automáticamente desde saldo a favor.',
    });
  }

  revalidatePath('/cuotas');
  revalidatePath('/pagos');
  return { success: true };
}

export async function updateInstallmentTemplate(
  templateId: string,
  input: UpdateTemplateInput,
  locale: string,
): Promise<ActionResult> {
  const [tv, tc, tq] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.cuotas' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'cuotas' }),
  ]);
  const parsed = updateTemplateSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  const data = parsed.data;

  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { data: template, error: fetchError } = await supabase
    .from('condo_installment_templates')
    .select('id, name, is_divided, amount, currency, installment_type, cadence, number_of_installments, start_date, applicable_houses, active')
    .eq('id', templateId)
    .maybeSingle();
  if (fetchError) return { error: await friendlyError(fetchError) };
  if (!template) return { error: tq('errors.notFound') };

  // Divided special cuotas have per-installment fractional amounts (see
  // lib/validation/cuotas.ts's updateTemplateSchema comment) — re-splitting
  // an edited total safely would need to reconcile already-generated rows,
  // out of scope for this edit path. Name/description/currency still edit
  // freely; amount is silently left untouched for divided templates.
  const templatePatch: Record<string, unknown> = {
    name: data.name,
    description: normalizeOptional(data.description),
    currency: data.currency,
  };
  const installmentPatch: Record<string, unknown> = { name: data.name, currency: data.currency };
  if (!template.is_divided) {
    templatePatch.amount = data.amount;
    installmentPatch.amount = data.amount;
  }

  const { error: templateUpdateError } = await supabase
    .from('condo_installment_templates')
    .update(templatePatch)
    .eq('id', templateId);
  if (templateUpdateError) return { error: await friendlyError(templateUpdateError) };

  // PLAN.md Phase 4 decision: editing a template "updates all unpaid future
  // installments already generated from it (paid installments are
  // untouched, preserved as historical record)". When effective_from is
  // given (a mid-cycle amount change), also require due_date >=
  // effective_from so an unpaid installment from BEFORE the change (a
  // moroso) keeps its old amount instead of silently jumping to the new one.
  let installmentsQuery = supabase
    .from('condo_installments')
    .update(installmentPatch)
    .eq('template_id', templateId)
    .neq('status', 'paid');
  if (data.effective_from) {
    installmentsQuery = installmentsQuery.gte('due_date', data.effective_from);
  }
  const { error: installmentsUpdateError } = await installmentsQuery;
  if (installmentsUpdateError) return { error: await friendlyError(installmentsUpdateError) };

  if (data.start_date && data.start_date !== template.start_date) {
    const startDateError = await changeTemplateStartDate(
      supabase,
      {
        id: templateId,
        name: data.name,
        installment_type: template.installment_type as 'recurring' | 'special',
        cadence: template.cadence as Cadence | null,
        amount: template.is_divided ? (template.amount as number) : data.amount,
        currency: data.currency,
        number_of_installments: template.number_of_installments as number | null,
        is_divided: template.is_divided as boolean,
        old_start_date: template.start_date as string,
        applicable_houses: template.applicable_houses as string[],
        active: template.active as boolean,
        created_by: userId,
      },
      data.start_date,
      tq('errors.startDateHasPayments'),
    );
    if (startDateError) return { error: startDateError };
  }

  // Bitácora de cambios de precio: log every actual amount change instead of
  // silently overwriting it, so the admin can see when/why a cuota's price
  // moved. Best-effort -- the amount change itself already succeeded above,
  // so a failure here shouldn't surface as if the edit failed.
  if (!template.is_divided && data.amount !== template.amount) {
    await supabase.from('condo_installment_price_history').insert({
      template_id: templateId,
      old_amount: template.amount,
      new_amount: data.amount,
      effective_from: data.effective_from || null,
      changed_by: userId,
    });
  }

  revalidatePath('/cuotas');
  return { success: true };
}

/**
 * Moves a template's start date and recomputes every generated installment's
 * due date from it (2026-10-06: the edit form used to have no way to correct
 * a wrong start date). Only allowed while NO payment exists against any of the
 * template's installments (same rule as deleting -- CUOT-06), which also
 * guarantees no credit sweep touched them. Open-ended recurring templates are
 * wiped and regenerated through the normal horizon generator (moving the
 * start earlier can add periods, later can drop them); every other kind is
 * re-dated in place so installment ids/numbers stay stable. Returns an error
 * string, or null on success.
 */
async function changeTemplateStartDate(
  supabase: SupabaseClient,
  template: {
    id: string;
    name: string;
    installment_type: 'recurring' | 'special';
    cadence: Cadence | null;
    amount: number;
    currency: Currency;
    number_of_installments: number | null;
    is_divided: boolean;
    old_start_date: string;
    applicable_houses: string[];
    active: boolean;
    created_by: string | null;
  },
  newStartDate: string,
  hasPaymentsMessage: string,
): Promise<string | null> {
  const { data: rows, error: rowsError } = await supabase
    .from('condo_installments')
    .select('id, installment_number, due_date')
    .eq('template_id', template.id);
  if (rowsError) return friendlyError(rowsError);
  const ids = (rows ?? []).map((r) => r.id as string);

  if (ids.length > 0) {
    const { count, error: paymentsError } = await supabase
      .from('condo_payments')
      .select('id', { count: 'exact', head: true })
      .in('installment_id', ids);
    if (paymentsError) return friendlyError(paymentsError);
    if (count && count > 0) return hasPaymentsMessage;
  }

  const newStart = parseDateOnly(newStartDate);
  const isOpenEndedRecurring = template.installment_type === 'recurring' && template.number_of_installments === null;

  if (isOpenEndedRecurring) {
    const { error: deleteError } = await supabase.from('condo_installments').delete().eq('template_id', template.id);
    if (deleteError) return friendlyError(deleteError);
    const { error: startError } = await supabase
      .from('condo_installment_templates')
      .update({ start_date: newStartDate })
      .eq('id', template.id);
    if (startError) return friendlyError(startError);
    // An inactive template stays empty; the generator picks it up from the new
    // start date whenever it's reactivated.
    if (!template.active) return null;
    const { error: generationError } = await generateRecurringCuotaInstallments(
      supabase,
      {
        id: template.id,
        name: template.name,
        cadence: template.cadence as Cadence,
        amount: template.amount,
        currency: template.currency,
        start_date: newStartDate,
        applicable_houses: template.applicable_houses,
        created_by: template.created_by,
      },
      computeHorizonEnd(new Date()),
    );
    return generationError;
  }

  // In place: one UPDATE per distinct installment_number (a number is shared
  // by every house's row), never one per row.
  const byNumber = new Map<number, string>();
  for (const r of rows ?? []) byNumber.set(r.installment_number as number, r.due_date as string);
  const dayShift = differenceInCalendarDays(newStart, parseDateOnly(template.old_start_date));
  const maxNumber = Math.max(0, ...byNumber.keys());
  const recurringDates =
    template.installment_type === 'recurring' && template.cadence
      ? computeDueDates({ kind: 'recurring', cadence: template.cadence }, newStart, maxNumber)
      : null;

  for (const [installmentNumber, oldDue] of byNumber) {
    let newDue: Date;
    if (recurringDates) newDue = recurringDates[installmentNumber - 1];
    else if (!template.is_divided) newDue = newStart; // special-single
    else newDue = addDays(parseDateOnly(oldDue), dayShift); // special-divided keeps its admin-set spacing
    const { error: updateError } = await supabase
      .from('condo_installments')
      .update({ due_date: toDateOnly(newDue) })
      .eq('template_id', template.id)
      .eq('installment_number', installmentNumber);
    if (updateError) return friendlyError(updateError);
  }

  const { error: startError } = await supabase
    .from('condo_installment_templates')
    .update({ start_date: newStartDate })
    .eq('id', template.id);
  if (startError) return friendlyError(startError);
  return null;
}

export type PriceHistoryEntry = {
  id: string;
  old_amount: number;
  new_amount: number;
  effective_from: string | null;
  changed_at: string;
};

/** Read-only: powers CuotaEditDialog's "Historial de cambios" list. */
export async function getPriceHistory(
  templateId: string,
  locale: string,
): Promise<{ error: string } | { success: true; entries: PriceHistoryEntry[] }> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { data, error } = await supabase
    .from('condo_installment_price_history')
    .select('id, old_amount, new_amount, effective_from, changed_at')
    .eq('template_id', templateId)
    .order('changed_at', { ascending: false });
  if (error) return { error: await friendlyError(error) };

  return { success: true, entries: (data ?? []) as PriceHistoryEntry[] };
}

export async function deleteInstallmentTemplate(templateId: string, locale: string): Promise<ActionResult> {
  const [tc, tq] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'cuotas' }),
  ]);
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  // CUOT-06: only allowed before any payment exists against it.
  const { data: installmentRows, error: idsError } = await supabase
    .from('condo_installments')
    .select('id')
    .eq('template_id', templateId);
  if (idsError) return { error: await friendlyError(idsError) };
  const ids = (installmentRows ?? []).map((r) => r.id as string);

  if (ids.length > 0) {
    const { count, error: paymentsError } = await supabase
      .from('condo_payments')
      .select('id', { count: 'exact', head: true })
      .in('installment_id', ids);
    if (paymentsError) return { error: await friendlyError(paymentsError) };
    if (count && count > 0) {
      return { error: tq('errors.hasPayments') };
    }
  }

  const { error: deleteInstallmentsError } = await supabase
    .from('condo_installments')
    .delete()
    .eq('template_id', templateId);
  if (deleteInstallmentsError) return { error: await friendlyError(deleteInstallmentsError) };

  const { error: deleteTemplateError } = await supabase
    .from('condo_installment_templates')
    .delete()
    .eq('id', templateId);
  if (deleteTemplateError) return { error: await friendlyError(deleteTemplateError) };

  revalidatePath('/cuotas');
  return { success: true };
}

export async function setInstallmentTemplateActive(
  templateId: string,
  active: boolean,
  locale: string,
): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_installment_templates').update({ active }).eq('id', templateId);
  if (error) return { error: await friendlyError(error) };

  // Deactivating voids every still-pending (untouched, unpaid) installment
  // already generated for this template -- they disappear from every
  // admin/resident read (all filter deleted_at is null) without losing the
  // row or the recurring generator's resume point, which deliberately
  // ignores deleted_at (lib/cuotas/recurringGeneration.ts). Partial/paid
  // installments are left alone (PLAN.md's "Desactivar" decision, option 1).
  if (!active) {
    const { error: voidError } = await supabase
      .from('condo_installments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('template_id', templateId)
      .eq('status', 'pending')
      .is('deleted_at', null);
    if (voidError) return { error: await friendlyError(voidError) };
  }

  revalidatePath('/cuotas');
  revalidatePath('/dashboard');
  revalidatePath('/reporte');
  return { success: true };
}
