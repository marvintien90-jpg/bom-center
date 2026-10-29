-- BOM 運算中心第二階段批次 1：耗損／報廢登記、POS 銷量匯入
create table if not exists public.bom_waste(
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.bom_brands(id) on delete cascade,
  waste_on date not null default current_date,
  item_key text not null check (item_key ~ '^[ism]:[A-Za-z0-9_-]{1,40}$'),
  name text check (char_length(name) <= 80),
  qty numeric not null check (qty > 0 and qty < 1e10),
  unit_cost numeric check (unit_cost >= 0 and unit_cost < 1e8),
  amount numeric not null default 0 check (amount >= 0 and amount < 1e10),
  reason text not null check (reason in ('過期','損壞','製作失誤','客訴重做','員工餐','試吃招待','其他')),
  note text check (char_length(note) <= 200),
  created_by uuid default auth.uid(),
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bom_waste is 'BOM 運算中心：耗損／報廢。item_key i:/s: 時 qty 為基本單位、unit_cost 為每基本單位進價；m: 為整份餐點，qty 為份數、unit_cost 為每份成本';
create index if not exists bom_waste_brand_date on public.bom_waste(brand_id, waste_on desc);

create table if not exists public.bom_sales(
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.bom_brands(id) on delete cascade,
  start_on date not null,
  end_on date not null,
  source text check (char_length(source) <= 120),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 1000),
  unmatched jsonb not null default '[]'::jsonb check (jsonb_typeof(unmatched) = 'array' and jsonb_array_length(unmatched) <= 1000),
  qty_total numeric not null default 0 check (qty_total >= 0 and qty_total < 1e10),
  amount_total numeric not null default 0 check (amount_total >= 0 and amount_total < 1e11),
  created_by uuid default auth.uid(),
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_on >= start_on and end_on - start_on <= 92)
);
comment on table public.bom_sales is 'BOM 運算中心：POS 銷量匯入。lines 每列 {key(m:品項 或 k:套餐),name,qty,amount}；unmatched 是對不到品項的 POS 品名 {name,qty,amount}';
create index if not exists bom_sales_brand_date on public.bom_sales(brand_id, end_on desc);

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
    elsif tg_table_name = 'bom_waste' then
      select count(*) into n from public.bom_waste where brand_id = new.brand_id;
      if n >= 50000 then raise exception 'BOM_LIMIT: 耗損紀錄數量已達上限'; end if;
      new.created_by := auth.uid(); new.created_by_email := em;
    elsif tg_table_name = 'bom_sales' then
      select count(*) into n from public.bom_sales where brand_id = new.brand_id;
      if n >= 3000 then raise exception 'BOM_LIMIT: 銷量匯入次數已達上限'; end if;
      new.created_by := auth.uid(); new.created_by_email := em;
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

create or replace trigger bom_waste_stamp before insert or update on public.bom_waste for each row execute function bom_private.inv_stamp();
create or replace trigger bom_sales_stamp before insert or update on public.bom_sales for each row execute function bom_private.inv_stamp();

alter table public.bom_waste enable row level security;
alter table public.bom_sales enable row level security;
do $$ declare t text; begin
  foreach t in array array['bom_waste','bom_sales'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (brand_id in (select bom_private.readable_brands()))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (bom_private.can_write(brand_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (bom_private.can_write(brand_id)) with check (bom_private.can_write(brand_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (bom_private.can_write(brand_id))', t);
  end loop;
end $$;
grant select, insert, update, delete on public.bom_waste, public.bom_sales to authenticated;
