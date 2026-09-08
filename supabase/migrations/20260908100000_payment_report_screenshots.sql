-- Screenshot proof for resident payment reports (follow-up to
-- 20260908090000_resident_payment_reports.sql). Residents typically pay via
-- a bank transfer app that hands back a receipt screenshot -- attaching it
-- gives the admin something concrete to verify against their own bank
-- statement, instead of just a typed amount/reference.
alter table condo_payment_reports
  add column screenshot_path text;

-- Private bucket -- these screenshots show bank account numbers, ID
-- numbers, phone numbers. No storage.objects RLS policy is added for it:
-- every access is through the service-role client (residents uploading via
-- lib/actions/residentPayments.ts, admins viewing via a signed URL from
-- lib/actions/paymentReports.ts), which bypasses RLS entirely -- same
-- Pattern A rationale as every other resident-adjacent table in this app.
-- Deny-by-default already blocks direct anon/authenticated access without
-- needing an explicit policy.
insert into storage.buckets (id, name, public)
values ('payment-report-screenshots', 'payment-report-screenshots', false)
on conflict (id) do nothing;
