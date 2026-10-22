export type Currency = 'USD' | 'Bs' | 'USDT';
export type ReportStatus = 'pending' | 'on_hold' | 'confirmed' | 'rejected';

export type PaymentReportRow = {
  id: string;
  house_id: string;
  amount: number;
  currency: Currency;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  installment_ids: string[];
  status: ReportStatus;
  screenshot_path: string | null;
  created_at: string;
  // Set only once confirmPaymentReport (lib/actions/paymentReports.ts)
  // successfully auto-registers the real payment -- null for pending/
  // rejected reports, and for a confirmed report submitted with zero tagged
  // cuotas (nothing to allocate against, falls back to a plain status flag).
  resulting_payment_batch_id: string | null;
  resulting_receipt_number: number | null;
  rejection_reason: string | null;
  condo_houses: { house_number: string; house_name: string | null } | null;
};

/** A pending special cuota of a house, offered in the confirm dialog (change ajustes-21-oct). */
export type SpecialInstallment = {
  id: string;
  house_id: string;
  name: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  currency: Currency;
};

export type InstallmentLookup = Record<string, { name: string; due_date: string }>;
