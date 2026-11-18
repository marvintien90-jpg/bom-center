-- SOP 手冊產生器＋督導稽核（2026-11-18）
-- 1) sop_manuals：顧問端的 SOP 手冊母檔（只有管理員可讀寫）
-- 2) qsc_audits：門市稽核摘要（稽核本體在 bom_brands.data.audits，完成時同步一列摘要，給督導總覽與加盟督導讀分數）
-- 3) Storage qsc-photos：稽核缺失照片，路徑 <brand_id>/<audit_id>/<檔名>

create table if not exists public.sop_manuals (
  id bigint generated always as identity primary key,
  title text not null,
  biz_type text not null default '通用',
  client_name text,
  brand_id text references public.bom_brands(id) on delete set null,
  coach_client_id bigint,
  sections jsonb not null default '[]'::jsonb,
  status text not null default '草稿' check (status in ('草稿','已交付')),
  version int not null default 1,
  published_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
comment on table public.sop_manuals is 'SOP 手冊母檔（顧問專用）。sections = [{id,name,when,steps:[{id,text,std,role,audit}]}]';
create index if not exists sop_manuals_brand on public.sop_manuals(brand_id);

alter table public.sop_manuals enable row level security;
revoke all on public.sop_manuals from anon;
grant select, insert, update, delete on public.sop_manuals to authenticated;
drop policy if exists sop_manuals_admin on public.sop_manuals;
create policy sop_manuals_admin on public.sop_manuals for all to authenticated
  using ((select bom_private.is_admin())) with check ((select bom_private.is_admin()));

create table if not exists public.qsc_audits (
  audit_id text primary key,
  brand_id text not null references public.bom_brands(id) on delete cascade,
  store text,
  audit_date date not null,
  kind text not null default 'self' check (kind in ('self','supervisor')),
  auditor text,
  score int check (score between 0 and 100),
  item_count int not null default 0,
  bad_count int not null default 0,
  open_count int not null default 0,
  overdue_count int not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.qsc_audits is '門市稽核摘要：BOM 中心「門市稽核」完成或改善時同步。kind self=門市自檢, supervisor=督導巡店';
create index if not exists qsc_audits_brand on public.qsc_audits(brand_id, audit_date desc);

alter table public.qsc_audits enable row level security;
revoke all on public.qsc_audits from anon;
grant select, insert, update, delete on public.qsc_audits to authenticated;
drop policy if exists qsc_audits_select on public.qsc_audits;
drop policy if exists qsc_audits_insert on public.qsc_audits;
drop policy if exists qsc_audits_update on public.qsc_audits;
drop policy if exists qsc_audits_delete on public.qsc_audits;
create policy qsc_audits_select on public.qsc_audits for select to authenticated using (bom_private.can_read(brand_id));
create policy qsc_audits_insert on public.qsc_audits for insert to authenticated with check (bom_private.can_write(brand_id));
create policy qsc_audits_update on public.qsc_audits for update to authenticated using (bom_private.can_write(brand_id)) with check (bom_private.can_write(brand_id));
create policy qsc_audits_delete on public.qsc_audits for delete to authenticated using (bom_private.can_write(brand_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qsc-photos', 'qsc-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists qsc_photos_read on storage.objects;
drop policy if exists qsc_photos_insert on storage.objects;
drop policy if exists qsc_photos_delete on storage.objects;
create policy qsc_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'qsc-photos' and bom_private.can_read((storage.foldername(name))[1]));
create policy qsc_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'qsc-photos' and bom_private.can_write((storage.foldername(name))[1]));
create policy qsc_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'qsc-photos' and bom_private.can_write((storage.foldername(name))[1]));
