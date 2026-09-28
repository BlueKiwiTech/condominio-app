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

export type PaymentRow = {
  id: string;
  house_id: string;
  installment_id: string;
  payment_batch_id: string | null;
  amount_paid: number;
  currency: Currency;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  receipt_number: number | null;
  created_at: string;
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
    for (const r of rows) {
      const cents = (totalsByCurrency[r.currency] ?? 0) * 100 + Math.round(r.amount_paid * 100);
      totalsByCurrency[r.currency] = cents / 100;
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
      installmentNames: rows.map((r) => r.condo_installments?.name ?? '—'),
      rows,
    });
  }
  return batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
