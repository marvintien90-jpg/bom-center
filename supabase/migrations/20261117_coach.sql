-- 營運輔導系統（顧問專用）：客戶、訪視紀錄、待辦、KPI 月追蹤。
-- 只有 bom 管理員（bom_private.is_admin()）能讀寫，業主帳號完全看不到。
create table if not exists public.coach_clients (
  id bigint generated always as identity primary key,
  name text not null,
  stage text not null default '輔導中' check (stage in ('洽談中','輔導中','暫停','結案')),
  contact_name text, phone text, line_id text, email text,
  biz_type text, stores integer,
  brand_id text references public.bom_brands(id) on delete set null,
  pl_client text, pl_brand text,
  lead_id bigint references public.checkup_leads(id) on delete set null,
  start_on date, end_on date, monthly_fee integer, visit_every_days integer default 14,
  goals jsonb not null default '[]'::jsonb,   -- [{kpi,label,target,dir:'down'|'up'}]
  note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.coach_clients is '營運輔導：輔導客戶與輔導計畫（顧問專用）';

create table if not exists public.coach_visits (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.coach_clients(id) on delete cascade,
  visit_on date not null default current_date,
  kind text not null default '到店訪視' check (kind in ('到店訪視','線上會議','電話','稽核','教育訓練')),
  store text, attendees text,
  summary text, findings text,
  q_score integer check (q_score between 0 and 100),
  s_score integer check (s_score between 0 and 100),
  c_score integer check (c_score between 0 and 100),
  share boolean not null default true,         -- 是否放進給業主的進度報告
  created_at timestamptz not null default now()
);
comment on table public.coach_visits is '營運輔導：訪視／會議紀錄（顧問專用）';

create table if not exists public.coach_actions (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.coach_clients(id) on delete cascade,
  visit_id bigint references public.coach_visits(id) on delete set null,
  title text not null,
  side text not null default '業主' check (side in ('業主','顧問')),
  assignee text, due_on date,
  priority text not null default '中' check (priority in ('高','中','低')),
  status text not null default '待辦' check (status in ('待辦','進行中','卡關','已完成')),
  done_on date, result text,
  share boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.coach_actions is '營運輔導：改善待辦與追蹤（顧問專用）';

create table if not exists public.coach_kpis (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.coach_clients(id) on delete cascade,
  month date not null,               -- 每月 1 號
  revenue numeric, food_pct numeric, labor_pct numeric, rent_pct numeric, net_pct numeric,
  avg_ticket numeric, guests numeric, qsc numeric,
  source text not null default '手動' check (source in ('手動','損益中心')),
  note text,
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);
comment on table public.coach_kpis is '營運輔導：每月 KPI（手動或從損益中心帶入；顧問專用）';

create index if not exists coach_visits_client on public.coach_visits(client_id, visit_on desc);
create index if not exists coach_actions_client on public.coach_actions(client_id, status, due_on);
create index if not exists coach_actions_visit on public.coach_actions(visit_id);
create index if not exists coach_clients_brand on public.coach_clients(brand_id);
create index if not exists coach_clients_lead on public.coach_clients(lead_id);

do $$ declare t text; begin
  foreach t in array array['coach_clients','coach_visits','coach_actions','coach_kpis'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select bom_private.is_admin())) with check ((select bom_private.is_admin()))', t||'_admin', t);
  end loop;
end $$;

-- 從損益中心算每月 KPI（只給管理員）
create or replace function public.coach_pl_months(p_client text, p_brand text)
returns table(month date, revenue numeric, food_pct numeric, labor_pct numeric, rent_pct numeric, net_pct numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select st.id, st.period_month, st.stated_revenue, st.stated_net
    from public.pl_statements st
    where (select bom_private.is_admin()) and st.client_name = p_client
      and (coalesce(p_brand,'') = '' or st.brand_name = p_brand)
  ), m as (
    select date_trunc('month', s.period_month)::date as month,
      sum(s.stated_revenue) rev, sum(s.stated_net) net,
      sum((select coalesce(sum(li.amount),0) from public.pl_line_items li where li.statement_id = s.id and li.category = '食材成本')) food,
      sum((select coalesce(sum(li.amount),0) from public.pl_line_items li where li.statement_id = s.id and li.category = '人事費用')) labor,
      sum((select coalesce(sum(li.amount),0) from public.pl_line_items li where li.statement_id = s.id and li.category = '租金')) rent
    from s group by 1
  )
  select month, round(rev),
    case when rev > 0 then round(food*100/rev,1) end,
    case when rev > 0 then round(labor*100/rev,1) end,
    case when rev > 0 then round(rent*100/rev,1) end,
    case when rev > 0 then round(net*100/rev,1) end
  from m order by month
$$;
revoke all on function public.coach_pl_months(text,text) from public, anon;
grant execute on function public.coach_pl_months(text,text) to authenticated;

-- 損益中心有哪些客戶（下拉選單用，只給管理員）
create or replace function public.coach_pl_clients()
returns table(client_name text, brand_name text)
language sql stable security definer set search_path = '' as $$
  select distinct st.client_name, st.brand_name from public.pl_statements st
  where (select bom_private.is_admin()) order by 1, 2
$$;
revoke all on function public.coach_pl_clients() from public, anon;
grant execute on function public.coach_pl_clients() to authenticated;
