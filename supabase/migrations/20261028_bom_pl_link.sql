-- BOM 運算中心 ↔ 損益分析中心：品牌對應，BOM 直接讀損益中心的月報，不再另外複製
create table if not exists public.bom_pl_link(
  brand_id text primary key references public.bom_brands(id) on delete cascade,
  client_name text not null check (char_length(client_name) <= 120),
  brand_name text not null check (char_length(brand_name) <= 120),
  store_name text check (char_length(store_name) <= 120),
  updated_at timestamptz not null default now()
);
comment on table public.bom_pl_link is 'BOM 品牌對應到損益分析中心的客戶／品牌／分店；store_name 空白代表整個品牌所有分店合計';
alter table public.bom_pl_link enable row level security;
create policy bom_pl_link_select on public.bom_pl_link for select to authenticated using (bom_private.can_read(brand_id));
create policy bom_pl_link_insert on public.bom_pl_link for insert to authenticated with check (bom_private.is_admin());
create policy bom_pl_link_update on public.bom_pl_link for update to authenticated using (bom_private.is_admin()) with check (bom_private.is_admin());
create policy bom_pl_link_delete on public.bom_pl_link for delete to authenticated using (bom_private.is_admin());
grant select, insert, update, delete on public.bom_pl_link to authenticated;

-- 讀取對應的損益月報（只有能看這個 BOM 品牌的人能讀，且只讀到對應的那一家）
create or replace function public.bom_pl_periods(b text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare l public.bom_pl_link; out jsonb;
begin
  if not bom_private.can_read(b) then return null; end if;
  select * into l from public.bom_pl_link where brand_id = b;
  if l.brand_id is null then return null; end if;
  with st as (
    select s.id, s.period_month, s.source_file from public.pl_statements s
    where s.client_name = l.client_name and s.brand_name = l.brand_name
      and (l.store_name is null or s.store_name = l.store_name)
  ), li as (
    select st.period_month, i.section, i.account_name, sum(i.amount) amount, min(i.sort_order) so
    from st join public.pl_line_items i on i.statement_id = st.id
    group by 1, 2, 3
  ), m as (
    select st.period_month, string_agg(distinct st.source_file, '、') src from st group by 1
  )
  select jsonb_agg(jsonb_build_object(
      'month', to_char(m.period_month, 'YYYY-MM'),
      'source', m.src,
      'revenue', coalesce((select jsonb_agg(jsonb_build_object('name', account_name, 'amount', amount) order by so) from li where li.period_month = m.period_month and section = '營業收入'), '[]'::jsonb),
      'purchases', coalesce((select jsonb_agg(jsonb_build_object('name', account_name, 'amount', amount) order by so) from li where li.period_month = m.period_month and section = '營業成本'), '[]'::jsonb),
      'expenses', coalesce((select jsonb_agg(jsonb_build_object('name', account_name, 'amount', amount) order by so) from li where li.period_month = m.period_month and section = '營業費用'), '[]'::jsonb)
    ) order by m.period_month) into out from m;
  return jsonb_build_object('client', l.client_name, 'brand', l.brand_name, 'store', l.store_name, 'periods', coalesce(out, '[]'::jsonb));
end $$;

-- 管理員設定對應時用：列出損益中心有哪些客戶／品牌／分店
create or replace function public.bom_pl_entities() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not bom_private.is_admin() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('client', client_name, 'brand', brand_name, 'store', store_name, 'months', n) order by client_name, brand_name, store_name)
    from (select client_name, brand_name, store_name, count(*) n from public.pl_statements group by 1, 2, 3) x), '[]'::jsonb);
end $$;
grant execute on function public.bom_pl_periods(text), public.bom_pl_entities() to authenticated;

-- 既有的對應：一級棒讚小火鍋（公益店）
insert into public.bom_pl_link(brand_id, client_name, brand_name, store_name)
select 'yijibang-gongyi', '一級棒讚企業社', '一級棒讚', '公益店'
where exists (select 1 from public.bom_brands where id = 'yijibang-gongyi')
on conflict (brand_id) do nothing;
