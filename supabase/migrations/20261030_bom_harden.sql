-- 未登入的人不能呼叫這三個函式（只有登入後的管理者與業主會用到）；供應商依品牌查詢加索引
revoke execute on function public.bom_pl_entities() from public, anon;
revoke execute on function public.bom_pl_periods(text) from public, anon;
revoke execute on function public.bom_send_approval(uuid) from public, anon;
grant execute on function public.bom_pl_entities() to authenticated;
grant execute on function public.bom_pl_periods(text) to authenticated;
grant execute on function public.bom_send_approval(uuid) to authenticated;
create index if not exists bom_suppliers_brand on public.bom_suppliers(brand_id);
