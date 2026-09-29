-- A payment can now represent a pure wallet top-up (saldo a favor) with no
-- cuota selected -- the admin's "Registrar pago"/"Abonar a cartera" flow
-- needs to work for a house with nothing currently due, not only for one
-- with pending cuotas to allocate against.
alter table condo_payments alter column installment_id drop not null;
