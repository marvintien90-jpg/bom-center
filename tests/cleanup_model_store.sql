-- 刪除「【測試】模擬門市」全部資料（品牌、供應商、進貨、盤點、損益對應、損益表）。
-- 已完成的盤點只有顧問能刪，所以用顧問身分執行。
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub',(select p.user_id from public.bom_profiles p where p.role='admin' and p.status='active' limit 1),'role','authenticated')::text, true);
  delete from public.bom_brands where id = 'test-model-store';
  delete from public.pl_statements where client_name = '【測試】模擬門市';
end $$;
