-- 文件中心（顧問專用）：每位輔導客戶的總部內部文件，依「部門 × 事件」產出，保留每一版。
-- 只有 bom 管理員（bom_private.is_admin()）能讀寫，業主帳號完全看不到。
create table if not exists public.doc_items (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.coach_clients(id) on delete cascade,
  tpl text not null,                       -- 範本代號（consult/docs/library.js）
  dept text not null, ev text, kind text,
  title text not null,
  doc_no text,
  version integer not null default 1,
  status text not null default '草稿' check (status in ('草稿','定稿','已發布','停用')),
  fields jsonb not null default '{}'::jsonb,
  body text not null default '',
  review_days integer not null default 180,
  next_review date,
  action_id bigint references public.coach_actions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.doc_items is '文件中心：客戶總部內部文件（顧問專用）';

create table if not exists public.doc_versions (
  id bigint generated always as identity primary key,
  doc_id bigint not null references public.doc_items(id) on delete cascade,
  version integer not null,
  title text, body text, fields jsonb,
  note text,                               -- 這一版改了什麼
  created_at timestamptz not null default now(),
  unique (doc_id, version)
);
comment on table public.doc_versions is '文件中心：每份文件的歷次版本（顧問專用）';

create index if not exists doc_items_client on public.doc_items(client_id, dept);
create index if not exists doc_items_review on public.doc_items(next_review);
create index if not exists doc_items_action on public.doc_items(action_id);
create index if not exists doc_versions_doc on public.doc_versions(doc_id, version desc);

do $$ declare t text; begin
  foreach t in array array['doc_items','doc_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select bom_private.is_admin())) with check ((select bom_private.is_admin()))', t||'_admin', t);
  end loop;
end $$;
