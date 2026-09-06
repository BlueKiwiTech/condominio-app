'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createHouseSchema,
  updateHouseSchema,
  residentSchema,
  type CreateHouseInput,
  type UpdateHouseInput,
  type ResidentInput,
} from '@/lib/validation/houses';

type ActionResult = { error: string } | { success: true };

/** Network-verified — never getSession() as an authorization gate (CLAUDE.md). */
async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: 'Tu sesión expiró. Inicia sesión de nuevo.' as const, supabase: null };
  }
  return { error: null, supabase };
}

/** Single-tenant: there is exactly one condo_communities row (Phase 2, D-05). */
async function getCommunityId(
  supabase: NonNullable<Awaited<ReturnType<typeof requireAdmin>>['supabase']>,
): Promise<string | null> {
  const { data } = await supabase.from('condo_communities').select('id').limit(1).maybeSingle();
  return data?.id ?? null;
}

function normalizeOptional(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createHouse(input: CreateHouseInput): Promise<ActionResult> {
  const parsed = createHouseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { error: authError, supabase } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  const communityId = await getCommunityId(supabase);
  if (!communityId) return { error: 'No se encontró la comunidad. Contacta soporte.' };

  const { data: pinHash, error: hashError } = await supabase.rpc('condo_hash_pin', {
    p_pin: parsed.data.pin,
  });
  if (hashError || !pinHash) return { error: 'No se pudo procesar el PIN. Intenta de nuevo.' };

  const { error } = await supabase.from('condo_houses').insert({
    community_id: communityId,
    house_number: parsed.data.house_number,
    house_name: normalizeOptional(parsed.data.house_name),
    owner_name: normalizeOptional(parsed.data.owner_name),
    owner_phone: normalizeOptional(parsed.data.owner_phone),
    owner_email: normalizeOptional(parsed.data.owner_email),
    pin_hash: pinHash,
  });
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe una casa con ese número.' };
    return { error: error.message };
  }

  revalidatePath('/houses');
  return { success: true };
}

export async function updateHouse(houseId: string, input: UpdateHouseInput): Promise<ActionResult> {
  const parsed = updateHouseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { error: authError, supabase } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  const patch: Record<string, unknown> = {
    house_number: parsed.data.house_number,
    house_name: normalizeOptional(parsed.data.house_name),
    owner_name: normalizeOptional(parsed.data.owner_name),
    owner_phone: normalizeOptional(parsed.data.owner_phone),
    owner_email: normalizeOptional(parsed.data.owner_email),
  };

  // Blank pin = keep current (updateHouseSchema treats it as optional/"").
  if (parsed.data.pin) {
    const { data: pinHash, error: hashError } = await supabase.rpc('condo_hash_pin', {
      p_pin: parsed.data.pin,
    });
    if (hashError || !pinHash) return { error: 'No se pudo procesar el PIN. Intenta de nuevo.' };
    patch.pin_hash = pinHash;
    // Resetting the PIN clears any lockout in progress — a fresh PIN deserves a clean slate.
    patch.failed_pin_attempts = 0;
    patch.pin_locked_until = null;
  }

  const { error } = await supabase.from('condo_houses').update(patch).eq('id', houseId);
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe una casa con ese número.' };
    return { error: error.message };
  }

  revalidatePath('/houses');
  return { success: true };
}

export async function deleteHouse(houseId: string): Promise<ActionResult> {
  const { error: authError, supabase } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_houses').delete().eq('id', houseId);
  if (error) {
    // FK from later phases' condo_installments/condo_payments (no cascade) —
    // surfaces as a clear message instead of a raw Postgres error.
    if (error.code === '23503') {
      return { error: 'No se puede eliminar: esta casa tiene cuotas o pagos registrados.' };
    }
    return { error: error.message };
  }

  revalidatePath('/houses');
  return { success: true };
}

export async function addResident(houseId: string, input: ResidentInput): Promise<ActionResult> {
  const parsed = residentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { error: authError, supabase } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_house_residents').insert({
    house_id: houseId,
    resident_name: parsed.data.resident_name,
    resident_phone: normalizeOptional(parsed.data.resident_phone),
  });
  if (error) return { error: error.message };

  revalidatePath('/houses');
  return { success: true };
}

export async function deleteResident(residentId: string): Promise<ActionResult> {
  const { error: authError, supabase } = await requireAdmin();
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_house_residents').delete().eq('id', residentId);
  if (error) return { error: error.message };

  revalidatePath('/houses');
  return { success: true };
}
