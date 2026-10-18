alter table public.transaction_sources
  add column installment_no integer,
  add column installment_count integer,
  add column original_purchase_date timestamptz,
  add constraint transaction_sources_installments_check check (
    (installment_no is null and installment_count is null and original_purchase_date is null)
    or (source_type='pluggy' and installment_no is not null and installment_count is not null and original_purchase_date is not null
      and installment_no between 1 and 120 and installment_count between 2 and 120 and installment_no <= installment_count)
  );
