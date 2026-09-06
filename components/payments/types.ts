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
  currency: Currency;
  paymentDate: string;
  createdAt: string;
  reference: string | null;
  totalAmount: number;
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
    batches.push({
      batchId,
      receiptNumber: first.receipt_number,
      houseId: first.house_id,
      houseLabel: house ? (house.house_name ? `${house.house_number} · ${house.house_name}` : house.house_number) : '—',
      currency: first.currency,
      paymentDate: first.payment_date,
      createdAt: first.created_at,
      reference: first.reference,
      // Safe to sum: every row in a batch shares one currency (enforced at
      // write time by registerPayment/sweepCreditForNewInstallments — never
      // mixed, per the never-sum-across-currencies rule).
      totalAmount: rows.reduce((sum, r) => sum + r.amount_paid, 0),
      installmentNames: rows.map((r) => r.condo_installments?.name ?? '—'),
      rows,
    });
  }
  return batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
