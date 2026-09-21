// Wallet allocation ("Mi Cartera" — user decision, 2026-09-19/20): when an
// admin confirms a resident-reported payment, the amount is added to the
// house's wallet balance IN ITS OWN CURRENCY (no conversion at deposit
// time — Bs sitting in the wallet stays Bs until it's actually needed), then
// every outstanding due across the house, oldest-first, gets checked:
// full-or-nothing (no partial payments, unlike lib/payments/allocate.ts's
// admin-manual-payment allocator), drawing wallet currency in a FIXED
// priority order — Bs -> USDT -> USD — regardless of what currency the due
// itself is billed in ("Bs devalua rápido, así que se gasta primero";
// USD is held back as the most stable). Conversion between currencies only
// happens at the moment funds are actually used against a specific due,
// using whatever the exchange rate is AT THAT MOMENT (never the rate from
// when the money was originally deposited) — so unspent Bs/USDT credit
// re-values every time it's checked against a new due.
//
// Pure, no Supabase/next imports — same "pure lib / fetch+write in the
// Server Action" split as lib/payments/allocate.ts.
import { rateTypeForCurrency, isRateFresh, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';
import { sortOldestFirst } from './allocate';

export type WalletCurrency = 'USD' | 'Bs' | 'USDT';

/** Fixed draw priority, independent of the due's own currency (locked decision). */
export const WALLET_DRAW_PRIORITY: readonly WalletCurrency[] = ['Bs', 'USDT', 'USD'];

export type WalletBalances = Record<WalletCurrency, number>;

export type DueForWallet = {
  id: string;
  currency: WalletCurrency;
  amount: number;
  amount_paid: number;
  due_date: string;
  installment_number: number;
};

/** One currency actually drawn on to fund a due — null rate/type means same-currency, no conversion needed. */
export type FundingSource = {
  currency: WalletCurrency;
  /** Amount drawn, in `currency`'s own units. */
  amountDrawn: number;
  exchangeRate: number | null;
  exchangeRateType: ExchangeRateType | null;
};

export type WalletDuePayment = {
  installment_id: string;
  /** The due's own currency — always the full remaining balance, never a partial. */
  currency: WalletCurrency;
  amountApplied: number;
  sources: FundingSource[];
};

export type WalletAllocationResult =
  | { blocked: true; missingRateFor: Exclude<WalletCurrency, 'USD'> }
  | { blocked: false; payments: WalletDuePayment[]; updatedBalances: WalletBalances };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** USD-equivalent of `amount` in `currency` using a fresh (<24h) rate, or null if unavailable/stale. */
function toUsd(amount: number, currency: WalletCurrency, rates: Record<ExchangeRateType, ExchangeRateRow | null>): number | null {
  if (currency === 'USD') return amount;
  const rateType = rateTypeForCurrency(currency);
  if (!rateType) return null;
  const row = rates[rateType];
  if (!row || !isRateFresh(row.updated_at)) return null;
  return amount / row.rate;
}

function fromUsd(usdAmount: number, currency: WalletCurrency, rates: Record<ExchangeRateType, ExchangeRateRow | null>): number | null {
  if (currency === 'USD') return usdAmount;
  const rateType = rateTypeForCurrency(currency);
  if (!rateType) return null;
  const row = rates[rateType];
  if (!row || !isRateFresh(row.updated_at)) return null;
  return usdAmount * row.rate;
}

/** Converts `amount` from `from` to `to`, pivoting through USD (the system's one reference currency). */
function convert(
  amount: number,
  from: WalletCurrency,
  to: WalletCurrency,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
): number | null {
  if (from === to) return amount;
  const usd = toUsd(amount, from, rates);
  if (usd === null) return null;
  return fromUsd(usd, to, rates);
}

/**
 * Runs the wallet's oldest-first, full-or-nothing, priority-currency
 * allocation across `dues` (every outstanding due for the house, any
 * currency — NOT just admin-selected ones, unlike applyPaymentAllocation).
 * `startingBalances` should already include the newly reported amount
 * added to its own currency bucket — this function only ever draws funds
 * down, never adds them.
 *
 * Returns `blocked: true` if a currency the house actually holds a
 * balance in (and would need to convert) has no fresh rate — callers
 * should surface this as an error rather than silently skipping dues that
 * a moment's rate refresh would have covered.
 */
export function allocateWalletFunds(
  dues: DueForWallet[],
  startingBalances: WalletBalances,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
): WalletAllocationResult {
  const balances: WalletBalances = { ...startingBalances };
  const sorted = sortOldestFirst(dues);
  const payments: WalletDuePayment[] = [];

  for (const due of sorted) {
    const remaining = round2(due.amount - due.amount_paid);
    if (remaining <= 0) continue;

    let stillNeeded = remaining;
    const plan: FundingSource[] = [];
    const trialBalances: WalletBalances = { ...balances };
    let blockedCurrency: Exclude<WalletCurrency, 'USD'> | null = null;

    for (const sourceCurrency of WALLET_DRAW_PRIORITY) {
      if (stillNeeded <= 0) break;
      const available = trialBalances[sourceCurrency];
      if (available <= 0) continue;

      const neededInSource = convert(stillNeeded, due.currency, sourceCurrency, rates);
      if (neededInSource === null) {
        // A rate is missing/stale for a currency the house DOES hold
        // balance in and would need converted -- flag it, but keep
        // checking other currencies in case they alone are enough.
        if (sourceCurrency !== 'USD') blockedCurrency = sourceCurrency;
        continue;
      }

      const amountDrawn = round2(Math.min(available, neededInSource));
      if (amountDrawn <= 0) continue;

      const fullySpent = amountDrawn >= round2(neededInSource);
      const appliedInDueCurrency = fullySpent ? stillNeeded : round2((amountDrawn / neededInSource) * stillNeeded);

      const rateType = sourceCurrency === due.currency ? null : rateTypeForCurrency(sourceCurrency);
      plan.push({
        currency: sourceCurrency,
        amountDrawn,
        exchangeRate: rateType ? (rates[rateType]?.rate ?? null) : null,
        exchangeRateType: rateType,
      });
      trialBalances[sourceCurrency] = round2(available - amountDrawn);
      stillNeeded = round2(stillNeeded - appliedInDueCurrency);
    }

    if (stillNeeded > 0) {
      // Full-or-nothing: leave this due (and every currency bucket) exactly
      // as it was if it can't be covered completely.
      if (blockedCurrency) return { blocked: true, missingRateFor: blockedCurrency };
      continue;
    }

    for (const source of plan) {
      balances[source.currency] = round2(balances[source.currency] - source.amountDrawn);
    }
    payments.push({ installment_id: due.id, currency: due.currency, amountApplied: remaining, sources: plan });
  }

  return { blocked: false, payments, updatedBalances: balances };
}
