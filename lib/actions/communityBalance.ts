'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { friendlyError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import {
  openingBalanceSchema,
  adjustmentSchema,
  type OpeningBalanceInput,
  type AdjustmentInput,
} from '@/lib/validation/communityBalance';

type ActionResult = { error: string } | { success: true };
type Currency = 'USD' | 'Bs' | 'USDT';

/** Today's calendar day in Venezuela (the server runs in UTC: after 20:00 VET `new Date()` is already tomorrow). */
function caracasToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

/** Network-verified — never getSession() as an authorization gate (CLAUDE.md). */
async function requireAdmin(tc: Awaited<ReturnType<typeof getTranslations>>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: tc('sessionExpired'), supabase: null, userId: null };
  return { error: null, supabase, userId: data.user.id };
}

async function addMovement(
  type: 'opening' | 'adjustment',
  input: { currency: Currency; amount: number; note: string | null },
  locale: string,
): Promise<ActionResult> {
  const [tc, tb] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'communityBalance' }),
  ]);
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  // Single-tenant: exactly one condo_communities row (Phase 2, D-05).
  const { data: community } = await supabase.from('condo_communities').select('id').limit(1).maybeSingle();
  if (!community) return { error: tc('communityNotFound') };

  const { data, error } = await supabase.rpc('condo_add_community_movement', {
    p_community_id: community.id,
    p_type: type,
    p_currency: input.currency,
    p_amount: input.amount,
    p_note: input.note,
    p_occurred_on: caracasToday(),
  });
  if (error) return { error: await friendlyError(error) };
  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) {
    if (result?.reason === 'already_exists') return { error: tb('errors.openingExists') };
    return { error: tc('invalidData') };
  }

  await logAudit(supabase, {
    userId,
    action: type === 'opening' ? 'community_balance.opening' : 'community_balance.adjustment',
    entityType: 'community_balance',
    entityId: community.id,
  });
  revalidatePath('/saldo-comunidad');
  revalidatePath('/dashboard');
  revalidatePath('/gastos');
  return { success: true };
}

/** Opening balance of one currency: once per currency, amount > 0. */
export async function registerOpeningBalance(input: OpeningBalanceInput, locale: string): Promise<ActionResult> {
  const [tv, tc] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.communityBalance' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);
  const parsed = openingBalanceSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  return addMovement('opening', { currency: parsed.data.currency, amount: parsed.data.amount, note: null }, locale);
}

/** Manual adjustment: positive or negative, never zero, with a mandatory reason. */
export async function registerAdjustment(input: AdjustmentInput, locale: string): Promise<ActionResult> {
  const [tv, tc] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.communityBalance' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);
  const parsed = adjustmentSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  return addMovement(
    'adjustment',
    { currency: parsed.data.currency, amount: parsed.data.amount, note: parsed.data.note },
    locale,
  );
}
