-- 免費招待與排程金鑰測試：建立假帳號、操作後一律丟出例外讓全部變更回復。結果在例外訊息裡。
-- 用法：把 20261104_sub_comp_hardening.sql（若尚未套用）和本檔接在一起執行。
do $t$
declare
  a uuid := gen_random_uuid(); adm uuid := '9f0b31ab-f9dc-4caf-8a5c-6f453d282554'; out text[] := '{}'; ok int := 0; bad int := 0;
  sid bigint; s public.sub_subscriptions; e date; x boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subcomp-a@example.com', '', now(), '{"display_name":"招待測試"}', now(), now());

  -- 1. 管理員轉成訂閱並直接設為免費招待 → 兩套系統不到期
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.sub_admin_attach('{"email":"subcomp-a@example.com","client_name":"招待測試企業社","brand_name":"招待測試","plan":"member","comp":true}');
  execute 'reset role';
  select * into s from public.sub_subscriptions where user_id = a; sid := s.id;
  if s.status = 'comp' then ok := ok + 1; else out := out || ('FAIL 1a 狀態 ' || s.status); bad := bad + 1; end if;
  if exists (select 1 from public.bom_profiles where user_id = a and status = 'active' and expires_on is null)
     and exists (select 1 from public.pl_profiles where user_id = a and status = 'active' and expires_on is null)
  then ok := ok + 1; else out := out || text 'FAIL 1b 兩套系統沒有開通成不到期'; bad := bad + 1; end if;

  -- 2. 每日排程不會讓招待帳號到期
  update public.sub_subscriptions set trial_ends_on = sub_private.today() - 30 where id = sid;
  perform sub_private.daily();
  select * into s from public.sub_subscriptions where id = sid;
  if s.status = 'comp' then ok := ok + 1; else out := out || ('FAIL 2 每日排程改成 ' || s.status); bad := bad + 1; end if;

  -- 3. 業主自己不能把自己設成招待，也不能用排程金鑰函式
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.sub_admin_set_comp(sid, true);
    out := out || text 'FAIL 3a 業主能設招待'; bad := bad + 1;
  exception when others then
    if sqlerrm = 'SUB_ADMIN_ONLY' then ok := ok + 1; else out := out || ('FAIL 3a ' || sqlerrm); bad := bad + 1; end if;
  end;
  begin
    x := public.sub_cron_secret_ok('x');
    out := out || text 'FAIL 3b 登入使用者能呼叫金鑰比對'; bad := bad + 1;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    update public.sub_subscriptions set status = 'active' where id = sid;
  exception when others then null;
  end;
  execute 'reset role';
  if (select status from public.sub_subscriptions where id = sid) = 'comp' then ok := ok + 1; else out := out || text 'FAIL 3c 業主能直接改狀態'; bad := bad + 1; end if;

  -- 4. 管理員取消招待 → 回到 14 天試用，期限跟著設好
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.sub_admin_set_comp(sid, false);
  execute 'reset role';
  select * into s from public.sub_subscriptions where id = sid;
  select expires_on into e from public.bom_profiles where user_id = a;
  if s.status = 'trial' and s.trial_ends_on = sub_private.today() + 14 and e = s.trial_ends_on then ok := ok + 1;
  else out := out || ('FAIL 4 取消招待後 ' || s.status || ' ' || coalesce(e::text, 'null')); bad := bad + 1; end if;

  -- 5. 還在自動扣款的訂閱不能直接設招待
  update public.sub_subscriptions set status = 'active', auto_renew = true, period_end = sub_private.today() + 20 where id = sid;
  execute 'set local role authenticated';
  begin
    perform public.sub_admin_set_comp(sid, true);
    out := out || text 'FAIL 5 扣款中可直接設招待'; bad := bad + 1;
  exception when others then
    if sqlerrm = 'SUB_CANCEL_RENEW_FIRST' then ok := ok + 1; else out := out || ('FAIL 5 ' || sqlerrm); bad := bad + 1; end if;
  end;
  execute 'reset role';

  -- 6. 排程金鑰：錯的不通過，對的通過
  if not public.sub_cron_secret_ok('0123456789abcdef0123456789abcdef') then ok := ok + 1; else out := out || text 'FAIL 6a 錯的金鑰通過'; bad := bad + 1; end if;
  if public.sub_cron_secret_ok((select decrypted_secret from vault.decrypted_secrets where name = 'sub_cron_secret')) then ok := ok + 1;
  else out := out || text 'FAIL 6b 正確金鑰沒通過'; bad := bad + 1; end if;

  raise exception 'RESULT ok=% bad=% %', ok, bad, array_to_string(out, ' | ');
end $t$;
