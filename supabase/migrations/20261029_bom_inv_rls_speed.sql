-- 大量資料時讀取變快：讀取權限改成「先算一次看得到哪些品牌」，不用每一列都檢查一次。
-- 規則跟 can_read 完全一樣（顧問看全部；開通中的業主看被指派的品牌）。
create or replace function bom_private.readable_brands()
returns setof text language sql stable security definer set search_path = '' as $$
  select b.id from public.bom_brands b where bom_private.is_admin()
  union
  select a.brand_id from public.bom_brand_access a
  where bom_private.active_access() is not null and a.user_id = (select auth.uid())
$$;
grant execute on function bom_private.readable_brands() to authenticated;

alter policy bom_suppliers_select on public.bom_suppliers using (brand_id in (select bom_private.readable_brands()));
alter policy bom_receipts_select on public.bom_receipts using (brand_id in (select bom_private.readable_brands()));
alter policy bom_counts_select on public.bom_counts using (brand_id in (select bom_private.readable_brands()));
alter policy bom_count_lines_select on public.bom_count_lines using (brand_id in (select bom_private.readable_brands()));
