-- 經營健檢名單：權限測試。先貼 migration 20261104_checkup_leads.sql，再接這段，最後丟例外全部回復。
create temp table _r(n text, ok boolean, d text);
grant all on _r to anon, authenticated;
do $$ declare r jsonb; begin
  set local role anon;
  r := public.checkup_submit('{"consent":true,"contact":{"name":"測試","phone":"0912000000"},"info":{"brand":"測試鍋<b>","stores":"2"},"answers":{"p1":3},"fin":{},"scores":{"prod":40},"total":41}'::jsonb);
  insert into _r values ('1 匿名可送出', r ? 'id', r::text);
  begin perform 1 from public.checkup_leads; insert into _r values ('2 匿名不能讀', false, 'read ok'); exception when insufficient_privilege then insert into _r values ('2 匿名不能讀', true, null); end;
  begin insert into public.checkup_leads(contact_name, consent) values ('x', true); insert into _r values ('3 匿名不能直接寫', false, null); exception when insufficient_privilege then insert into _r values ('3 匿名不能直接寫', true, null); end;
  begin perform public.checkup_submit('{"consent":false,"contact":{"name":"a","phone":"1"}}'); insert into _r values ('4 沒同意被擋', false, null); exception when others then insert into _r values ('4 沒同意被擋', true, sqlerrm); end;
  begin perform public.checkup_submit('{"consent":true,"contact":{"name":"a"}}'); insert into _r values ('5 沒聯絡方式被擋', false, null); exception when others then insert into _r values ('5 沒聯絡方式被擋', true, sqlerrm); end;
  begin perform public.checkup_submit('{"consent":true,"contact":{"name":"a","email":"bad"}}'); insert into _r values ('6 Email 格式被擋', false, null); exception when others then insert into _r values ('6 Email 格式被擋', true, sqlerrm); end;
  begin perform public.checkup_submit(jsonb_build_object('consent',true,'contact',jsonb_build_object('name','a','phone','1'),'answers',jsonb_build_object('x',repeat('a',5000)))); insert into _r values ('7 過大被擋', false, null); exception when others then insert into _r values ('7 過大被擋', true, sqlerrm); end;
  reset role;
end $$;
do $$ declare b text; begin
  select brand into b from public.checkup_leads order by id desc limit 1;
  insert into _r values ('8 欄位清掉 <>', b = '測試鍋b', b);
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  insert into _r values ('9 非管理員登入看不到', (select count(*) from public.checkup_leads) = 0, null);
  reset role;
end $$;
do $$ declare s text; f int; begin
  select string_agg(n || ':' || case when ok then 'PASS' else 'FAIL' end || coalesce(' ('||d||')',''), ' | ' order by n), count(*) filter (where not ok) into s, f from _r;
  raise exception 'RESULT fail=% :: %', f, s;
end $$;
