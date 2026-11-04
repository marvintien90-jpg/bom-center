-- 訂閱系統第二版（2026-11-04）
--   1. 新增「免費招待」狀態 comp：不到期、不扣款、每日排程不處理，顧問會員方案照樣收到每月健檢簡報。
--   2. 管理員可以把訂閱設成免費招待或取消招待；轉成訂閱時也可以直接選免費招待（例如一級棒讚）。
--   3. 每月簡報排程用的金鑰改由資料庫自動產生並存在 vault，edge function 透過只給 service role 的函式比對，不必在後台手動設定。
-- 可以重複執行。

-- ---------- 1. 免費招待狀態 ----------
alter table public.sub_subscriptions drop constraint if exists sub_subscriptions_status_check;
alter table public.sub_subscriptions add constraint sub_subscriptions_status_check
  check (status in ('trial','active','past_due','canceled','expired','comp'));

-- comp 回傳 null：兩套系統的到期日清空＝不到期
create or replace function sub_private.access_until(s public.sub_subscriptions) returns date
language sql stable security definer set search_path to '' as $$
  select case
    when s.status = 'comp' then null
    when s.status = 'expired' then least(coalesce(s.period_end, s.trial_ends_on, sub_private.today() - 1), sub_private.today() - 1)
    when s.status = 'trial' then s.trial_ends_on
    when s.status = 'canceled' then coalesce(s.period_end, s.trial_ends_on)
    else coalesce(s.period_end, s.trial_ends_on) + (select g.grace_days from public.sub_settings g where g.id = 1)
  end
$$;

-- ---------- 2. 管理員設定／取消免費招待 ----------
-- 設為招待前，若還有綠界自動扣款要先在會員中心取消，避免招待帳號還被扣款。
-- 取消招待：回到試用，給一段試用期讓業主自己選方案綁卡，不會當場停權。
create or replace function public.sub_admin_set_comp(p_sub bigint, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s public.sub_subscriptions; days int;
begin
  if not bom_private.is_admin() then raise exception 'SUB_ADMIN_ONLY'; end if;
  select * into s from public.sub_subscriptions where id = p_sub for update;
  if s.id is null then raise exception 'SUB_NONE'; end if;
  if p_on then
    if s.status = 'comp' then return jsonb_build_object('status', 'comp'); end if;
    if s.auto_renew then raise exception 'SUB_CANCEL_RENEW_FIRST'; end if;
    update public.sub_subscriptions set status = 'comp', auto_renew = false where id = s.id;
  else
    if s.status <> 'comp' then return jsonb_build_object('status', s.status); end if;
    select trial_days into days from public.sub_settings where id = 1;
    update public.sub_subscriptions set status = 'trial', trial_ends_on = sub_private.today() + coalesce(days, 14), reminded_for = null where id = s.id;
  end if;
  insert into public.sub_log (user_id, actor, action, detail)
  values (s.user_id, (select auth.uid()), case when p_on then 'comp_on' else 'comp_off' end, jsonb_build_object('sub', s.id));
  return jsonb_build_object('status', case when p_on then 'comp' else 'trial' end);
end $$;
revoke execute on function public.sub_admin_set_comp(bigint, boolean) from public, anon;
grant execute on function public.sub_admin_set_comp(bigint, boolean) to authenticated;

-- 轉成訂閱時可直接選免費招待（p.comp = true）
create or replace function public.sub_admin_attach(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare uid uuid; em text := lower(trim(coalesce(p->>'email',''))); pl text := coalesce(p->>'plan','pro');
  n int := coalesce((p->>'stores')::int, 1); cl text := trim(coalesce(p->>'client_name',''));
  br text := trim(coalesce(p->>'brand_name','')); st text := coalesce(nullif(trim(coalesce(p->>'store_name','')),''),'本店');
  bid text := nullif(trim(coalesce(p->>'bom_brand_id','')),''); tend date := nullif(p->>'trial_ends_on','')::date;
  comp boolean := coalesce((p->>'comp')::boolean, false);
begin
  if not bom_private.is_admin() then raise exception 'SUB_ADMIN_ONLY'; end if;
  select id into uid from auth.users where lower(email) = em;
  if uid is null then raise exception 'SUB_NO_USER'; end if;
  if exists (select 1 from public.sub_subscriptions where user_id = uid) then raise exception 'SUB_EXISTS'; end if;
  if not exists (select 1 from public.sub_plans where code = pl) then raise exception 'SUB_BAD_PLAN'; end if;
  if cl = '' or br = '' then raise exception 'SUB_BAD_INPUT'; end if;
  if exists (select 1 from public.sub_subscriptions where client_name = cl) then raise exception 'SUB_CLIENT_TAKEN'; end if;
  if bid is not null and not exists (select 1 from public.bom_brands where id = bid) then raise exception 'SUB_NO_BRAND'; end if;
  insert into public.sub_subscriptions (user_id, email, company, client_name, brand_name, store_name, bom_brand_id, plan, stores, status, trial_ends_on, source, note)
  values (uid, em, left(coalesce(nullif(trim(p->>'company'),''), cl), 60), cl, br, st, bid, pl, n, case when comp then 'comp' else 'trial' end,
          coalesce(tend, sub_private.today() + (select trial_days from public.sub_settings where id = 1)), 'admin', left(coalesce(p->>'note',''), 500));
  if bid is not null then
    insert into public.bom_brand_access (user_id, brand_id) values (uid, bid) on conflict do nothing;
  end if;
  if not exists (select 1 from public.pl_access a where a.user_id = uid and a.client_name = cl and a.brand_name = br) then
    insert into public.pl_access (user_id, client_name, brand_name, store_name) values (uid, cl, br, null);
  end if;
  insert into public.sub_log (user_id, action, detail) values (uid, 'admin_attach', p);
  return jsonb_build_object('user_id', uid, 'client_name', cl, 'status', case when comp then 'comp' else 'trial' end);
end $$;
revoke execute on function public.sub_admin_attach(jsonb) from public, anon;
grant execute on function public.sub_admin_attach(jsonb) to authenticated;

-- ---------- 3. 每月簡報排程金鑰 ----------
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'sub_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'sub_cron_secret', '每月健檢簡報排程呼叫 health-deck 用');
  end if;
end $$;

create or replace function public.sub_cron_secret_ok(p text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce(length(p) >= 32 and exists (select 1 from vault.decrypted_secrets where name = 'sub_cron_secret' and decrypted_secret = p), false)
$$;
revoke execute on function public.sub_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.sub_cron_secret_ok(text) to service_role;
