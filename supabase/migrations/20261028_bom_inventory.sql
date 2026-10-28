-- BOM 運算中心：庫存與進貨（供應商、進貨單、盤點）
create table if not exists public.bom_suppliers(
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.bom_brands(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  contact text check (char_length(contact) <= 60),
  phone text check (char_length(phone) <= 40),
  line_id text check (char_length(line_id) <= 60),
  pay_terms text check (char_length(pay_terms) <= 60),
  note text check (char_length(note) <= 300),
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bom_suppliers is 'BOM 運算中心：供應商主檔（每個品牌各自一份）';

create table if not exists public.bom_receipts(
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.bom_brands(id) on delete cascade,
  supplier_id uuid references public.bom_suppliers(id) on delete set null,
  supplier_name text check (char_length(supplier_name) <= 80),
  received_on date not null,
  invoice_no text check (char_length(invoice_no) <= 40),
  note text check (char_length(note) <= 300),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200),
  total numeric not null default 0 check (total >= 0 and total < 1e10),
  created_by uuid default auth.uid(),
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bom_receipts is 'BOM 運算中心：進貨單。lines 每列 {key,name,qty(進貨單位),pack(每單位幾個基本單位),unit,price(每進貨單位),amount}';
create index if not exists bom_receipts_brand_date on public.bom_receipts(brand_id, received_on desc);

create table if not exists public.bom_counts(
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.bom_brands(id) on delete cascade,
  count_on date not null,
  label text check (char_length(label) <= 60),
  note text check (char_length(note) <= 300),
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid default auth.uid(),
  created_by_email text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_email text,
  updated_at timestamptz not null default now()
);
comment on table public.bom_counts is 'BOM 運算中心：盤點單表頭（open 盤點中、closed 已完成）';
create index if not exists bom_counts_brand_date on public.bom_counts(brand_id, count_on desc);

create table if not exists public.bom_count_lines(
  count_id uuid not null references public.bom_counts(id) on delete cascade,
  brand_id text not null,
  item_key text not null check (item_key ~ '^[is]:[A-Za-z0-9_-]{1,40}$'),
  name text check (char_length(name) <= 80),
  qty_base numeric not null check (qty_base >= 0 and qty_base < 1e10),
  unit_cost numeric check (unit_cost >= 0 and unit_cost < 1e8),
  counted_by_email text,
  updated_at timestamptz not null default now(),
  primary key (count_id, item_key)
);
comment on table public.bom_count_lines is 'BOM 運算中心：盤點明細。qty_base 為基本單位數量，unit_cost 為盤點當時每基本單位的門市進價';

-- 共用：蓋上建立者、時間；擋數量上限
create or replace function bom_private.inv_stamp() returns trigger
language plpgsql security definer set search_path to '' as $$
declare em text; n int;
begin
  select email into em from auth.users where id = auth.uid();
  if tg_op = 'INSERT' then
    if tg_table_name = 'bom_suppliers' then
      select count(*) into n from public.bom_suppliers where brand_id = new.brand_id;
      if n >= 300 then raise exception 'BOM_LIMIT: 供應商最多 300 家'; end if;
    elsif tg_table_name = 'bom_receipts' then
      select count(*) into n from public.bom_receipts where brand_id = new.brand_id;
      if n >= 20000 then raise exception 'BOM_LIMIT: 進貨單數量已達上限'; end if;
      new.created_by := auth.uid(); new.created_by_email := em;
    elsif tg_table_name = 'bom_counts' then
      select count(*) into n from public.bom_counts where brand_id = new.brand_id;
      if n >= 2000 then raise exception 'BOM_LIMIT: 盤點單數量已達上限'; end if;
      new.created_by := auth.uid(); new.created_by_email := em; new.status := 'open';
    end if;
  else
    new.created_by := old.created_by;
    if tg_table_name <> 'bom_suppliers' then new.created_by_email := old.created_by_email; end if;
    if new.brand_id <> old.brand_id then raise exception 'brand_id cannot change'; end if;
    if tg_table_name = 'bom_counts' then
      if old.status = 'closed' and new.status = 'open' and not bom_private.is_admin() then
        raise exception 'BOM_COUNT_CLOSED: 已完成的盤點只有顧問可以重新開啟';
      end if;
      if old.status = 'open' and new.status = 'closed' then new.closed_at := now(); new.closed_by_email := em; end if;
      if new.status = 'open' then new.closed_at := null; new.closed_by_email := null; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function bom_private.count_line_guard() returns trigger
language plpgsql security definer set search_path to '' as $$
declare c public.bom_counts;
begin
  select * into c from public.bom_counts where id = coalesce(new.count_id, old.count_id);
  if tg_op = 'DELETE' then
    if c.id is null or c.status = 'open' or bom_private.is_admin() then return old; end if;
    raise exception 'BOM_COUNT_CLOSED: 這張盤點單已完成，不能再修改';
  end if;
  if c.id is null then raise exception 'count not found'; end if;
  if c.status <> 'open' then raise exception 'BOM_COUNT_CLOSED: 這張盤點單已完成，不能再修改'; end if;
  new.brand_id := c.brand_id;
  new.counted_by_email := (select email from auth.users where id = auth.uid());
  new.updated_at := now();
  return new;
end $$;

create or replace trigger bom_suppliers_stamp before insert or update on public.bom_suppliers for each row execute function bom_private.inv_stamp();
create or replace trigger bom_receipts_stamp before insert or update on public.bom_receipts for each row execute function bom_private.inv_stamp();
create or replace trigger bom_counts_stamp before insert or update on public.bom_counts for each row execute function bom_private.inv_stamp();
create or replace function bom_private.count_del_guard() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if old.status = 'closed' and not bom_private.is_admin() then
    raise exception 'BOM_COUNT_CLOSED: 已完成的盤點只有顧問可以刪除';
  end if;
  return old;
end $$;
create or replace trigger bom_counts_del before delete on public.bom_counts for each row execute function bom_private.count_del_guard();
create or replace trigger bom_count_lines_guard before insert or update or delete on public.bom_count_lines for each row execute function bom_private.count_line_guard();

alter table public.bom_suppliers enable row level security;
alter table public.bom_receipts enable row level security;
alter table public.bom_counts enable row level security;
alter table public.bom_count_lines enable row level security;

do $$ declare t text; begin
  foreach t in array array['bom_suppliers','bom_receipts','bom_counts','bom_count_lines'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (bom_private.can_read(brand_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (bom_private.can_write(brand_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (bom_private.can_write(brand_id)) with check (bom_private.can_write(brand_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (bom_private.can_write(brand_id))', t);
  end loop;
end $$;

-- 盤點明細的 brand_id 由觸發程序依表頭覆寫，但 RLS 的 with check 在觸發程序之後檢查，所以業主無法寫到別人的盤點單
create index if not exists bom_count_lines_brand on public.bom_count_lines(brand_id);
create index if not exists bom_receipts_supplier on public.bom_receipts(supplier_id);
grant select, insert, update, delete on public.bom_suppliers, public.bom_receipts, public.bom_counts, public.bom_count_lines to authenticated;
