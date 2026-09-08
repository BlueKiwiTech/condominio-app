import { createServiceClient } from '@/lib/supabase/service';
import type { ExchangeRateType } from '@/lib/exchangeRate';

// Vercel Cron hits this once a day at 23:00 VET (vercel.json: "0 3 * * *",
// UTC -- Venezuela has no DST, always UTC-4). Sources both reference rates
// from cotizave.com's aggregator API in one call, chosen over scraping
// bcv.org.ve and Binance's own P2P endpoint directly: BCV's page is stable
// enough to scrape, but Binance's P2P endpoint is undocumented/unofficial
// and known to be unstable (see chat history) -- cotizave.com already
// solves that scraping problem, so one reliable call replaces two fragile
// ones. Admin can also set either rate manually (lib/actions/
// exchangeRate.ts) -- both write to the same append-only
// condo_exchange_rates table, just with a different `source`.
//
// Not `export const runtime = 'edge'` -- default Node.js (Fluid Compute)
// is correct here per Vercel's own current guidance; there's nothing
// edge-specific about one outbound fetch + a Supabase insert, and Node
// keeps this on the same runtime as every other Server Action/service-role
// write in the app.
export const dynamic = 'force-dynamic';

type CotizaveRate = {
  market: string;
  type: string;
  mid: number;
  updated_at: string;
};

type CotizaveResponse = { rates: CotizaveRate[] };

async function insertRate(
  service: ReturnType<typeof createServiceClient>,
  rateType: ExchangeRateType,
  rate: number,
): Promise<{ error: string | null }> {
  const { error } = await service.from('condo_exchange_rates').insert({ rate_type: rateType, rate, source: 'cron' });
  return { error: error?.message ?? null };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = process.env.COTIZAVE_API_KEY;
  if (!apiKey) {
    return Response.json({ success: false, error: 'COTIZAVE_API_KEY is not set' }, { status: 500 });
  }

  let payload: CotizaveResponse;
  try {
    const res = await fetch('https://api.cotizave.com/v1/fx/rates', {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`cotizave.com responded ${res.status}`);
    payload = await res.json();
  } catch (err) {
    console.error('[cron/exchange-rate] fetch failed:', err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 502 });
  }

  const bcvRate = payload.rates?.find((r) => r.market === 'reference')?.mid;
  const binanceRate = payload.rates?.find((r) => r.market === 'binance')?.mid;

  const service = createServiceClient();
  const results: Record<string, string> = {};

  // Each rate is inserted independently -- a malformed/missing field for
  // one (e.g. cotizave.com renames a market key) shouldn't block updating
  // the other.
  if (typeof bcvRate === 'number' && bcvRate > 0) {
    const { error } = await insertRate(service, 'bcv', bcvRate);
    results.bcv = error ? `error: ${error}` : `ok: ${bcvRate}`;
  } else {
    results.bcv = 'skipped: missing or invalid "reference" market in response';
  }

  if (typeof binanceRate === 'number' && binanceRate > 0) {
    const { error } = await insertRate(service, 'binance', binanceRate);
    results.binance = error ? `error: ${error}` : `ok: ${binanceRate}`;
  } else {
    results.binance = 'skipped: missing or invalid "binance" market in response';
  }

  const hadFailure = Object.values(results).some((v) => !v.startsWith('ok'));
  if (hadFailure) console.error('[cron/exchange-rate] partial failure:', results);

  return Response.json({ success: !hadFailure, results });
}
