-- 總部組織與權責診斷（顧問專用）：每位客戶一份規劃，組織圖／RACI／KPI 都存在 data（jsonb）。
-- 只有 bom 管理員（bom_private.is_admin()）能讀寫，業主帳號完全看不到。
-- 需要先有 public.coach_clients（營運輔導 20261117_coach.sql）。
create table if not exists public.org_plans (
  id bigint generated always as identity primary key,
  client_id bigint references public.coach_clients(id) on delete set null,
  client_name text,
  title text,
  biz_type text,
  stores integer not null default 1 check (stores >= 1),
  target_stores integer check (target_stores >= 1),
  franchise boolean not null default false,
  data jsonb not null default '{}'::jsonb,   -- {asis:{positions:[]}, tobe, gov, override, raci, notes, dutyOff}
  rev integer not null default 1,            -- 樂觀鎖：存檔時比對，避免兩個視窗互蓋
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_plans_named check (client_id is not null or coalesce(client_name,'') <> '')
);
comment on table public.org_plans is '總部組織與權責診斷：組織圖、職責、RACI、主管 KPI（顧問專用）';
create index if not exists org_plans_client on public.org_plans(client_id);

alter table public.org_plans enable row level security;
revoke all on public.org_plans from anon;
grant select, insert, update, delete on public.org_plans to authenticated;
drop policy if exists org_plans_admin on public.org_plans;
create policy org_plans_admin on public.org_plans for all to authenticated
  using ((select bom_private.is_admin())) with check ((select bom_private.is_admin()));
