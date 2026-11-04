-- 經營健檢通知信 v2（2026-11-04）：中文構面分數、最弱兩項、一鍵打開名單頁。
-- 只改通知信內容；寫入規則、權限、上限與 v1 相同。
create or replace function checkup_private.notify(new_id bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare
  l public.checkup_leads;
  keys text[] := array['prod','mkt','hr','rd','fin','info'];
  names text[] := array['產','銷','人','發','財','資'];
  cells text := ''; weak text; i int; v text;
  url text := 'https://marvintien90-jpg.github.io/bom-center/checkup/leads/?id=' || new_id;
begin
  select * into l from public.checkup_leads where id = new_id;
  if not found then return; end if;
  for i in 1..6 loop
    v := coalesce(l.scores->>keys[i], '-');
    cells := cells || '<td style="padding:6px 10px;text-align:center;border:1px solid #d9dfdc"><div style="color:#5d6a65">' || names[i] || '</div><div style="font-size:18px;font-weight:700">' || bom_private.esc(v) || '</div></td>';
  end loop;
  select string_agg(n || ' ' || s, '、' order by s::int, ord) into weak from (
    select names[o] n, l.scores->>keys[o] s, o ord from generate_series(1,6) o
    where (l.scores->>keys[o]) ~ '^[0-9]+$' order by (l.scores->>keys[o])::int, o limit 2) w;
  perform bom_private.send_mail('checkup', 'marvintien90@gmail.com',
    '新的經營健檢預約：' || coalesce(l.brand, l.contact_name) || '（' || coalesce(l.total::text, '-') || ' 分）',
    '<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#18211e">' ||
    '<p style="font-size:18px;font-weight:700;margin:0">' || coalesce(bom_private.esc(l.brand), '（未填品牌）') || '｜' || bom_private.esc(l.contact_name) || '</p>' ||
    '<p style="margin:4px 0 12px;color:#5d6a65">' || coalesce(bom_private.esc(l.biz_type), '') || coalesce('・' || l.stores || ' 店', '') || '</p>' ||
    '<p style="margin:0">總分 <b style="font-size:22px">' || coalesce(l.total::text, '-') || '</b> / 100' || coalesce('　最弱：<b>' || weak || '</b>', '') || '</p>' ||
    '<table style="border-collapse:collapse;margin:10px 0"><tr>' || cells || '</tr></table>' ||
    '<p style="margin:0">' || coalesce('手機：<a href="tel:' || bom_private.esc(l.phone) || '">' || bom_private.esc(l.phone) || '</a>　', '') ||
      coalesce('LINE：' || bom_private.esc(l.line_id) || '　', '') || coalesce('Email：' || bom_private.esc(l.email), '') || '</p>' ||
    '<p style="margin:18px 0"><a href="' || url || '" style="background:#0f6b5c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">打開這筆名單（完整答案）</a></p>' ||
    '</div>', null);
exception when others then null;
end $$;
revoke all on function checkup_private.notify(bigint) from public, anon, authenticated;

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

  perform checkup_private.notify(new_id);
  return jsonb_build_object('id', new_id);
end $$;
revoke execute on function public.checkup_submit(jsonb) from public;
grant execute on function public.checkup_submit(jsonb) to anon, authenticated;
