-- 經營健檢導流升級（2026-11-17）：記錄方便時段與最想解決的問題、LINE 設定、新名單即時 LINE 通知、業主結果信加上聯絡 Marvin 按鈕
alter table public.checkup_leads add column if not exists pref text, add column if not exists topic text;

create table if not exists checkup_private.cfg (k text primary key, v text);
alter table checkup_private.cfg enable row level security;
insert into checkup_private.cfg (k, v) values ('line_url', ''), ('line_id', '') on conflict (k) do nothing;
-- Marvin 的 LINE 官方帳號加好友連結
update checkup_private.cfg set v = 'https://lin.ee/qKdrAkh' where k = 'line_url';

create or replace function public.checkup_cfg()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'line_url', coalesce((select v from checkup_private.cfg where k = 'line_url'), ''),
    'line_id',  coalesce((select v from checkup_private.cfg where k = 'line_id'), ''));
$$;
revoke all on function public.checkup_cfg() from public;
grant execute on function public.checkup_cfg() to anon, authenticated;

create or replace function checkup_private.src_name(s text)
returns text language sql immutable set search_path to '' as $$
  select case coalesce(s, '')
    when 's01_fb' then 'S01 Facebook' when 's01_ig' then 'S01 Instagram' when 's01_threads' then 'S01 Threads' when 's01_web' then 'S01 官網'
    when 'ig' then 'IG' when 'fb' then 'FB' when 'line' then 'LINE' when 'ref_fb' then 'FB（自然點入）' when 'ref_ig' then 'IG（自然點入）'
    when 'ref_threads' then 'Threads（自然點入）' when 'ref_line' then 'LINE（自然點入）' when 'ref_google' then 'Google 搜尋' when 'ref_web' then '官網（自然點入）'
    when '' then '直接開啟' else s end;
$$;

create or replace function checkup_private.urlenc(t text)
returns text language sql immutable set search_path to '' as $$
  select coalesce(string_agg(case when b < 128 and chr(b) ~ '[A-Za-z0-9._~-]' then chr(b) else '%' || upper(lpad(to_hex(b), 2, '0')) end, '' order by i), '')
  from (select i, get_byte(convert_to(t, 'UTF8'), i) b from generate_series(0, octet_length(convert_to(coalesce(t, ''), 'UTF8')) - 1) i) x;
$$;

create or replace function checkup_private.line_btn(l public.checkup_leads)
returns text language plpgsql stable security definer set search_path to '' as $$
declare u text; id text; t text;
begin
  select v into u from checkup_private.cfg where k = 'line_url';
  select v into id from checkup_private.cfg where k = 'line_id';
  t := 'Marvin 你好，我是' || coalesce(l.brand, l.contact_name) || '，剛做完經營健檢（' || coalesce(l.total::text, '-') || ' 分），想約時間聊聊。';
  if coalesce(id, '') ~ '^@?[A-Za-z0-9._-]{2,30}$' then
    u := 'https://line.me/R/oaMessage/' || checkup_private.urlenc(case when id like '@%' then id else '@' || id end) || '/?' || checkup_private.urlenc(t);
  elsif coalesce(u, '') !~ '^https://(lin\.ee|line\.me)/' then return '';
  end if;
  return '<p style="margin:18px 0"><a href="' || bom_private.esc(u) || '" style="background:#06c755;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">加 LINE 直接問 Marvin</a></p>';
end $$;

create or replace function public.checkup_submit(p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
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
  insert into public.checkup_leads (brand, biz_type, stores, years, contact_name, phone, line_id, email, consent, answers, finance, scores, total, source, pref, topic)
  values (br, checkup_private.clean(i->>'biz', 30), st, checkup_private.clean(i->>'years', 20), nm, ph, ln, em, true, ans, fin, sc, tot,
          checkup_private.clean(p->>'source', 40), checkup_private.clean(c->>'pref', 20), checkup_private.clean(c->>'topic', 30))
  returning id into new_id;
  perform checkup_private.notify(new_id);
  begin
    perform notify.line_push('🔥 新的健檢預約' || chr(10) || coalesce(br, '（未填品牌）') || '｜' || nm || '　' || coalesce(tot::text, '-') || ' 分' || chr(10) ||
      '來源：' || checkup_private.src_name(checkup_private.clean(p->>'source', 40)) ||
      coalesce(chr(10) || '方便時段：' || checkup_private.clean(c->>'pref', 20), '') || coalesce(chr(10) || '想先解決：' || checkup_private.clean(c->>'topic', 30), '') || chr(10) ||
      coalesce('手機 ' || ph || '　', '') || coalesce('LINE ' || ln, '') || chr(10) ||
      'https://marvintien90-jpg.github.io/bom-center/checkup/leads/?id=' || new_id);
  exception when others then null;
  end;
  if em is not null and (select count(*) from public.checkup_leads where lower(email) = lower(em) and created_at > now() - interval '1 day') <= 3 then
    perform checkup_private.owner_mail(new_id);
  end if;
  return jsonb_build_object('id', new_id, 'mailed', em is not null);
end $function$;

-- 顧問通知信：加上來源、方便時段、最想解決
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('checkup_private.notify(bigint)'::regprocedure);
  n := replace(d, $a$'<p style="margin:10px 0 0">總分 <b style="font-size:22px">'$a$,
    $b$'<p style="margin:8px 0 0;color:#5d6a65">來源：' || checkup_private.src_name(l.source) || coalesce('｜方便時段：' || bom_private.esc(l.pref), '') || coalesce('｜想先解決：' || bom_private.esc(l.topic), '') || '</p>' || '<p style="margin:10px 0 0">總分 <b style="font-size:22px">'$b$);
  if n = d and position('src_name' in d) = 0 then raise exception 'notify 內容跟預期不同，沒有修改'; end if;
  execute n;
  -- 業主結果信：加上「加 LINE 直接問 Marvin」按鈕（有設定 LINE 才出現）
  d := pg_get_functiondef('checkup_private.owner_mail(bigint)'::regprocedure);
  n := replace(d, $a$'<p style="margin:18px 0"><a href="https://marvintien90-jpg.github.io/bom-center/checkup/"$a$,
    $b$checkup_private.line_btn(l) || '<p style="margin:18px 0"><a href="https://marvintien90-jpg.github.io/bom-center/checkup/"$b$);
  if n = d and position('line_btn' in d) = 0 then raise exception 'owner_mail 內容跟預期不同，沒有修改'; end if;
  execute n;
end $do$;
