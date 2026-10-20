// Validates the special cuotas the admin picked on the payment form (change
// abono-a-cuotas-especiales). The client never decides what counts as special:
// every id is re-read here with its template. Plain module (no 'use server').
import type { DbClient } from '@/lib/supabase/dbClient';

/**
 * True when every id is a live (not deleted) cuota of `houseId`, still
 * `pending` or `partial`, whose template is `special`. Duplicated ids and
 * ids that don't exist make it false. An empty list is not a selection and is
 * valid (the caller falls back to the normal flow).
 */
export async function validateSpecialSelection(
  db: DbClient,
  houseId: string,
  ids: string[],
): Promise<{ ok: true } | { ok: false }> {
  if (ids.length === 0) return { ok: true };
  const unique = Array.from(new Set(ids));
  if (unique.length !== ids.length) return { ok: false };

  const { data, error } = await db
    .from('condo_installments')
    .select('id, house_id, status, deleted_at, condo_installment_templates!inner(installment_type)')
    .in('id', unique);
  if (error || !data || data.length !== unique.length) return { ok: false };

  for (const row of data as unknown as Array<{
    house_id: string;
    status: string;
    deleted_at: string | null;
    condo_installment_templates: { installment_type: string } | { installment_type: string }[] | null;
  }>) {
    const template = Array.isArray(row.condo_installment_templates)
      ? row.condo_installment_templates[0]
      : row.condo_installment_templates;
    if (
      row.house_id !== houseId ||
      row.deleted_at !== null ||
      (row.status !== 'pending' && row.status !== 'partial') ||
      template?.installment_type !== 'special'
    ) {
      return { ok: false };
    }
  }
  return { ok: true };
}
