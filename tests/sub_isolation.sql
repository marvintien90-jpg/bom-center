-- 訂閱與資料隔離測試：在同一個交易裡建立假帳號、扮演業主操作，最後一定丟出例外，
-- 讓所有變更（包含假帳號）全部回復，資料庫不留任何痕跡。結果放在例外訊息裡。
-- 用法：把 20261103_sub_core.sql（若尚未套用）和本檔接在一起，用 SQL Editor 或 execute_sql 執行。
do $t$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r jsonb; out text[] := '{}'; ok int := 0; bad int := 0;
  n int; x text; ra jsonb; rb jsonb; s public.sub_subscriptions;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subtest-a@example.com', '', now(), '{"display_name":"測試A"}', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subtest-b@example.com', '', now(), '{"display_name":"測試B"}', now(), now());
  update public.sub_settings set signup_open = false where id = 1;

  -- 1. 未開放、不在試點名單 → 拒絕
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.sub_start_trial('{"company":"一級棒讚企業社","brand":"一級棒讚","store":"公益店","plan":"pro"}');
    out := out || text 'FAIL 1 未開放仍可試用'; bad := bad + 1;
  exception when others then
    if sqlerrm = 'SUB_SIGNUP_CLOSED' then ok := ok + 1; else out := out || ('FAIL 1 ' || sqlerrm); bad := bad + 1; end if;
  end;
  execute 'reset role';

  -- 2. 加入試點名單後可試用；故意用既有客戶名稱，必須拿到不同的專屬名稱
  insert into public.sub_pilots (email) values ('subtest-a@example.com');
  execute 'set local role authenticated';
  ra := public.sub_start_trial('{"company":"一級棒讚企業社","brand":"一級棒讚","store":"公益店","plan":"pro","stores":1}');
  if ra->>'client_name' <> '一級棒讚企業社' then ok := ok + 1; else out := out || text 'FAIL 2 接到既有客戶名稱'; bad := bad + 1; end if;

  -- 3. A 只看得到自己的品牌與損益，看不到既有客戶
  select count(*) into n from public.bom_brands;
  if n = 1 then ok := ok + 1; else out := out || ('FAIL 3a A 看到品牌數 ' || n); bad := bad + 1; end if;
  select count(*) into n from public.pl_statements;
  if n = 0 then ok := ok + 1; else out := out || ('FAIL 3b A 看到損益表 ' || n); bad := bad + 1; end if;
  select count(*) into n from public.pl_line_items;
  if n = 0 then ok := ok + 1; else out := out || ('FAIL 3c A 看到損益明細 ' || n); bad := bad + 1; end if;
  select count(*) into n from public.bom_receipts;
  if n = 0 then ok := ok + 1; else out := out || ('FAIL 3d A 看到進貨單 ' || n); bad := bad + 1; end if;
  if public.bom_pl_periods('test-model-store-2') is null and public.bom_pl_periods('yijibang-gongyi') is null then ok := ok + 1; else out := out || text 'FAIL 3e A 讀到別人的損益串接'; bad := bad + 1; end if;
  select count(*) into n from public.bom_profiles;
  if n = 1 then ok := ok + 1; else out := out || ('FAIL 3f A 看到帳號數 ' || n); bad := bad + 1; end if;
  select count(*) into n from public.pl_brand_settings;
  if n = 1 then ok := ok + 1; else out := out || ('FAIL 3g A 看到品牌設定 ' || n); bad := bad + 1; end if;

  -- 4. A 可以編輯自己的品牌
  update public.bom_brands set data = '{"ingredients":[]}'::jsonb, rev = rev + 1 where id = ra->>'brand_id';
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else out := out || text 'FAIL 4 A 不能編輯自己的品牌'; bad := bad + 1; end if;
  update public.bom_brands set name = 'hack' where id = 'yijibang-gongyi';
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else out := out || text 'FAIL 4b A 改到別人的品牌'; bad := bad + 1; end if;

  -- 5. A 不能自己改訂閱、不能寫付款、不能呼叫入帳函式、不能改授權
  update public.sub_subscriptions set status = 'active', period_end = '2099-01-01' where user_id = a;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else out := out || text 'FAIL 5a A 能改自己的訂閱'; bad := bad + 1; end if;
  begin
    insert into public.sub_payments (provider, merchant_trade_no, kind, status) values ('ecpay', 'x', 'first', 'paid');
    out := out || text 'FAIL 5b A 能寫付款'; bad := bad + 1;
  exception when others then ok := ok + 1; end;
  begin
    perform public.sub_apply_payment((select id from public.sub_subscriptions where user_id = a), 'first', current_date, 'x', null, null, null);
    out := out || text 'FAIL 5c A 能呼叫入帳'; bad := bad + 1;
  exception when others then ok := ok + 1; end;
  update public.bom_profiles set plan = 'pro', expires_on = '2099-01-01' where user_id = a;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else out := out || text 'FAIL 5d A 能改自己的授權'; bad := bad + 1; end if;
  update public.pl_profiles set expires_on = '2099-01-01' where user_id = a;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else out := out || text 'FAIL 5d2 A 能改損益授權'; bad := bad + 1; end if;
  begin
    insert into public.bom_brand_access (user_id, brand_id) values (a, 'yijibang-gongyi');
    out := out || text 'FAIL 5f2 A 能替自己加品牌'; bad := bad + 1;
  exception when others then ok := ok + 1; end;
  begin
    update public.bom_pl_link set client_name = '一級棒讚企業社' where brand_id = ra->>'brand_id';
    get diagnostics n = row_count;
    if n = 0 then ok := ok + 1; else out := out || text 'FAIL 5h A 能把串接改到別人'; bad := bad + 1; end if;
  exception when others then ok := ok + 1; end;
  begin
    perform public.sub_admin_attach('{"email":"subtest-a@example.com","client_name":"一級棒讚企業社","brand_name":"一級棒讚"}');
    out := out || text 'FAIL 5e A 能用管理員轉訂閱'; bad := bad + 1;
  exception when others then ok := ok + 1; end;
  begin
    insert into public.pl_access (user_id, client_name, brand_name) values (a, '一級棒讚企業社', '一級棒讚');
    out := out || text 'FAIL 5f A 能替自己加損益權限'; bad := bad + 1;
  exception when others then ok := ok + 1; end;
  select count(*) into n from public.sub_pilots;
  if n = 0 then ok := ok + 1; else out := out || text 'FAIL 5g A 看得到試點名單'; bad := bad + 1; end if;

  -- 6. 不能重複試用
  begin
    perform public.sub_start_trial('{"company":"再一次","brand":"再一次","plan":"pro"}');
    out := out || text 'FAIL 6 可重複試用'; bad := bad + 1;
  exception when others then
    if sqlerrm = 'SUB_EXISTS' then ok := ok + 1; else out := out || ('FAIL 6 ' || sqlerrm); bad := bad + 1; end if;
  end;

  -- 7. 試用中改方案與店數 → 兩套授權跟著變
  perform public.sub_set_plan('basic', 2);
  execute 'reset role';
  if (select plan from public.bom_profiles where user_id = a) = 'basic' then ok := ok + 1; else out := out || text 'FAIL 7 改方案沒同步'; bad := bad + 1; end if;
  if (select status from public.pl_profiles where user_id = a) = 'active' and (select access from public.pl_profiles where user_id = a) = 'edit'
     and (select expires_on from public.pl_profiles where user_id = a) = (select trial_ends_on from public.sub_subscriptions where user_id = a)
  then ok := ok + 1; else out := out || ('FAIL 7b 損益帳號 ' || (select row(status,access,expires_on)::text from public.pl_profiles where user_id = a)); bad := bad + 1; end if;

  -- 8. 開放註冊後 B 用同一個公司名稱 → 又是另一個專屬名稱，彼此看不到
  update public.sub_settings set signup_open = true where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  rb := public.sub_start_trial('{"company":"一級棒讚企業社","brand":"一級棒讚","store":"公益店","plan":"member"}');
  if rb->>'client_name' not in ('一級棒讚企業社', ra->>'client_name') then ok := ok + 1; else out := out || text 'FAIL 8 B 名稱撞到'; bad := bad + 1; end if;
  select count(*) into n from public.bom_brands where id = ra->>'brand_id';
  if n = 0 then ok := ok + 1; else out := out || text 'FAIL 8b B 看到 A 的品牌'; bad := bad + 1; end if;
  select count(*) into n from public.sub_subscriptions;
  if n = 1 then ok := ok + 1; else out := out || ('FAIL 8c B 看到訂閱數 ' || n); bad := bad + 1; end if;
  if pl_private.can_read(ra->>'client_name', '一級棒讚', '公益店') then out := out || text 'FAIL 8d B 能讀 A 的損益'; bad := bad + 1; else ok := ok + 1; end if;
  execute 'reset role';
  if sub_private.owns_client(rb->>'client_name') and not sub_private.owns_client(ra->>'client_name') then ok := ok + 1; else out := out || text 'FAIL 8e owns_client'; bad := bad + 1; end if;

  -- 9. 首期付款（模擬金流回呼）→ active，試用剩餘天數保留
  s := (select x from public.sub_subscriptions x where user_id = b);
  perform public.sub_apply_payment(s.id, 'first', sub_private.today(), 'T1', '4242', null, null);
  s := (select x from public.sub_subscriptions x where user_id = b);
  if s.status = 'active' and s.period_end = (s.trial_ends_on + interval '1 month')::date and s.auto_renew then ok := ok + 1; else out := out || ('FAIL 9 首期 ' || s.status || ' ' || s.period_end); bad := bad + 1; end if;
  if (select expires_on from public.bom_profiles where user_id = b) = s.period_end + 3 then ok := ok + 1; else out := out || text 'FAIL 9b 授權到期日'; bad := bad + 1; end if;

  -- 10. 試用過期 → 排程轉 expired，A 看不到任何品牌（資料仍在）
  update public.sub_subscriptions set trial_ends_on = sub_private.today() - 1 where user_id = a;
  perform sub_private.daily();
  if (select status from public.sub_subscriptions where user_id = a) = 'expired' then ok := ok + 1; else out := out || text 'FAIL 10 沒轉到期'; bad := bad + 1; end if;
  if (select status from public.sub_subscriptions where user_id = b) = 'active' then ok := ok + 1; else out := out || text 'FAIL 10b B 被誤判到期'; bad := bad + 1; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.bom_brands;
  if n = 0 then ok := ok + 1; else out := out || text 'FAIL 10c 到期仍看得到品牌'; bad := bad + 1; end if;
  execute 'reset role';
  if exists (select 1 from public.bom_brands where id = ra->>'brand_id') then ok := ok + 1; else out := out || text 'FAIL 10d 到期把資料刪了'; bad := bad + 1; end if;

  -- 11. 未登入：看得到方案，看不到訂閱與付款
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into n from public.sub_plans;
  if n = 3 then ok := ok + 1; else out := out || text 'FAIL 11 anon 看不到方案'; bad := bad + 1; end if;
  begin
    select count(*) into n from public.sub_subscriptions;
    if n = 0 then ok := ok + 1; else out := out || text 'FAIL 11b anon 看到訂閱'; bad := bad + 1; end if;
  exception when others then ok := ok + 1; end;
  begin
    perform public.sub_start_trial('{"company":"x","brand":"x"}');
    out := out || text 'FAIL 11c anon 能試用'; bad := bad + 1;
  exception when others then ok := ok + 1; end;
  execute 'reset role';

  raise exception 'SUBTEST % passed, % failed: %', ok, bad, array_to_string(out, ' | ');
end $t$;
