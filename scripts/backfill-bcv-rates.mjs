#!/usr/bin/env node
// scripts/backfill-bcv-rates.mjs
//
// Backfills condo_exchange_rates (rate_type 'bcv') for past days from a BCV
// history CSV (scripts/data/bcv-usd-2026.csv, columns yyyymmdd,valor_dolar).
// Needed because Cotizave's free plan only keeps 14 days of history and the
// table only started being filled by the cron on 2026-09-08. BCV only --
// the CSV has no Binance/USDT series.
//
// CSV semantics (verified against the cron's own rows for 2026-09-09..10-02):
// the date is the day BCV PUBLISHED the value, and it takes effect the next
// business day (a Friday's value applies from Monday; Sat/Sun keep Thursday's).
// So for each calendar day D this inserts the value of the latest publication
// whose effective day is <= D -- one row per calendar day, weekends included,
// same as the daily cron, so getExchangeRatesAsOf/isRateFresh (24h) always
// find a row for any payment date.
//
// Each row is stamped 04:00Z on its day (00:00 VET, the same convention as
// Cotizave's own `updated_at` for the BCV rate), source 'admin'. Days that
// already have a bcv row on that UTC date are skipped, so re-running is safe.
//
// Usage (dry run by default; --apply actually inserts):
//   node --env-file=.env scripts/backfill-bcv-rates.mjs [--from 2026-09-01] [--to 2026-09-08] [--apply]
//
// Defaults cover 2026-09-01..2026-09-08, the days before the cron's first row.
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the LIVE
// project when run with .env -- check the dry-run output first).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const apply = args.includes('--apply');
const from = flag('from', '2026-09-01');
const to = flag('to', '2026-09-08');
for (const d of [from, to]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error(`Bad date "${d}" -- expected YYYY-MM-DD.`);
    process.exit(1);
  }
}

// UTC-noon Dates so day arithmetic/getUTCDay never shifts across a boundary.
const toDate = (iso) => new Date(`${iso}T12:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
const isWeekend = (iso) => [0, 6].includes(toDate(iso).getUTCDay());
const nextBusinessDay = (iso) => {
  let d = addDays(iso, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
};

const csvPath = fileURLToPath(new URL('./data/bcv-usd-2026.csv', import.meta.url));
const published = readFileSync(csvPath, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [ymd, value] = line.split(',');
    const published = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    return { effective: nextBusinessDay(published), rate: Number(value) };
  })
  .sort((a, b) => a.effective.localeCompare(b.effective));

const rows = [];
for (let day = from; day <= to; day = addDays(day, 1)) {
  const match = published.filter((p) => p.effective <= day).at(-1);
  if (!match) {
    console.warn(`${day}: no CSV value in effect yet, skipping`);
    continue;
  }
  rows.push({ day, rate: match.rate });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY -- run with `node --env-file=.env ...`.');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing, error: readError } = await supabase
  .from('condo_exchange_rates')
  .select('updated_at')
  .eq('rate_type', 'bcv')
  .gte('updated_at', `${from}T00:00:00Z`)
  .lt('updated_at', `${addDays(to, 1)}T00:00:00Z`);
if (readError) {
  console.error('Could not read existing rates:', readError.message);
  process.exit(1);
}
const haveDays = new Set(existing.map((r) => r.updated_at.slice(0, 10)));

const toInsert = [];
for (const { day, rate } of rows) {
  const skip = haveDays.has(day);
  console.log(`${day}  bcv ${rate}  ${skip ? 'SKIP (already has a row)' : 'insert'}`);
  if (!skip) toInsert.push({ rate_type: 'bcv', rate, source: 'admin', updated_at: `${day}T04:00:00Z` });
}

if (!apply) {
  console.log(`\nDry run: ${toInsert.length} row(s) would be inserted. Re-run with --apply to write them.`);
  process.exit(0);
}
if (toInsert.length === 0) {
  console.log('\nNothing to insert.');
  process.exit(0);
}
const { error } = await supabase.from('condo_exchange_rates').insert(toInsert);
if (error) {
  console.error('Insert failed:', error.message);
  process.exit(1);
}
console.log(`\nInserted ${toInsert.length} row(s).`);
