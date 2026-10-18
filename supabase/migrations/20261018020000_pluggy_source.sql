-- Expand transaction source provenance without changing finance_snapshot or finance_commit.
alter table public.transaction_sources
  drop constraint if exists transaction_sources_source_type_check;
alter table public.transaction_sources
  add constraint transaction_sources_source_type_check
  check (source_type in ('manual','csv','pluggy'));
