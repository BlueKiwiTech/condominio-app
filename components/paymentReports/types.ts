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
  condo_houses: { house_number: string; house_name: string | null } | null;
};

export type InstallmentLookup = Record<string, { name: string; due_date: string }>;
