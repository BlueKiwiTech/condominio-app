#!/usr/bin/env node
// scripts/seed-admin.mjs
//
// Creates the one hardcoded admin account via Supabase's Admin API (NOT a
// raw `insert into auth.users` -- that schema is owned by GoTrue and its
// internal shape changes between versions; hand-rolled inserts commonly
// break signInWithPassword in ways that are hard to diagnose). email_confirm
// skips the confirmation-email step entirely, so this works even before
// Supabase Auth email delivery is configured for this project.
//
// Also replicates lib/actions/auth.ts's linkAdminToCommunity() step, since
// that logic only runs inside the normal signup Server Action -- a user
// created here would otherwise never get linked to condo_communities.admin_id,
// and the app would have no admin-owned community row to scope anything to.
//
// Usage:
//   node --env-file=.env scripts/seed-admin.mjs admin@asobarcelona.com 123456
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env --
// same vars lib/supabase/service.ts uses, from your live project's own
// Settings > API page (not the CLI session in this dev environment, which
// isn't linked to it).
import { createClient } from '@supabase/supabase-js';

const [, , emailArg, passwordArg] = process.argv;
const email = emailArg ?? 'admin@asobarcelona.com';
const password = passwordArg ?? '123456';

if (password.length < 6) {
  console.error('Password must be at least 6 characters (Supabase Auth minimum).');
  process.exit(1);
}
if (password === '123456') {
  console.warn(
    'WARNING: this is a trivially guessable password. Fine to bootstrap with, ' +
      'but change it (Dashboard > Authentication > Users > this user > Reset password, ' +
      'or /forgot-password once logged in) before relying on this for anything real.'
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY -- run with ' +
      '`node --env-file=.env scripts/seed-admin.mjs` from the project root.'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`createUser failed: ${error.message}`);
    process.exit(1);
  }
  const userId = data.user.id;
  console.log(`Created auth user ${email} (${userId}).`);

  const { data: community } = await supabase
    .from('condo_communities')
    .select('id, admin_id')
    .limit(1)
    .maybeSingle();

  if (!community) {
    await supabase.from('condo_communities').insert({ name: 'ASOBARCELONA', admin_id: userId });
    console.log('Created condo_communities row linked to this admin.');
  } else if (!community.admin_id) {
    await supabase.from('condo_communities').update({ admin_id: userId }).eq('id', community.id);
    console.log('Linked existing condo_communities row to this admin.');
  } else if (community.admin_id !== userId) {
    console.warn(
      `condo_communities is already linked to a different admin_id (${community.admin_id}) -- left untouched.`
    );
  }

  console.log(`Done. Log in at /login with ${email} / the password you passed in.`);
}

main();
