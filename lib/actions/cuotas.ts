'use server';

import { revalidatePath } from 'next/cache';
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
  parseDateOnly,
  splitAmount,
  type DueDateMode,
} from '@/lib/cuotas/generate';

type ActionResult = { error: string } | { success: true };
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Network-verified — never getSession() as an authorization gate (CLAUDE.md). */
async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: 'Tu sesión expiró. Inicia sesión de nuevo.' as const, supabase: null, userId: null };
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
  return input.is_divided ? { kind: 'special-divided' } : { kind: 'special-single' };
}

export async function createInstallmentTemplate(input: CreateTemplateInput): Promise<ActionResult> {
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const data = parsed.data;

  const { error: authError, supabase, userId } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  const communityId = await getCommunityId(supabase);
  if (!communityId) return { error: 'No se encontró la comunidad. Contacta soporte.' };

  // Resolve target houses — empty selection ("Todas") snapshots the FULL
  // house list at creation time (PLAN.md Phase 4 decision: a template's
  // house scope is fixed at creation; a house added later needs its own new
  // cuota, it is never retroactively folded into this one).
  let houseIds = data.applicable_houses;
  if (houseIds.length === 0) {
    const { data: allHouses, error: housesError } = await supabase.from('condo_houses').select('id');
    if (housesError) return { error: housesError.message };
    houseIds = (allHouses ?? []).map((h) => h.id as string);
  }
  if (houseIds.length === 0) return { error: 'No hay casas registradas para asignar esta cuota.' };

  const isDivided = data.installment_type === 'special' && data.is_divided;
  const count = data.installment_type === 'recurring' ? data.number_of_installments : isDivided ? data.number_of_installments : 1;
  const startDate = parseDateOnly(data.start_date);
  const mode = dueDateModeFor(data);
  const dueDates = computeDueDates(mode, startDate, count);
  const amounts = isDivided ? splitAmount(data.amount, count) : Array(count).fill(data.amount);

  const { data: template, error: templateError } = await supabase
    .from('condo_installment_templates')
    .insert({
      community_id: communityId,
      name: data.name,
      description: normalizeOptional(data.description),
      installment_type: data.installment_type,
      cadence: data.installment_type === 'recurring' ? data.cadence : null,
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

  if (templateError || !template) return { error: templateError?.message ?? 'No se pudo crear la cuota.' };

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
  const { error: installmentsError } = await supabase
    .from('condo_installments')
    .upsert(rows, { onConflict: 'template_id,house_id,installment_number', ignoreDuplicates: true });

  if (installmentsError) {
    await supabase.from('condo_installment_templates').delete().eq('id', template.id);
    return { error: installmentsError.message };
  }

  revalidatePath('/cuotas');
  return { success: true };
}

export async function updateInstallmentTemplate(templateId: string, input: UpdateTemplateInput): Promise<ActionResult> {
  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const data = parsed.data;

  const { error: authError, supabase } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  const { data: template, error: fetchError } = await supabase
    .from('condo_installment_templates')
    .select('id, is_divided')
    .eq('id', templateId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!template) return { error: 'Cuota no encontrada.' };

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
  if (templateUpdateError) return { error: templateUpdateError.message };

  // PLAN.md Phase 4 decision: editing a template "updates all unpaid future
  // installments already generated from it (paid installments are
  // untouched, preserved as historical record)".
  const { error: installmentsUpdateError } = await supabase
    .from('condo_installments')
    .update(installmentPatch)
    .eq('template_id', templateId)
    .neq('status', 'paid');
  if (installmentsUpdateError) return { error: installmentsUpdateError.message };

  revalidatePath('/cuotas');
  return { success: true };
}

export async function deleteInstallmentTemplate(templateId: string): Promise<ActionResult> {
  const { error: authError, supabase } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  // CUOT-06: only allowed before any payment exists against it.
  const { data: installmentRows, error: idsError } = await supabase
    .from('condo_installments')
    .select('id')
    .eq('template_id', templateId);
  if (idsError) return { error: idsError.message };
  const ids = (installmentRows ?? []).map((r) => r.id as string);

  if (ids.length > 0) {
    const { count, error: paymentsError } = await supabase
      .from('condo_payments')
      .select('id', { count: 'exact', head: true })
      .in('installment_id', ids);
    if (paymentsError) return { error: paymentsError.message };
    if (count && count > 0) {
      return { error: 'No se puede eliminar: esta cuota ya tiene pagos registrados.' };
    }
  }

  const { error: deleteInstallmentsError } = await supabase
    .from('condo_installments')
    .delete()
    .eq('template_id', templateId);
  if (deleteInstallmentsError) return { error: deleteInstallmentsError.message };

  const { error: deleteTemplateError } = await supabase
    .from('condo_installment_templates')
    .delete()
    .eq('id', templateId);
  if (deleteTemplateError) return { error: deleteTemplateError.message };

  revalidatePath('/cuotas');
  return { success: true };
}
