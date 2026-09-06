import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getResidentSession } from '@/lib/auth/residentSession';

// Root route has no content of its own — just routes each visitor to the
// right place. Same session checks proxy.ts and the (admin)/(resident)
// layouts already use (getClaims() for admin, the signed resident cookie for
// residents), so this stays consistent instead of inventing a third check.
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect('/dashboard');

  const residentSession = await getResidentSession();
  if (residentSession) redirect('/mi-hogar');

  redirect('/login');
}
