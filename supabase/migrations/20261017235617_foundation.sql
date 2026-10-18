create table public.institutions (id text primary key, name text not null);
insert into public.institutions values ('nubank','Nubank'),('inter','Inter'),('mercado-pago','Mercado Pago');
alter table public.institutions enable row level security;
create policy institutions_read on public.institutions for select to authenticated using (true);
grant select on public.institutions to authenticated;

create table public.finance_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0)
);
create table public.cards (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution_id text not null references public.institutions(id), name text not null check (length(name) between 1 and 160),
  last_four text not null check (last_four ~ '^\d{4}$'), closing_day integer not null check (closing_day between 1 and 31),
  due_day integer not null check (due_day between 1 and 31), unique(id,user_id)
);
create table public.people (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 160), is_owner boolean not null default false, unique(id,user_id)
);
create unique index one_owner_per_user on public.people(user_id) where is_owner;
create table public.categories (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 160), unique(id,user_id)
);
create table public.purchases (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null, merchant text not null check (length(merchant) between 1 and 160), purchase_date date not null,
  amount bigint not null check (amount between 1 and 999999999999), installments integer not null check (installments between 1 and 120),
  category_id uuid, status text not null check (status in ('pending','confirmed')), unique(id,user_id),
  foreign key (card_id,user_id) references public.cards(id,user_id), foreign key (category_id,user_id) references public.categories(id,user_id)
);
create table public.invoices (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null, month text not null check (month ~ '^20\d{2}-(0[1-9]|1[0-2])$'), closing_date date not null, due_date date not null,
  statement_total bigint check (abs(statement_total) <= 999999999999), paid_at date,
  unique(id,user_id), unique(user_id,card_id,month), foreign key (card_id,user_id) references public.cards(id,user_id)
);
create table public.expense_allocations (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_id uuid not null, person_id uuid not null, amount bigint not null check (amount between 1 and 999999999999),
  unique(id,user_id), unique(user_id,purchase_id,person_id),
  foreign key (purchase_id,user_id) references public.purchases(id,user_id), foreign key (person_id,user_id) references public.people(id,user_id)
);
create table public.refunds (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_id uuid not null, amount bigint not null check (amount between 1 and 999999999999), received_at date not null, reason text not null,
  unique(id,user_id), foreign key (purchase_id,user_id) references public.purchases(id,user_id)
);
create table public.card_charges (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_id uuid not null, invoice_id uuid not null, amount bigint not null check (amount <> 0 and abs(amount) <= 999999999999),
  installment_no integer not null, kind text not null check (kind in ('purchase','refund')), refund_id uuid,
  unique(id,user_id), foreign key (purchase_id,user_id) references public.purchases(id,user_id),
  foreign key (invoice_id,user_id) references public.invoices(id,user_id), foreign key (refund_id,user_id) references public.refunds(id,user_id),
  check ((kind='purchase' and amount > 0 and installment_no between 1 and 120 and refund_id is null) or (kind='refund' and amount < 0 and installment_no=0 and refund_id is not null))
);
create unique index unique_installment on public.card_charges(user_id,purchase_id,installment_no) where kind='purchase';
create unique index unique_refund_charge on public.card_charges(user_id,refund_id) where kind='refund';
create table public.refund_allocations (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  refund_id uuid not null, allocation_id uuid not null, amount bigint not null check (amount > 0), unique(id,user_id),
  unique(user_id,refund_id,allocation_id), foreign key (refund_id,user_id) references public.refunds(id,user_id),
  foreign key (allocation_id,user_id) references public.expense_allocations(id,user_id)
);
create table public.reimbursements (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null, amount bigint not null check (amount between 1 and 999999999999), received_at date not null, note text not null default '',
  unique(id,user_id), foreign key (person_id,user_id) references public.people(id,user_id)
);
create table public.reimbursement_allocations (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reimbursement_id uuid not null, allocation_id uuid not null, amount bigint not null check (amount > 0), unique(id,user_id),
  unique(user_id,reimbursement_id,allocation_id), foreign key (reimbursement_id,user_id) references public.reimbursements(id,user_id),
  foreign key (allocation_id,user_id) references public.expense_allocations(id,user_id)
);
create table public.import_files (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null, hash text not null check (hash ~ '^[a-f0-9]{64}$'), name text not null, created_at timestamptz not null,
  row_count integer not null check (row_count > 0), unique(id,user_id), unique(user_id,card_id,hash),
  foreign key (card_id,user_id) references public.cards(id,user_id)
);
create table public.transaction_sources (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_id uuid not null, card_id uuid not null, source_type text not null check (source_type in ('manual','csv')), external_id text not null, import_id uuid,
  unique(id,user_id), unique(user_id,card_id,source_type,external_id),
  foreign key (purchase_id,user_id) references public.purchases(id,user_id), foreign key (card_id,user_id) references public.cards(id,user_id),
  foreign key (import_id,user_id) references public.import_files(id,user_id)
);
create table public.audit_logs (
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null, created_at timestamptz not null, unique(id,user_id)
);

do $$ declare t text; begin
  foreach t in array array['finance_revisions','cards','people','categories','purchases','invoices','expense_allocations','refunds','card_charges','refund_allocations','reimbursements','reimbursement_allocations','import_files','transaction_sources','audit_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
    execute format('grant select, insert, update on public.%I to authenticated',t);
    if t <> 'finance_revisions' then execute format('create index %I on public.%I(user_id)',t || '_owner_idx',t); end if;
  end loop;
end $$;
create index purchases_card_idx on public.purchases(card_id,user_id);
create index purchases_category_idx on public.purchases(category_id,user_id);
create index purchases_date_idx on public.purchases(user_id,purchase_date);
create index invoices_card_idx on public.invoices(card_id,user_id);
create index allocations_purchase_idx on public.expense_allocations(purchase_id,user_id);
create index allocations_person_idx on public.expense_allocations(person_id,user_id);
create index charges_purchase_idx on public.card_charges(purchase_id,user_id);
create index charges_invoice_idx on public.card_charges(invoice_id,user_id);
create index charges_refund_idx on public.card_charges(refund_id,user_id);
create index refunds_purchase_idx on public.refunds(purchase_id,user_id);
create index refund_allocations_refund_idx on public.refund_allocations(refund_id,user_id);
create index refund_allocations_allocation_idx on public.refund_allocations(allocation_id,user_id);
create index reimbursements_person_idx on public.reimbursements(person_id,user_id);
create index reimbursement_allocations_payment_idx on public.reimbursement_allocations(reimbursement_id,user_id);
create index reimbursement_allocations_allocation_idx on public.reimbursement_allocations(allocation_id,user_id);
create index imports_card_idx on public.import_files(card_id,user_id);
create index sources_purchase_idx on public.transaction_sources(purchase_id,user_id);
create index sources_card_idx on public.transaction_sources(card_id,user_id);
create index sources_import_idx on public.transaction_sources(import_id,user_id);

create function public.finance_snapshot() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; mapping record; rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object('revision',coalesce((select revision from public.finance_revisions where user_id=auth.uid()),0)) into result;
  for mapping in select * from (values ('cards','cards'),('people','people'),('categories','categories'),('purchases','purchases'),('invoices','invoices'),('allocations','expense_allocations'),('refunds','refunds'),('charges','card_charges'),('refund_allocations','refund_allocations'),('reimbursements','reimbursements'),('reimbursement_allocations','reimbursement_allocations'),('imports','import_files'),('sources','transaction_sources'),('audit','audit_logs')) as m(key,tab) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)-''user_id'' order by id),''[]''::jsonb) from public.%I t where user_id=auth.uid()',mapping.tab) into rows;
    result := result || jsonb_build_object(mapping.key,rows);
  end loop;
  return result;
end $$;

-- shortcut: a personal ledger is loaded as one aggregate; paginate reads and commit only changed rows when data volume warrants it.
create function public.finance_commit(expected_revision integer, state jsonb) returns integer language plpgsql security invoker set search_path = '' as $$
declare current_revision integer; mapping record; updates text; rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.finance_revisions(user_id,revision) values(auth.uid(),0) on conflict do nothing;
  select revision into current_revision from public.finance_revisions where user_id=auth.uid() for update;
  if current_revision <> expected_revision then raise exception 'FINANCE_CONFLICT' using errcode='40001'; end if;
  for mapping in select * from (values ('cards','cards'),('people','people'),('categories','categories'),('purchases','purchases'),('invoices','invoices'),('allocations','expense_allocations'),('refunds','refunds'),('charges','card_charges'),('refund_allocations','refund_allocations'),('reimbursements','reimbursements'),('reimbursement_allocations','reimbursement_allocations'),('imports','import_files'),('sources','transaction_sources'),('audit','audit_logs')) as m(key,tab) loop
    select coalesce(jsonb_agg(value || jsonb_build_object('user_id',auth.uid())),'[]'::jsonb) into rows from jsonb_array_elements(state->mapping.key);
    select string_agg(format('%I=excluded.%I',attname,attname),',') into updates from pg_catalog.pg_attribute where attrelid=format('public.%I',mapping.tab)::regclass and attnum>0 and not attisdropped and attname not in ('id','user_id');
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1) on conflict(id) do update set %s where %I.user_id=auth.uid()',mapping.tab,mapping.tab,updates,mapping.tab) using rows;
  end loop;
  if exists(select 1 from public.purchases p where p.user_id=auth.uid() and (
    (p.status='confirmed' and p.amount <> coalesce((select sum(a.amount) from public.expense_allocations a where a.purchase_id=p.id and a.user_id=p.user_id),0)) or
    (p.status='pending' and exists(select 1 from public.expense_allocations a where a.purchase_id=p.id and a.user_id=p.user_id)) or
    p.amount <> coalesce((select sum(c.amount) from public.card_charges c where c.purchase_id=p.id and c.user_id=p.user_id and c.kind='purchase'),0) or
    p.installments <> (select count(*) from public.card_charges c where c.purchase_id=p.id and c.user_id=p.user_id and c.kind='purchase') or
    p.amount < coalesce((select sum(r.amount) from public.refunds r where r.purchase_id=p.id and r.user_id=p.user_id),0)
  )) then raise exception 'Invalid purchase totals'; end if;
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
revoke all on function public.finance_snapshot() from public,anon;
revoke all on function public.finance_commit(integer,jsonb) from public,anon;
grant execute on function public.finance_snapshot() to authenticated;
grant execute on function public.finance_commit(integer,jsonb) to authenticated;
