-- 訂閱產品核心：方案、訂閱、付款紀錄、自助試用、同步兩套系統的授權
-- 設計原則：
--   1. 訂閱表 sub_subscriptions 是唯一真相；bom_profiles / pl_profiles 由觸發程序同步，
--      既有的讀寫權限（bom_private.can_read、pl_private.can_read…）完全不用改。
--   2. 自助試用只能建立「全新、專屬」的品牌與損益客戶名稱，絕不會接到既有客戶資料。
--   3. 付款只能由金流回呼（edge function，用 service role）寫入，業主無法自己改訂閱。
--   4. 預設關閉自助註冊（sub_settings.signup_open = false），安全審查後由管理員打開。

create schema if not exists sub_private;
revoke all on schema sub_private from public, anon, authenticated;

-- ---------- 方案 ----------
create table if not exists public.sub_plans(
  code text primary key check (code in ('basic','pro','member')),
  name text not null,
  price_per_store integer check (price_per_store is null or price_per_store between 0 and 1000000),
  bom_plan text not null check (bom_plan in ('basic','pro')),
  monthly_deck boolean not null default false,
  features text[] not null default '{}',
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table public.sub_plans is '訂閱方案：每店每月價格（未定價為 null，頁面顯示請洽詢、不能付款）、對應 BOM 方案、是否每月產出經營健檢簡報';
alter table public.sub_plans enable row level security;
drop policy if exists sub_plans_read on public.sub_plans;
create policy sub_plans_read on public.sub_plans for select to anon, authenticated using (true);
drop policy if exists sub_plans_write on public.sub_plans;
create policy sub_plans_write on public.sub_plans for update to authenticated using (bom_private.is_admin()) with check (bom_private.is_admin());
grant select on public.sub_plans to anon, authenticated;
grant update on public.sub_plans to authenticated;

insert into public.sub_plans (code, name, price_per_store, bom_plan, monthly_deck, sort, features) values
 ('basic', '基本版', 990, 'basic', false, 1, array['食材、半成品、配方與成本毛利','定價與漲價試算、叫貨推估','盤點、進貨、供應商、耗損、採購單','損益儀表板（上傳月報、燈號、兩平）']),
 ('pro', '進階版', 1500, 'pro', false, 2, array['基本版全部功能','用量差異、POS 銷量匯入','預估與情境、產品四象限、外送通路定價','損益趨勢、損益兩平、總部疊價與加盟主試算']),
 ('member', '顧問會員', 5000, 'pro', true, 3, array['進階版全部功能','每月自動產出經營健檢簡報','顧問每月一次線上諮詢','優先處理上傳與設定'])
on conflict (code) do nothing;

-- ---------- 設定 ----------
create table if not exists public.sub_settings(
  id integer primary key default 1 check (id = 1),
  signup_open boolean not null default false,
  trial_days integer not null default 14 check (trial_days between 1 and 60),
  grace_days integer not null default 3 check (grace_days between 0 and 14),
  billing_mode text not null default 'off' check (billing_mode in ('off','test','live')),
  provider text not null default 'ecpay' check (provider in ('ecpay','newebpay')),
  max_trials_per_day integer not null default 30 check (max_trials_per_day between 0 and 1000),
  updated_at timestamptz not null default now()
);
insert into public.sub_settings (id) values (1) on conflict (id) do nothing;
alter table public.sub_settings enable row level security;
drop policy if exists sub_settings_read on public.sub_settings;
create policy sub_settings_read on public.sub_settings for select to anon, authenticated using (true);
drop policy if exists sub_settings_write on public.sub_settings;
create policy sub_settings_write on public.sub_settings for update to authenticated using (bom_private.is_admin()) with check (bom_private.is_admin());
grant select on public.sub_settings to anon, authenticated;
grant update on public.sub_settings to authenticated;

-- 自助註冊未開放前，可以先試用的 Email（試點客戶、內部測試帳號）；只有管理員看得到
create table if not exists public.sub_pilots(
  email text primary key check (char_length(email) <= 200),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.sub_pilots enable row level security;
drop policy if exists sub_pilots_admin on public.sub_pilots;
create policy sub_pilots_admin on public.sub_pilots for all to authenticated using (bom_private.is_admin()) with check (bom_private.is_admin());
grant select, insert, update, delete on public.sub_pilots to authenticated;

-- ---------- 訂閱 ----------
create table if not exists public.sub_subscriptions(
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  company text not null check (char_length(company) between 1 and 60),
  client_name text not null unique check (char_length(client_name) between 1 and 80),
  brand_name text not null check (char_length(brand_name) between 1 and 60),
  store_name text not null check (char_length(store_name) between 1 and 60),
  bom_brand_id text references public.bom_brands(id) on delete set null,
  plan text not null references public.sub_plans(code),
  stores integer not null default 1 check (stores between 1 and 50),
  status text not null default 'trial' check (status in ('trial','active','past_due','canceled','expired')),
  trial_ends_on date,
  period_end date,
  auto_renew boolean not null default false,
  provider text,
  provider_ref text,
  card_last4 text,
  sandbox boolean not null default false,
  phone text check (phone is null or char_length(phone) <= 30),
  source text not null default 'self' check (source in ('self','admin')),
  note text not null default '' check (char_length(note) <= 500),
  reminded_for date,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sub_subscriptions is '訂閱：每個業主帳號一筆。狀態 trial 試用／active 扣款中／past_due 扣款失敗寬限中／canceled 已取消（用到期末）／expired 已到期。授權到期日 = coalesce(period_end, trial_ends_on) + 寬限天數';
alter table public.sub_subscriptions enable row level security;
drop policy if exists sub_subs_select on public.sub_subscriptions;
create policy sub_subs_select on public.sub_subscriptions for select to authenticated using (user_id = (select auth.uid()) or bom_private.is_admin());
drop policy if exists sub_subs_update on public.sub_subscriptions;
create policy sub_subs_update on public.sub_subscriptions for update to authenticated using (bom_private.is_admin()) with check (bom_private.is_admin());
grant select, update on public.sub_subscriptions to authenticated;

-- ---------- 付款紀錄 ----------
create table if not exists public.sub_payments(
  id bigint generated always as identity primary key,
  subscription_id bigint references public.sub_subscriptions(id) on delete set null,
  user_id uuid,
  provider text not null,
  merchant_trade_no text not null,
  trade_no text,
  seq integer not null default 0,
  kind text not null check (kind in ('checkout','first','period','cancel','refund')),
  amount integer,
  plan text,
  stores integer,
  status text not null check (status in ('pending','paid','failed','canceled')),
  rtn_code text,
  rtn_msg text,
  paid_at timestamptz,
  sandbox boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, merchant_trade_no, kind, seq)
);
comment on table public.sub_payments is '金流紀錄：checkout 建單、first 首期授權、period 每期扣款。只有金流回呼（service role）寫入';
alter table public.sub_payments enable row level security;
drop policy if exists sub_pay_select on public.sub_payments;
create policy sub_pay_select on public.sub_payments for select to authenticated using (user_id = (select auth.uid()) or bom_private.is_admin());
grant select on public.sub_payments to authenticated;
create index if not exists sub_payments_sub on public.sub_payments(subscription_id);
create index if not exists sub_payments_user on public.sub_payments(user_id);

-- ---------- 稽核紀錄 ----------
create table if not exists public.sub_log(
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  actor uuid default auth.uid(),
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.sub_log enable row level security;
drop policy if exists sub_log_select on public.sub_log;
create policy sub_log_select on public.sub_log for select to authenticated using (bom_private.is_admin());
grant select on public.sub_log to authenticated;
create index if not exists sub_log_user on public.sub_log(user_id);

-- ---------- 授權到期日計算與同步 ----------
create or replace function sub_private.today() returns date language sql stable set search_path to '' as
$$ select (now() at time zone 'Asia/Taipei')::date $$;

create or replace function sub_private.access_until(s public.sub_subscriptions) returns date
language sql stable security definer set search_path to '' as $$
  select case
    when s.status = 'expired' then least(coalesce(s.period_end, s.trial_ends_on, sub_private.today() - 1), sub_private.today() - 1)
    when s.status = 'trial' then s.trial_ends_on
    when s.status = 'canceled' then coalesce(s.period_end, s.trial_ends_on)
    else coalesce(s.period_end, s.trial_ends_on) + (select g.grace_days from public.sub_settings g where g.id = 1)
  end
$$;

-- 把訂閱狀態寫到兩套系統的授權。管理員帳號一律不動。
create or replace function sub_private.sync(uid uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare s public.sub_subscriptions; until date; bp text; em text; nm text;
begin
  select * into s from public.sub_subscriptions where user_id = uid;
  if s.id is null then return; end if;
  if exists (select 1 from public.bom_profiles p where p.user_id = uid and p.role = 'admin') then return; end if;
  until := sub_private.access_until(s);
  select p.bom_plan into bp from public.sub_plans p where p.code = s.plan;
  select u.email, left(coalesce(u.raw_user_meta_data->>'display_name', ''), 60) into em, nm from auth.users u where u.id = uid;
  -- 訂閱同步時不寄「顧問已開通」那類通知信（歡迎信由訂閱流程自己寄）
  perform set_config('sub.quiet', 'on', true);
  -- 先確保兩邊都有帳號列（損益中心的新增觸發程序會強制改成待開通），再一律用 update 寫入授權
  insert into public.bom_profiles (user_id, email, display_name, role, status, plan, note)
  values (uid, em, nm, 'client', 'pending', bp, '訂閱') on conflict (user_id) do nothing;
  insert into public.pl_profiles (user_id, email, display_name, role, status, note)
  values (uid, em, nm, 'owner', 'pending', '訂閱') on conflict (user_id) do nothing;
  update public.bom_profiles set status = 'active', plan = bp, access = 'edit', expires_on = until
  where user_id = uid and role <> 'admin';
  update public.pl_profiles set status = 'active', access = 'edit', expires_on = until
  where user_id = uid and role <> 'admin';
  perform set_config('sub.quiet', 'off', true);
end $$;

create or replace function sub_private.on_sub_change() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sub_subs_stamp on public.sub_subscriptions;
create trigger sub_subs_stamp before update on public.sub_subscriptions for each row execute function sub_private.on_sub_change();

-- 管理員直接改訂閱時，鎖住不該被改的欄位
create or replace function sub_private.guard() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  new.user_id := old.user_id; new.email := old.email; new.client_name := old.client_name;
  new.created_at := old.created_at; new.source := old.source;
  return new;
end $$;
drop trigger if exists sub_subs_guard on public.sub_subscriptions;
create trigger sub_subs_guard before update on public.sub_subscriptions for each row execute function sub_private.guard();

create or replace function sub_private.after_sub_change() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  perform sub_private.sync(new.user_id);
  if tg_op = 'UPDATE' and (new.status, new.plan, new.stores, new.period_end, new.trial_ends_on, new.auto_renew)
     is distinct from (old.status, old.plan, old.stores, old.period_end, old.trial_ends_on, old.auto_renew) then
    insert into public.sub_log (user_id, action, detail) values (new.user_id, 'change', jsonb_build_object(
      'from', jsonb_build_object('status', old.status, 'plan', old.plan, 'stores', old.stores, 'period_end', old.period_end, 'trial_ends_on', old.trial_ends_on, 'auto_renew', old.auto_renew),
      'to', jsonb_build_object('status', new.status, 'plan', new.plan, 'stores', new.stores, 'period_end', new.period_end, 'trial_ends_on', new.trial_ends_on, 'auto_renew', new.auto_renew)));
  end if;
  return null;
end $$;
drop trigger if exists sub_subs_sync on public.sub_subscriptions;
create trigger sub_subs_sync after insert or update on public.sub_subscriptions for each row execute function sub_private.after_sub_change();

-- ---------- 既有通知信：訂閱同步時不寄 ----------
create or replace function bom_private.profile_status_mail()
 returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if coalesce(current_setting('sub.quiet', true), '') = 'on' then return new; end if;
  if new.role = 'client' then
    if new.status = 'active' and old.status is distinct from 'active' then
      perform bom_private.mail_approval(new);
    elsif new.status = 'suspended' and old.status = 'active' then
      begin
        perform bom_private.send_mail('suspended', new.email, 'BOM 運算中心使用授權已停用',
          '<p>' || coalesce(nullif(bom_private.esc(left(new.display_name,60)), ''), '您好') || '，您好：</p><p>您的 BOM 運算中心使用授權目前已停用，暫時無法登入使用。</p><p>您的資料都完整保存著，沒有被刪除。如需恢復使用或取得資料，請與我們聯絡。</p>', 'marvintien90@gmail.com');
      exception when others then null; end;
    end if;
  end if;
  return new;
end $function$;

create or replace function pl_private.profile_status_mail()
 returns trigger language plpgsql security definer set search_path to '' as $function$
declare nm text := coalesce(nullif(pl_private.esc(new.display_name), ''), '您好');
begin
  if coalesce(current_setting('sub.quiet', true), '') = 'on' then return new; end if;
  if new.role = 'owner' then
    if new.status = 'active' and old.status is distinct from 'active' then
      begin
        perform pl_private.send_mail('approval', new.email, '損益分析中心帳號已開通',
          '<p>' || nm || '，您好：</p><p>您的損益分析中心帳號已經開通，現在可以用註冊時的 Email 與密碼登入，查看您的損益儀表板。</p>'
          || '<p><a href="https://marvintien90-jpg.github.io/pl-center/">前往損益分析中心</a></p>');
      exception when others then null; end;
    elsif new.status = 'suspended' and old.status = 'active' then
      begin
        perform pl_private.send_mail('suspended', new.email, '損益分析中心使用授權已停用',
          '<p>' || nm || '，您好：</p><p>您的損益分析中心使用授權目前已停用，暫時無法登入查看。</p><p>您的資料都完整保存著，沒有被刪除。如需恢復使用或取得資料，請與我們聯絡。</p>', 'marvintien90@gmail.com');
      exception when others then null; end;
    end if;
  end if;
  return new;
end $function$;

create or replace function pl_private.profile_notify()
 returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if coalesce(current_setting('sub.quiet', true), '') = 'on' then return new; end if;
  if new.role <> 'admin' then
    begin
      perform pl_private.send_mail('signup', 'marvintien90@gmail.com', '有新的業主註冊損益分析中心：' || new.email,
        '<p>有新的業主註冊損益分析中心，正在等待你開通：</p><p>名稱：' || coalesce(nullif(pl_private.esc(new.display_name), ''), '（未填）')
        || '<br>Email：' || pl_private.esc(new.email) || '</p>'
        || '<p><a href="https://marvintien90-jpg.github.io/pl-center/#admin">前往帳號與授權</a></p>');
    exception when others then null;
    end;
  end if;
  return new;
end $function$;

-- 原本的到期提醒信是「請聯絡顧問續約」：訂閱帳號改由訂閱排程寄自己的提醒，這裡跳過
create or replace function bom_private.expiry_reminders()
 returns integer language plpgsql security definer set search_path to '' as $function$
declare p public.bom_profiles; today date := (now() at time zone 'Asia/Taipei')::date; d integer; n integer := 0; nm text;
begin
  for p in select * from public.bom_profiles bp where bp.role = 'client' and bp.status = 'active' and bp.expires_on is not null
           and not exists (select 1 from public.sub_subscriptions s where s.user_id = bp.user_id) loop
    d := p.expires_on - today; nm := coalesce(nullif(bom_private.esc(left(p.display_name,60)), ''), '您好');
    if d < 0 and p.expired_for is distinct from p.expires_on then
      if bom_private.send_mail('expired', p.email, 'BOM 運算中心使用授權已到期',
        '<p>' || nm || '，您好：</p><p>您的 BOM 運算中心使用授權已於 ' || to_char(p.expires_on, 'YYYY/MM/DD') || ' 到期，目前暫時無法登入使用。</p><p>您的資料都完整保存著，續約後即可繼續使用。如需續約請與我們聯絡。</p>', 'marvintien90@gmail.com') then
        update public.bom_profiles set expired_for = p.expires_on where user_id = p.user_id; n := n + 1;
      end if;
    elsif d between 0 and 7 and p.remind7_for is distinct from p.expires_on then
      if bom_private.send_mail('expiry7', p.email, 'BOM 運算中心使用授權將於 ' || d || ' 天後到期',
        '<p>' || nm || '，您好：</p><p>您的 BOM 運算中心使用授權將於 ' || to_char(p.expires_on, 'YYYY/MM/DD') || ' 到期（剩 ' || d || ' 天）。</p><p>到期後將暫時無法登入，資料會完整保留。如需續約請與我們聯絡。</p>', 'marvintien90@gmail.com') then
        update public.bom_profiles set remind7_for = p.expires_on, remind30_for = p.expires_on where user_id = p.user_id; n := n + 1;
      end if;
    elsif d between 8 and 30 and p.remind30_for is distinct from p.expires_on then
      if bom_private.send_mail('expiry30', p.email, 'BOM 運算中心使用授權將於 ' || d || ' 天後到期',
        '<p>' || nm || '，您好：</p><p>提醒您，BOM 運算中心使用授權將於 ' || to_char(p.expires_on, 'YYYY/MM/DD') || ' 到期（剩 ' || d || ' 天）。</p><p>如需續約請與我們聯絡，我們會協助您無縫延續使用。</p>', 'marvintien90@gmail.com') then
        update public.bom_profiles set remind30_for = p.expires_on where user_id = p.user_id; n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $function$;

-- ---------- 自助試用 ----------
-- 損益中心以「客戶名稱」當資料鑰匙，所以自助建立的客戶名稱一定要是全新的，避免接到別人的資料
create or replace function sub_private.name_taken(cl text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.pl_statements where lower(client_name) = lower(cl))
      or exists (select 1 from public.pl_access where lower(client_name) = lower(cl))
      or exists (select 1 from public.pl_brand_settings where lower(client_name) = lower(cl))
      or exists (select 1 from public.pl_uploads where lower(client_name) = lower(cl))
      or exists (select 1 from public.pl_account_map where lower(client_name) = lower(cl))
      or exists (select 1 from public.bom_pl_link where lower(client_name) = lower(cl))
      or exists (select 1 from public.sub_subscriptions where lower(client_name) = lower(cl))
$$;

create or replace function sub_private.clean(t text, maxlen int) returns text
language sql immutable set search_path to '' as $$
  select nullif(left(regexp_replace(trim(coalesce(t, '')), '[[:cntrl:]<>]', '', 'g'), maxlen), '')
$$;

create or replace function public.sub_start_trial(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare uid uuid := (select auth.uid()); u auth.users; cfg public.sub_settings;
  co text := sub_private.clean(p->>'company', 60); br text := sub_private.clean(p->>'brand', 60);
  st text := coalesce(sub_private.clean(p->>'store', 60), '本店'); pl text := coalesce(p->>'plan', 'pro');
  n int; ph text := sub_private.clean(p->>'phone', 30); cl text; bid text; tend date; i int := 0;
begin
  if uid is null then raise exception 'SUB_LOGIN'; end if;
  select * into u from auth.users where id = uid;
  if u.email_confirmed_at is null then raise exception 'SUB_EMAIL_UNCONFIRMED'; end if;
  select * into cfg from public.sub_settings where id = 1;
  -- 自助註冊未開放時，只有管理員列入試點名單的 Email 可以開始試用
  if not cfg.signup_open and not exists (select 1 from public.sub_pilots x where lower(x.email) = lower(u.email)) then
    raise exception 'SUB_SIGNUP_CLOSED';
  end if;
  if exists (select 1 from public.bom_profiles where user_id = uid and role = 'admin') then raise exception 'SUB_ADMIN'; end if;
  if exists (select 1 from public.sub_subscriptions where user_id = uid) then raise exception 'SUB_EXISTS'; end if;
  -- 已經由顧問開通的客戶不走自助流程，避免兩套授權打架
  if exists (select 1 from public.bom_brand_access where user_id = uid) or exists (select 1 from public.pl_access where user_id = uid) then
    raise exception 'SUB_HAS_ACCESS';
  end if;
  if co is null or br is null then raise exception 'SUB_BAD_INPUT'; end if;
  if not exists (select 1 from public.sub_plans where code = pl and active) then raise exception 'SUB_BAD_PLAN'; end if;
  n := coalesce((p->>'stores')::int, 1);
  if n < 1 or n > 50 then raise exception 'SUB_BAD_INPUT'; end if;
  -- 防濫用：一天內全站試用數上限；同一 Email 網域不限（餐飲業者多用 gmail）
  if (select count(*) from public.sub_subscriptions where created_at > now() - interval '1 day' and source = 'self') >= cfg.max_trials_per_day then
    raise exception 'SUB_BUSY';
  end if;

  cl := co;
  while sub_private.name_taken(cl) loop
    i := i + 1;
    cl := co || '（' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '）';
    if i > 20 then raise exception 'SUB_BUSY'; end if;
  end loop;

  bid := 's' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  tend := sub_private.today() + cfg.trial_days;

  insert into public.bom_brands (id, name, data) values (bid, br || '・' || st, '{}'::jsonb);
  -- 先建訂閱：觸發程序會建立／開通兩套系統的帳號，接著才能指派品牌
  insert into public.sub_subscriptions (user_id, email, company, client_name, brand_name, store_name, bom_brand_id, plan, stores, status, trial_ends_on, phone, source)
  values (uid, u.email, co, cl, br, st, bid, pl, n, 'trial', tend, ph, 'self');
  insert into public.bom_brand_access (user_id, brand_id) values (uid, bid);
  insert into public.bom_pl_link (brand_id, client_name, brand_name, store_name) values (bid, cl, br, null);
  insert into public.pl_access (user_id, client_name, brand_name, store_name) values (uid, cl, br, null);
  insert into public.pl_brand_settings (client_name, brand_name, is_hq, biz_type, thresholds, util_variable_pct, label, annual_accounts)
  values (cl, br, false, 0, '{}'::jsonb, 50, '', '{}') on conflict do nothing;
  insert into public.sub_log (user_id, action, detail) values (uid, 'trial_start', jsonb_build_object('plan', pl, 'stores', n, 'client_name', cl, 'brand', bid));

  begin
    perform bom_private.send_mail('trial', u.email, '歡迎試用 BOM 運算中心＋損益分析中心（' || cfg.trial_days || ' 天）',
      '<p>' || bom_private.esc(co) || '，您好：</p><p>您的 ' || cfg.trial_days || ' 天免費試用已經開始，到 ' || to_char(tend, 'YYYY/MM/DD') || ' 為止，期間不會收費。</p>'
      || '<p>同一組帳號可以登入兩套系統：</p><ul><li><a href="https://marvintien90-jpg.github.io/bom-center/">BOM 運算中心</a>：建立食材、配方，算出每道菜的成本與毛利</li>'
      || '<li><a href="https://marvintien90-jpg.github.io/pl-center/">損益分析中心</a>：上傳每月損益表，看燈號、兩平點與診斷</li></ul>'
      || '<p>試用結束前可以在<a href="https://marvintien90-jpg.github.io/bom-center/member/">會員中心</a>選擇方案並綁定信用卡定期扣款，資料會完整延續。</p>', null);
    perform bom_private.send_mail('signup', 'marvintien90@gmail.com', '新的自助試用：' || co || '（' || u.email || '）',
      '<p>有業主自己開始試用：</p><p>公司：' || bom_private.esc(co) || '<br>品牌／門市：' || bom_private.esc(br || '・' || st) || '<br>方案：' || pl || '，' || n || ' 店'
      || '<br>Email：' || bom_private.esc(u.email) || coalesce('<br>電話：' || bom_private.esc(ph), '') || '<br>試用到：' || to_char(tend, 'YYYY/MM/DD') || '</p>', null);
  exception when others then null; end;

  return jsonb_build_object('client_name', cl, 'brand_id', bid, 'trial_ends_on', tend, 'plan', pl, 'stores', n);
end $$;
revoke execute on function public.sub_start_trial(jsonb) from public, anon;
grant execute on function public.sub_start_trial(jsonb) to authenticated;

-- 試用中可以自己改方案與店數；付費中的變更要重新授權信用卡，交給會員中心的「變更方案」走金流
create or replace function public.sub_set_plan(new_plan text, new_stores int) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s public.sub_subscriptions;
begin
  select * into s from public.sub_subscriptions where user_id = (select auth.uid()) for update;
  if s.id is null then raise exception 'SUB_NONE'; end if;
  if s.status <> 'trial' then raise exception 'SUB_PAID_CHANGE_NEEDS_CHECKOUT'; end if;
  if not exists (select 1 from public.sub_plans where code = new_plan and active) then raise exception 'SUB_BAD_PLAN'; end if;
  if new_stores is null or new_stores < 1 or new_stores > 50 then raise exception 'SUB_BAD_INPUT'; end if;
  update public.sub_subscriptions set plan = new_plan, stores = new_stores where id = s.id;
  return jsonb_build_object('plan', new_plan, 'stores', new_stores);
end $$;
revoke execute on function public.sub_set_plan(text, int) from public, anon;
grant execute on function public.sub_set_plan(text, int) to authenticated;

-- ---------- 金流回呼使用（只給 service role） ----------
-- 首期或每期扣款成功：延長期限、轉為 active
create or replace function public.sub_apply_payment(p_sub bigint, p_kind text, p_paid_on date, p_ref text, p_last4 text, p_plan text, p_stores int) returns void
language plpgsql security definer set search_path to '' as $$
declare s public.sub_subscriptions; base date;
begin
  select * into s from public.sub_subscriptions where id = p_sub for update;
  if s.id is null then raise exception 'SUB_NONE'; end if;
  if p_kind = 'first' then
    -- 試用剩下的天數保留：從試用結束日（或今天，取較晚者）開始算第一期
    base := greatest(coalesce(s.trial_ends_on, p_paid_on), p_paid_on);
    update public.sub_subscriptions set status = 'active', auto_renew = true, provider_ref = p_ref,
      card_last4 = coalesce(p_last4, card_last4), plan = coalesce(p_plan, plan), stores = coalesce(p_stores, stores),
      period_end = (base + interval '1 month')::date, canceled_at = null where id = s.id;
  else
    base := greatest(coalesce(s.period_end, p_paid_on), p_paid_on);
    update public.sub_subscriptions set status = case when status = 'canceled' then 'canceled' else 'active' end,
      period_end = (base + interval '1 month')::date where id = s.id;
  end if;
end $$;
revoke execute on function public.sub_apply_payment(bigint, text, date, text, text, text, int) from public, anon, authenticated;
grant execute on function public.sub_apply_payment(bigint, text, date, text, text, text, int) to service_role;

-- ---------- 每日排程：試用提醒、到期轉狀態 ----------
create or replace function sub_private.daily() returns integer
language plpgsql security definer set search_path to '' as $$
declare s public.sub_subscriptions; t date := sub_private.today(); n int := 0; g int; d int; until date;
begin
  select grace_days into g from public.sub_settings where id = 1;
  for s in select * from public.sub_subscriptions where status in ('trial','active','past_due','canceled') loop
    until := sub_private.access_until(s);
    if until < t then
      update public.sub_subscriptions set status = 'expired', auto_renew = false where id = s.id;
      perform bom_private.send_mail('expired', s.email, '您的 BOM 運算中心＋損益分析中心已到期',
        '<p>' || bom_private.esc(s.company) || '，您好：</p><p>您的' || case when s.status = 'trial' then '試用' else '訂閱' end || '已於 ' || to_char(until, 'YYYY/MM/DD') || ' 到期。資料都完整保存著，到<a href="https://marvintien90-jpg.github.io/bom-center/member/">會員中心</a>選擇方案後即可繼續使用。</p>', null);
      n := n + 1;
    elsif s.status = 'trial' then
      d := s.trial_ends_on - t;
      if d in (3, 0) and s.reminded_for is distinct from (s.trial_ends_on - d) then
        perform bom_private.send_mail('trial_end', s.email, case when d = 0 then '試用今天結束' else '試用剩 3 天' end || '：BOM 運算中心＋損益分析中心',
          '<p>' || bom_private.esc(s.company) || '，您好：</p><p>您的免費試用將於 ' || to_char(s.trial_ends_on, 'YYYY/MM/DD') || ' 結束。到<a href="https://marvintien90-jpg.github.io/bom-center/member/">會員中心</a>選擇方案並綁定信用卡，資料會完整延續；不續用也不會收費。</p>', null);
        update public.sub_subscriptions set reminded_for = s.trial_ends_on - d where id = s.id;
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'sub-daily') then perform cron.unschedule('sub-daily'); end if;
  perform cron.schedule('sub-daily', '20 2 * * *', 'select sub_private.daily()');
end $$;

-- ---------- 損益上傳：訂閱客戶自己的新分店不用等顧問審核 ----------
create or replace function sub_private.owns_client(cl text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.sub_subscriptions s where s.user_id = (select auth.uid()) and s.client_name = cl)
$$;

create or replace function public.pl_submit_upload(p jsonb)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare me public.pl_profiles; adm boolean := pl_private.is_admin(); cl text := trim(coalesce(p->>'client_name',''));
  br text := trim(coalesce(p->>'brand_name','')); st text := coalesce(nullif(trim(coalesce(p->>'store_name','')),''),'本店');
  ut text := coalesce(nullif(p->>'unit_type',''),'門市'); pm date; ci jsonb; it jsonb; comp jsonb; sd jsonb := '{}'::jsonb;
  rs text[] := '{}'; k text; uid bigint; st_out text;
begin
  select * into me from public.pl_profiles where user_id = (select auth.uid());
  if me.user_id is null or not pl_private.is_active() then raise exception 'PL_NOT_ACTIVE'; end if;
  if length(cl) not between 1 and 60 or length(br) not between 1 and 60 or length(st) > 60 or ut not in ('門市','總部') then raise exception 'PL_BAD_UNIT'; end if;
  if not adm and (me.access <> 'edit' or not pl_private.can_read(cl, br, st)) then raise exception 'PL_NO_UPLOAD_RIGHT'; end if;
  begin pm := date_trunc('month', (p->>'period_month')::date)::date; exception when others then raise exception 'PL_BAD_MONTH'; end;
  if pm is null or pm < date '2000-01-01' or pm > (now() at time zone 'Asia/Taipei')::date then raise exception 'PL_BAD_MONTH'; end if;
  ci := pl_private.clean_items(p->'items'); it := ci->0; comp := ci->1;
  foreach k in array array['R','C','O','N'] loop
    if jsonb_typeof(p->'stated'->k) = 'number' then
      sd := sd || jsonb_build_object(k, (p->'stated'->>k)::numeric);
      if abs((p->'stated'->>k)::numeric - (comp->>k)::numeric) > 0.5 then rs := rs || ('mismatch_' || k); end if;
    end if;
  end loop;
  if sd = '{}'::jsonb then rs := rs || 'no_totals'::text; end if;
  if exists (select 1 from jsonb_array_elements(it) e where e->>'k' = 'guess') then rs := rs || 'unknown_accounts'::text; end if;
  if exists (select 1 from public.pl_statements s where s.client_name = cl and s.brand_name = br and s.store_name = st and s.period_month = pm)
     and not (adm and coalesce((p->>'replace')::boolean, false)) then rs := rs || 'month_exists'::text; end if;
  if coalesce((p->>'name_mismatch')::boolean, false) then rs := rs || 'name_mismatch'::text; end if;
  -- 訂閱客戶的損益客戶名稱是系統替他建立的專屬名稱，自己開新分店不用等審核
  if not adm and not sub_private.owns_client(cl)
     and not exists (select 1 from public.pl_statements s where s.client_name = cl and s.brand_name = br and s.store_name = st) then
    rs := rs || 'new_store'::text; end if;
  insert into public.pl_uploads (user_id, uploader, client_name, brand_name, store_name, unit_type, period_month, file_name, file_path, items, stated, computed, reasons)
  values (me.user_id, me.email, cl, br, st, ut, pm, left(coalesce(p->>'file_name',''),200), nullif(left(coalesce(p->>'file_path',''),300),''), it, sd, comp, rs)
  returning id into uid;
  if rs <@ array['no_totals'] then
    perform pl_private.apply_upload(uid); st_out := 'imported';
  else st_out := 'review'; end if;
  if not adm then
    begin
      perform pl_private.send_mail('upload', 'marvintien90@gmail.com',
        case when st_out = 'imported' then '業主上傳損益表已自動建檔：' else '業主上傳損益表待你確認：' end || br || ' ' || st || ' ' || to_char(pm, 'YYYY-MM'),
        '<p>' || pl_private.esc(me.email) || ' 上傳了 ' || pl_private.esc(br || '・' || st) || ' ' || to_char(pm, 'YYYY-MM') || ' 的損益表。</p><p>'
        || case when st_out = 'imported' then '核對無誤，已自動建檔，儀表板已更新。' else '需要你確認後才會建檔。' end
        || '</p><p><a href="https://marvintien90-jpg.github.io/pl-center/#review">前往上傳審核</a></p>');
    exception when others then null; end;
  end if;
  return jsonb_build_object('id', uid, 'status', st_out, 'reasons', to_jsonb(rs));
end $function$;

-- ---------- 管理員：把既有顧問客戶轉成訂閱（試點用，例如一級棒讚） ----------
-- 沿用既有的品牌與損益客戶名稱，不另外建立資料；只有管理員能呼叫
create or replace function public.sub_admin_attach(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare uid uuid; em text := lower(trim(coalesce(p->>'email',''))); pl text := coalesce(p->>'plan','pro');
  n int := coalesce((p->>'stores')::int, 1); cl text := trim(coalesce(p->>'client_name',''));
  br text := trim(coalesce(p->>'brand_name','')); st text := coalesce(nullif(trim(coalesce(p->>'store_name','')),''),'本店');
  bid text := nullif(trim(coalesce(p->>'bom_brand_id','')),''); tend date := nullif(p->>'trial_ends_on','')::date;
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
  values (uid, em, left(coalesce(nullif(trim(p->>'company'),''), cl), 60), cl, br, st, bid, pl, n, 'trial',
          coalesce(tend, sub_private.today() + (select trial_days from public.sub_settings where id = 1)), 'admin', left(coalesce(p->>'note',''), 500));
  if bid is not null then
    insert into public.bom_brand_access (user_id, brand_id) values (uid, bid) on conflict do nothing;
  end if;
  if not exists (select 1 from public.pl_access a where a.user_id = uid and a.client_name = cl and a.brand_name = br) then
    insert into public.pl_access (user_id, client_name, brand_name, store_name) values (uid, cl, br, null);
  end if;
  insert into public.sub_log (user_id, action, detail) values (uid, 'admin_attach', p);
  return jsonb_build_object('user_id', uid, 'client_name', cl);
end $$;
revoke execute on function public.sub_admin_attach(jsonb) from public, anon;
grant execute on function public.sub_admin_attach(jsonb) to authenticated;

revoke execute on function sub_private.daily() from public;

-- 從會員中心註冊（app = sub）的人，不寄「等待開通」信給顧問；開始試用時才寄通知
create or replace function bom_private.handle_new_user()
 returns trigger language plpgsql security definer set search_path to '' as $function$
declare is_owner boolean := lower(new.email) = 'marvintien90@gmail.com'; app text := coalesce(new.raw_user_meta_data->>'app', '');
begin
  if app = 'pl' then
    begin
      insert into public.pl_profiles (user_id, email, display_name)
      values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 60))
      on conflict (user_id) do nothing;
    exception when others then null;
    end;
    begin
      insert into public.bom_profiles (user_id, email, display_name, role, status, plan, note)
      values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 60), 'client', 'pending', 'basic', '來自損益分析系統')
      on conflict (user_id) do nothing;
    exception when others then null;
    end;
    return new;
  end if;
  insert into public.bom_profiles (user_id, email, display_name, role, status, plan, note)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'display_name', ''),60),
          case when is_owner then 'admin' else 'client' end,
          case when is_owner then 'active' else 'pending' end,
          case when is_owner then 'pro' else 'basic' end,
          case when app = 'sub' then '會員中心註冊' else null end)
  on conflict (user_id) do nothing;
  if not is_owner and app <> 'sub' then
    begin
      perform bom_private.send_mail('signup', 'marvintien90@gmail.com', '有新的業主註冊 BOM 運算中心：' || new.email,
        '<p>有新的業主註冊，正在等待你開通：</p><p>名稱：' || coalesce(nullif(bom_private.esc(left(new.raw_user_meta_data->>'display_name',60)), ''), '（未填）')
        || '<br>Email：' || bom_private.esc(new.email) || '</p>'
        || '<p><a href="https://marvintien90-jpg.github.io/bom-center/#admin">前往授權管理</a></p>');
    exception when others then null;
    end;
  end if;
  return new;
end $function$;
