export type Currency = 'USD' | 'Bs' | 'USDT';
export type ReportStatus = 'pending' | 'confirmed' | 'rejected';

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
  condo_houses: { house_number: string; house_name: string | null } | null;
};

export type InstallmentLookup = Record<string, { name: string; due_date: string }>;
