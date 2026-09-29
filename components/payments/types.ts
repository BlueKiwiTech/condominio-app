import type { Currency, InstallmentType, Cadence } from '@/components/cuotas/types';
import type { InstallmentStatus } from '@/lib/cuotas/status';

export type { Currency, InstallmentType, Cadence };

export type HouseOption = {
  id: string;
  house_number: string;
  house_name: string | null;
  owner_name: string | null;
};

export type PendingInstallment = {
  id: string;
  house_id: string;
  name: string;
  amount: number;
  amount_paid: number;
  currency: Currency;
  due_date: string;
  status: InstallmentStatus;
  installment_number: number;
};

export type HouseCredit = {
  house_id: string;
  currency: Currency;
  balance: number;
};

export type FundingSourceEntry = {
  currency: Currency;
  /** Amount actually drawn from the RECEIVED payment/wallet, in `currency`'s own units. */
  amountDrawn: number;
  exchangeRate: number | null;
  exchangeRateType: string | null;
};

export type PaymentRow = {
  id: string;
  house_id: string;
  // null for a pure wallet top-up (no cuota selected/available to apply it
  // to) -- see lib/payments/applyAllocation.ts.
  installment_id: string | null;
  payment_batch_id: string | null;
  amount_paid: number;
  currency: Currency;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  receipt_number: number | null;
  created_at: string;
  // Present only when this row's currency differs from what was actually
  // received (a cross-currency allocation, lib/payments/allocate.ts's
  // allocateFunds) -- what was actually drawn from the payment/wallet, and
  // at what rate, since `currency`/`amount_paid` above are the INSTALLMENT's
  // own denomination, not the received one (see groupPaymentsByBatch's
  // receivedByCurrency).
  funding_breakdown: FundingSourceEntry[] | null;
  condo_houses: { house_number: string; house_name: string | null } | null;
  condo_installments: { name: string; due_date: string } | null;
};

export type PaymentBatch = {
  batchId: string;
  receiptNumber: number | null;
  houseId: string;
  houseLabel: string;
  paymentDate: string;
  createdAt: string;
  reference: string | null;
  /**
   * One total per currency, never a single summed number -- a batch's rows
   * are NOT guaranteed to share one currency: registerPayment/
   * sweepCreditForNewInstallments always write single-currency batches, but
   * confirmPaymentReport's wallet ("Mi Cartera") path can settle overdue
   * dues billed in different currencies from one wallet top-up under the
   * same payment_batch_id. Render one line per currency present here.
   */
  totalsByCurrency: Partial<Record<Currency, number>>;
  /**
   * What was actually received/drawn, per currency -- as opposed to
   * `totalsByCurrency`, which sums each row's own (installment) currency.
   * The two only diverge when a cross-currency allocation happened: e.g. a
   * $100 payment covering both Bs and USD cuotas shows `totalsByCurrency` as
   * {Bs: 320, USD: 99.62} (what got applied, in each cuota's own currency --
   * the 320 Bs was actually funded out of a chunk of that same $100) but
   * `receivedByCurrency` as {USD: 100} (what was actually handed over).
   * Showing only the per-cuota breakdown, with no indication a single $100
   * payment produced it, reads as confusing ("did we receive 320 Bs AND
   * $99.62?") -- the payment detail page renders receivedByCurrency first,
   * above the breakdown (2026-09-29 fix, user feedback).
   */
  receivedByCurrency: Partial<Record<Currency, number>>;
  installmentNames: string[];
  rows: PaymentRow[];
};

export function groupPaymentsByBatch(payments: PaymentRow[]): PaymentBatch[] {
  const byBatch = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    const key = p.payment_batch_id ?? p.id;
    const list = byBatch.get(key) ?? [];
    list.push(p);
    byBatch.set(key, list);
  }
  const batches: PaymentBatch[] = [];
  for (const [batchId, rows] of byBatch) {
    const first = rows[0];
    const house = first.condo_houses;
    // Cent-based summation per currency (never a single cross-currency sum
    // -- see the PaymentBatch.totalsByCurrency comment).
    const totalsByCurrency: Partial<Record<Currency, number>> = {};
    const receivedByCurrency: Partial<Record<Currency, number>> = {};
    const addCents = (bucket: Partial<Record<Currency, number>>, currency: Currency, amount: number) => {
      const cents = (bucket[currency] ?? 0) * 100 + Math.round(amount * 100);
      bucket[currency] = cents / 100;
    };
    for (const r of rows) {
      addCents(totalsByCurrency, r.currency, r.amount_paid);
      // A cross-currency row's funding_breakdown holds what was actually
      // drawn (currency + amountDrawn) -- everything else (same-currency
      // allocations, the leftover/wallet-topup row) is already denominated
      // in the received currency, so its own currency/amount_paid IS the
      // received portion (see PaymentBatch.receivedByCurrency).
      if (r.funding_breakdown && r.funding_breakdown.length > 0) {
        for (const source of r.funding_breakdown) addCents(receivedByCurrency, source.currency, source.amountDrawn);
      } else {
        addCents(receivedByCurrency, r.currency, r.amount_paid);
      }
    }

    batches.push({
      batchId,
      receiptNumber: first.receipt_number,
      houseId: first.house_id,
      houseLabel: house ? (house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number) : '—',
      paymentDate: first.payment_date,
      createdAt: first.created_at,
      reference: first.reference,
      totalsByCurrency,
      receivedByCurrency,
      // A wallet-only row (installment_id null) isn't a cuota name -- excluded
      // here so callers can tell "N cuotas covered" apart from "pure wallet
      // top-up" (see PaymentsPageClient's use of this list's length).
      installmentNames: rows.filter((r) => r.installment_id !== null).map((r) => r.condo_installments?.name ?? '—'),
      rows,
    });
  }
  return batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
