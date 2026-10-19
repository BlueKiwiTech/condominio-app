// A Supabase client for server-side code that must work both from an admin
// session (cookie-based, RLS applies) and from the service role (no session --
// e.g. releasing held payments right after the rates cron). Type-only.
import type { createClient } from '@/lib/supabase/server';
import type { createServiceClient } from '@/lib/supabase/service';

export type DbClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceClient>;
