-- 人資與勞基法中心：員工名單與公司設定（雲端存放，跨裝置共用）。已於 2026-11-16 套用。
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'ft' check (kind in ('ft','pt')),
  data jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_employees_user_idx on public.hr_employees(user_id);
alter table public.hr_employees enable row level security;
create policy hr_employees_own_select on public.hr_employees for select to authenticated using (user_id = (select auth.uid()));
create policy hr_employees_own_insert on public.hr_employees for insert to authenticated with check (user_id = (select auth.uid()));
create policy hr_employees_own_update on public.hr_employees for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy hr_employees_own_delete on public.hr_employees for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.hr_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.hr_settings enable row level security;
create policy hr_settings_own_select on public.hr_settings for select to authenticated using (user_id = (select auth.uid()));
create policy hr_settings_own_insert on public.hr_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy hr_settings_own_update on public.hr_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.hr_employees to authenticated;
grant select, insert, update on public.hr_settings to authenticated;
