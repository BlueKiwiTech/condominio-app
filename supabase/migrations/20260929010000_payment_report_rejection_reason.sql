-- Rejecting a resident-submitted payment report today only flips its status
-- to 'rejected' with no way for the resident to see why -- Josi wants the
-- admin able to leave a note the resident sees in the app (2026-09-29
-- business rule, relayed via voice notes).
alter table condo_payment_reports add column rejection_reason text;
