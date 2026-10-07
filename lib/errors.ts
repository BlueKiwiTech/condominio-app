import { getTranslations } from 'next-intl/server';

const FALLBACK_ES: Record<string, string> = {
  duplicate: 'Ya existe un registro con esos datos.',
  inUse: 'No se puede completar porque este registro está relacionado con otros datos.',
  invalidData: 'Alguno de los datos ingresados no es válido. Revísalos e intenta de nuevo.',
  forbidden: 'No tienes permiso para realizar esta acción.',
  tooManyRequests: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  generic: 'Ocurrió un error inesperado. Intenta de nuevo; si persiste, contacta al administrador.',
};

type DbErrorLike = { message?: string; code?: string; status?: number } | null | undefined;

/**
 * Turns a raw Supabase/PostgREST/Postgres error into a message that is safe
 * and understandable to show an admin or resident (2026-10-06 user request:
 * errors must be friendly, not raw database text like "duplicate key value
 * violates unique constraint ..."). The raw error is logged server-side so
 * nothing is lost for debugging. Uses the request's own locale (next-intl),
 * so callers don't need to thread a translator through.
 */
export async function friendlyError(error: DbErrorLike, context?: string): Promise<string> {
  console.error(`[db-error]${context ? ` ${context}` : ''}`, error);
  // Cron/background callers (e.g. app/api/cron/*) run outside a request, so
  // next-intl has no locale to resolve -- fall back to Spanish text instead
  // of throwing from inside an error path.
  let t: (key: string) => string;
  try {
    t = (await getTranslations('common.dbErrors')) as unknown as (key: string) => string;
  } catch {
    t = (key) => FALLBACK_ES[key] ?? FALLBACK_ES.generic;
  }
  const code = error?.code ?? '';
  if (code === '23505') return t('duplicate');
  if (code === '23503') return t('inUse');
  if (code === '23502' || code === '23514' || code === '22P02' || code === '22007' || code === '22008') return t('invalidData');
  if (code === '42501' || code === 'PGRST301') return t('forbidden');
  if (error?.status === 429) return t('tooManyRequests');
  return t('generic');
}
