-- BOM 運算中心第二階段批次 2：採購單（向供應商叫貨，收貨後轉成進貨單）
create table if not exists public.bom_pos(
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.bom_brands(id) on delete cascade,
  supplier_id uuid references public.bom_suppliers(id) on delete set null,
  supplier_name text check (char_length(supplier_name) <= 80),
  order_on date not null default current_date,
  expect_on date,
  status text not null default 'draft' check (status in ('draft','sent','received','cancelled')),
  note text check (char_length(note) <= 300),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200),
  total numeric not null default 0 check (total >= 0 and total < 1e10),
  receipt_id uuid references public.bom_receipts(id) on delete set null,
  created_by uuid default auth.uid(),
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bom_pos is 'BOM 運算中心：採購單。lines 每列 {key,name,qty(進貨單位),pack,unit,price(每進貨單位),amount}；收貨後 receipt_id 指向轉成的進貨單';
create index if not exists bom_pos_brand_date on public.bom_pos(brand_id, order_on desc);
create index if not exists bom_pos_supplier on public.bom_pos(supplier_id);
create index if not exists bom_pos_receipt on public.bom_pos(receipt_id);

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
    elsif tg_table_name = 'bom_pos' then
      select count(*) into n from public.bom_pos where brand_id = new.brand_id;
      if n >= 20000 then raise exception 'BOM_LIMIT: 採購單數量已達上限'; end if;
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

create or replace trigger bom_pos_stamp before insert or update on public.bom_pos for each row execute function bom_private.inv_stamp();
alter table public.bom_pos enable row level security;
create policy bom_pos_select on public.bom_pos for select to authenticated using (brand_id in (select bom_private.readable_brands()));
create policy bom_pos_insert on public.bom_pos for insert to authenticated with check (bom_private.can_write(brand_id));
create policy bom_pos_update on public.bom_pos for update to authenticated using (bom_private.can_write(brand_id)) with check (bom_private.can_write(brand_id));
create policy bom_pos_delete on public.bom_pos for delete to authenticated using (bom_private.can_write(brand_id));
grant select, insert, update, delete on public.bom_pos to authenticated;
