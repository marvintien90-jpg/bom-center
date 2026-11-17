-- 加盟體系規劃與管理（顧問專用）：加盟方案、加盟店、督導紀錄、權利金繳款。
-- 只有 bom 管理員（bom_private.is_admin()）能讀寫，業主帳號完全看不到。
create table if not exists public.fr_plans (
  id bigint generated always as identity primary key,
  name text not null,                          -- 品牌／客戶名稱
  status text not null default '規劃中' check (status in ('規劃中','招募中','營運中','暫停')),
  coach_client_id bigint,                      -- 對應營運輔導客戶（coach_clients.id，可空）
  brand_id text,                               -- 對應 BOM 品牌（可空）
  pl_client text, pl_brand text,               -- 對應損益中心（可空）
  data jsonb not null default '{}'::jsonb,     -- 準備度、模式、試算、合約清單
  note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.fr_plans is '加盟體系：每個品牌的加盟方案（顧問專用）';

create table if not exists public.fr_stores (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.fr_plans(id) on delete cascade,
  name text not null,                          -- 門市名稱
  kind text not null default '加盟' check (kind in ('直營','加盟','委託加盟','合作經營')),
  status text not null default '營運中' check (status in ('籌備中','營運中','輔導改善','解約／結束')),
  owner_name text, phone text, line_id text, address text,
  brand_id text,                               -- 對應 BOM 品牌（讀稽核分數 qsc_audits 用）
  open_on date, contract_end date,
  royalty_mode text not null default 'pct' check (royalty_mode in ('pct','fixed')),
  royalty_value numeric,                       -- pct：營業額 %；fixed：每月固定金額
  mkt_pct numeric,                             -- 行銷基金 %
  note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.fr_stores is '加盟體系：加盟店／直營店名冊（顧問專用）';

create table if not exists public.fr_visits (
  id bigint generated always as identity primary key,
  store_id bigint not null references public.fr_stores(id) on delete cascade,
  visit_on date not null default current_date,
  kind text not null default '督導訪店' check (kind in ('督導訪店','神秘客','教育訓練','電話／線上','違約處理')),
  qsc integer check (qsc between 0 and 100),
  findings text, actions text, due_on date,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.fr_visits is '加盟體系：加盟店督導紀錄（顧問專用）';

create table if not exists public.fr_dues (
  id bigint generated always as identity primary key,
  store_id bigint not null references public.fr_stores(id) on delete cascade,
  month date not null,                         -- 每月 1 號
  sales numeric, royalty numeric, mkt numeric,
  paid numeric, paid_on date, note text,
  updated_at timestamptz not null default now(),
  unique (store_id, month)
);
comment on table public.fr_dues is '加盟體系：每月營業額回報與權利金／行銷基金繳款（顧問專用）';

create index if not exists fr_stores_plan on public.fr_stores(plan_id);
create index if not exists fr_visits_store on public.fr_visits(store_id, visit_on desc);
create index if not exists fr_dues_store on public.fr_dues(store_id, month desc);

do $$ declare t text; begin
  foreach t in array array['fr_plans','fr_stores','fr_visits','fr_dues'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select bom_private.is_admin())) with check ((select bom_private.is_admin()))', t||'_admin', t);
  end loop;
end $$;
