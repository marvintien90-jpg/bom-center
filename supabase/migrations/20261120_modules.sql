-- 餐策雲 DineOS：系統模組授權（2026-11-20）
-- 1) 每個訂閱方案包含哪些系統模組（sub_plans.modules）
-- 2) 顧問個別開通的模組（sub_module_grants），給沒有訂閱、或要額外加開的業主
-- 3) sub_my_modules()：目前登入者可用的模組；bom_private.has_module()：資料庫端擋權限
-- 4) 人資中心的寫入改成要有 hr 模組
-- 模組代號：bom＝BOM 運算中心、pl＝損益分析中心、hr＝人資與勞基法中心。之後新系統加新代號即可。

alter table public.sub_plans add column if not exists modules text[] not null default '{bom,pl}';
update public.sub_plans set modules = '{bom,pl}' where code = 'basic';
update public.sub_plans set modules = '{bom,pl,hr}' where code in ('pro','member');

create table if not exists public.sub_module_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module ~ '^[a-z0-9_]{1,20}$'),
  until date,
  note text check (length(note) <= 200),
  granted_at timestamptz not null default now(),
  granted_by uuid default auth.uid(),
  primary key (user_id, module)
);
alter table public.sub_module_grants enable row level security;
drop policy if exists sub_grants_select on public.sub_module_grants;
create policy sub_grants_select on public.sub_module_grants for select to authenticated
  using (user_id = (select auth.uid()) or bom_private.is_admin());
drop policy if exists sub_grants_admin on public.sub_module_grants;
create policy sub_grants_admin on public.sub_module_grants for all to authenticated
  using (bom_private.is_admin()) with check (bom_private.is_admin());

-- 某位使用者可用的模組：管理員全部；訂閱有效時用方案的模組；加上顧問個別開通且未過期的
create or replace function sub_private.modules_of(p_uid uuid)
returns table(module text, until date, source text)
language sql stable security definer set search_path to ''
as $$
  with adm as (
    select exists(select 1 from public.bom_profiles b where b.user_id = p_uid and b.role = 'admin' and b.status = 'active') a
  ), s as (
    select x.*, sub_private.access_until(x) au from public.sub_subscriptions x where x.user_id = p_uid
  )
  select m, null::date, 'admin' from adm, unnest(array['bom','pl','hr']) m where adm.a
  union all
  select m, s.au, 'sub' from s join public.sub_plans pl on pl.code = s.plan, unnest(pl.modules) m
   where not (select a from adm) and (s.au is null and s.status = 'comp' or s.au >= sub_private.today())
  union all
  select g.module, g.until, 'grant' from public.sub_module_grants g
   where g.user_id = p_uid and not (select a from adm) and (g.until is null or g.until >= sub_private.today())
$$;

create or replace function bom_private.has_module(p_module text)
returns boolean language sql stable security definer set search_path to ''
as $$ select exists(select 1 from sub_private.modules_of((select auth.uid())) m where m.module = p_module) $$;

create or replace function public.sub_my_modules()
returns table(module text, until date, source text)
language sql stable security definer set search_path to ''
as $$ select * from sub_private.modules_of((select auth.uid())) $$;
revoke all on function public.sub_my_modules() from public, anon;
grant execute on function public.sub_my_modules() to authenticated;
grant execute on function bom_private.has_module(text) to authenticated;
revoke all on function sub_private.modules_of(uuid) from public, anon, authenticated;
revoke all on function bom_private.has_module(text) from public, anon;

-- 人資中心：新增與修改要有 hr 模組（讀自己的資料不變）
drop policy if exists hr_settings_own_insert on public.hr_settings;
create policy hr_settings_own_insert on public.hr_settings for insert to authenticated
  with check (user_id = (select auth.uid()) and bom_private.has_module('hr'));
drop policy if exists hr_settings_own_update on public.hr_settings;
create policy hr_settings_own_update on public.hr_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and bom_private.has_module('hr'));
drop policy if exists hr_employees_own_insert on public.hr_employees;
create policy hr_employees_own_insert on public.hr_employees for insert to authenticated
  with check (user_id = (select auth.uid()) and bom_private.has_module('hr'));
drop policy if exists hr_employees_own_update on public.hr_employees;
create policy hr_employees_own_update on public.hr_employees for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and bom_private.has_module('hr'));
