-- 餐飲經營健檢：預約名單（2026-11-04）
-- 公開頁 /bom-center/checkup/ 的「預約免費解讀」寫進這裡。
-- 規則：
--   1. 匿名訪客只能透過 checkup_submit() 新增一筆，不能讀、改、刪任何一筆。
--   2. 只有管理員（bom_private.is_admin()）能看與更新名單。
--   3. 每天全站最多 200 筆，避免被灌爆；欄位長度與 JSON 大小都有上限。
--   4. 每筆新名單寄一封通知信給 Marvin（寄信失敗不影響寫入）。

create table if not exists public.checkup_leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  brand text, biz_type text, stores int, years text,
  contact_name text not null, phone text, line_id text, email text,
  consent boolean not null,
  answers jsonb not null default '{}'::jsonb,
  finance jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  total int,
  source text,
  status text not null default '新名單' check (status in ('新名單','已聯絡','已預約','已成交','不需要')),
  note text
);
create index if not exists checkup_leads_created on public.checkup_leads (created_at desc);

alter table public.checkup_leads enable row level security;
drop policy if exists checkup_leads_admin_select on public.checkup_leads;
create policy checkup_leads_admin_select on public.checkup_leads for select to authenticated using (bom_private.is_admin());
drop policy if exists checkup_leads_admin_update on public.checkup_leads;
create policy checkup_leads_admin_update on public.checkup_leads for update to authenticated using (bom_private.is_admin()) with check (bom_private.is_admin());
revoke all on public.checkup_leads from anon;
grant select, update on public.checkup_leads to authenticated;

create schema if not exists checkup_private;
revoke all on schema checkup_private from public, anon, authenticated;

create or replace function checkup_private.clean(t text, maxlen int) returns text
language sql immutable set search_path to '' as $$
  select nullif(left(regexp_replace(trim(coalesce(t, '')), '[[:cntrl:]<>]', '', 'g'), maxlen), '')
$$;

create or replace function public.checkup_submit(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  c jsonb := coalesce(p->'contact', '{}'::jsonb);
  i jsonb := coalesce(p->'info', '{}'::jsonb);
  nm text := checkup_private.clean(c->>'name', 40);
  ph text := checkup_private.clean(c->>'phone', 20);
  ln text := checkup_private.clean(c->>'line', 40);
  em text := checkup_private.clean(c->>'email', 120);
  br text := checkup_private.clean(i->>'brand', 60);
  ans jsonb := coalesce(p->'answers', '{}'::jsonb);
  fin jsonb := coalesce(p->'fin', '{}'::jsonb);
  sc jsonb := coalesce(p->'scores', '{}'::jsonb);
  tot int; st int; new_id bigint;
begin
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception '需要同意聯絡'; end if;
  if nm is null then raise exception '請填稱呼'; end if;
  if ph is null and ln is null and em is null then raise exception '至少留一種聯絡方式'; end if;
  if em is not null and em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Email 格式不正確'; end if;
  if jsonb_typeof(ans) <> 'object' or jsonb_typeof(fin) <> 'object' or jsonb_typeof(sc) <> 'object' then raise exception '資料格式不正確'; end if;
  if length(ans::text) > 4000 or length(fin::text) > 1000 or length(sc::text) > 500 then raise exception '資料過大'; end if;
  if (select count(*) from public.checkup_leads where created_at > now() - interval '1 day') >= 200 then raise exception 'daily limit'; end if;
  begin tot := least(greatest((p->>'total')::int, 0), 100); exception when others then tot := null; end;
  begin st := least(greatest((i->>'stores')::int, 1), 999); exception when others then st := null; end;

  insert into public.checkup_leads (brand, biz_type, stores, years, contact_name, phone, line_id, email, consent, answers, finance, scores, total, source)
  values (br, checkup_private.clean(i->>'biz', 30), st, checkup_private.clean(i->>'years', 20), nm, ph, ln, em, true, ans, fin, sc, tot, checkup_private.clean(p->>'source', 40))
  returning id into new_id;

  begin
    perform bom_private.send_mail('checkup', 'marvintien90@gmail.com',
      '新的經營健檢預約：' || coalesce(br, nm) || '（' || coalesce(tot::text, '-') || ' 分）',
      '<p>品牌：' || coalesce(bom_private.esc(br), '-') || '</p><p>稱呼：' || bom_private.esc(nm) ||
      '</p><p>手機：' || coalesce(bom_private.esc(ph), '-') || '　LINE：' || coalesce(bom_private.esc(ln), '-') || '　Email：' || coalesce(bom_private.esc(em), '-') ||
      '</p><p>總分：' || coalesce(tot::text, '-') || '</p><p>各構面：' || bom_private.esc(sc::text) || '</p><p>名單編號 ' || new_id || '，在 Supabase 表 checkup_leads 查看完整答案。</p>', null);
  exception when others then null; end;

  return jsonb_build_object('id', new_id);
end $$;
revoke execute on function public.checkup_submit(jsonb) from public;
grant execute on function public.checkup_submit(jsonb) to anon, authenticated;
