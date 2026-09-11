import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Best-effort write to condo_audit_logs. Never throws -- a failed audit
 * write must not roll back or block the mutation it's describing.
 */
export async function logAudit(
  supabase: SupabaseClient,
  entry: { userId: string | null; action: string; entityType: string; entityId: string },
) {
  const { error } = await supabase.from('condo_audit_logs').insert({
    user_id: entry.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
  });
  if (error) {
    console.error(`[audit] failed to log ${entry.action} ${entry.entityType}:${entry.entityId}`, error.message);
  }
}
