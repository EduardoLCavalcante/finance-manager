alter table public.purchases
  drop constraint purchases_status_check,
  add constraint purchases_status_check check (status in ('pending','confirmed','historical','skipped'));

-- shortcut: a personal ledger is loaded as one aggregate; paginate reads and commit only changed rows when data volume warrants it.
create or replace function public.finance_commit(expected_revision integer, state jsonb) returns integer language plpgsql security invoker set search_path = '' as $$
declare current_revision integer; mapping record; updates text; rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.finance_revisions(user_id,revision) values(auth.uid(),0) on conflict do nothing;
  select revision into current_revision from public.finance_revisions where user_id=auth.uid() for update;
  if current_revision <> expected_revision then raise exception 'FINANCE_CONFLICT' using errcode='40001'; end if;
  for mapping in select * from (values ('cards','cards'),('people','people'),('categories','categories'),('purchases','purchases'),('invoices','invoices'),('bank_entries','bank_entries'),('allocations','expense_allocations'),('refunds','refunds'),('charges','card_charges'),('refund_allocations','refund_allocations'),('reimbursements','reimbursements'),('reimbursement_allocations','reimbursement_allocations'),('imports','import_files'),('sources','transaction_sources'),('audit','audit_logs')) as m(key,tab) loop
    select coalesce(jsonb_agg(value || jsonb_build_object('user_id',auth.uid())),'[]'::jsonb) into rows from jsonb_array_elements(state->mapping.key);
    select string_agg(format('%I=excluded.%I',attname,attname),',') into updates from pg_catalog.pg_attribute where attrelid=format('public.%I',mapping.tab)::regclass and attnum>0 and not attisdropped and attname not in ('id','user_id');
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1) on conflict(id) do update set %s where %I.user_id=auth.uid()',mapping.tab,mapping.tab,updates,mapping.tab) using rows;
  end loop;
  if exists(select 1 from public.purchases p where p.user_id=auth.uid() and (
    (p.status='confirmed' and p.amount <> coalesce((select sum(a.amount) from public.expense_allocations a where a.purchase_id=p.id and a.user_id=p.user_id),0)) or
    (p.status in ('pending','historical','skipped') and exists(select 1 from public.expense_allocations a where a.purchase_id=p.id and a.user_id=p.user_id)) or
    p.amount <> coalesce((select sum(c.amount) from public.card_charges c where c.purchase_id=p.id and c.user_id=p.user_id and c.kind='purchase'),0) or
    p.installments <> (select count(*) from public.card_charges c where c.purchase_id=p.id and c.user_id=p.user_id and c.kind='purchase') or
    p.amount < coalesce((select sum(r.amount) from public.refunds r where r.purchase_id=p.id and r.user_id=p.user_id),0)
  )) then raise exception 'Invalid purchase totals'; end if;
  if exists(select 1 from public.bank_entries e join public.invoices i on i.id=e.invoice_id where e.user_id=auth.uid() and e.card_id<>i.card_id) then raise exception 'Invalid bank entry invoice'; end if;
  if exists(select 1 from public.card_charges c join public.purchases p on p.id=c.purchase_id join public.invoices i on i.id=c.invoice_id where c.user_id=auth.uid() and (p.card_id<>i.card_id or c.installment_no>p.installments)) then raise exception 'Invalid charge'; end if;
  if exists(select 1 from public.refunds r where r.user_id=auth.uid() and (
    r.amount <> coalesce((select sum(a.amount) from public.refund_allocations a where a.refund_id=r.id and a.user_id=r.user_id),0) or
    -r.amount <> coalesce((select sum(c.amount) from public.card_charges c where c.refund_id=r.id and c.user_id=r.user_id),0)
  )) then raise exception 'Invalid refund totals'; end if;
  if exists(select 1 from public.refund_allocations a join public.refunds r on r.id=a.refund_id join public.expense_allocations e on e.id=a.allocation_id where a.user_id=auth.uid() and r.purchase_id<>e.purchase_id) then raise exception 'Invalid refund allocation'; end if;
  if exists(select 1 from public.reimbursements r where r.user_id=auth.uid() and r.amount <> coalesce((select sum(a.amount) from public.reimbursement_allocations a where a.reimbursement_id=r.id and a.user_id=r.user_id),0)) then raise exception 'Invalid reimbursement totals'; end if;
  if exists(select 1 from public.reimbursement_allocations a join public.reimbursements r on r.id=a.reimbursement_id join public.expense_allocations e on e.id=a.allocation_id join public.people p on p.id=e.person_id where a.user_id=auth.uid() and (r.person_id<>e.person_id or p.is_owner)) then raise exception 'Invalid reimbursement allocation'; end if;
  if exists(select 1 from public.expense_allocations e where e.user_id=auth.uid() and (e.amount < coalesce((select sum(a.amount) from public.refund_allocations a where a.allocation_id=e.id and a.user_id=e.user_id),0) or e.amount < coalesce((select sum(a.amount) from public.reimbursement_allocations a where a.allocation_id=e.id and a.user_id=e.user_id),0))) then raise exception 'Allocation exceeded'; end if;
  update public.finance_revisions set revision=current_revision+1 where user_id=auth.uid();
  return current_revision+1;
end $$;
revoke all on function public.finance_commit(integer,jsonb) from public,anon;
grant execute on function public.finance_commit(integer,jsonb) to authenticated;
