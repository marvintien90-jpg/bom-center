-- 經營健檢：業主結果信＋沒聯絡／沒回覆自動提醒（2026-11-04）
-- 1. 業主送出健檢且有留 Email → 自動寄結果摘要（總分、六構面、最該先改的兩件事與建議做法）。
-- 2. 名單狀態加上 status_at；每天早上 8:30（台灣）寄提醒給 Marvin：
--    新名單超過 1 天沒聯絡、已聯絡超過 3 天沒進展（附追蹤話術）。

alter table public.checkup_leads add column if not exists status_at timestamptz;
update public.checkup_leads set status_at = created_at where status_at is null;
alter table public.checkup_leads alter column status_at set default now();

create or replace function checkup_private.touch_status() returns trigger
language plpgsql set search_path to '' as $$
begin
  if new.status is distinct from old.status then new.status_at := now(); end if;
  return new;
end $$;
drop trigger if exists checkup_leads_status_at on public.checkup_leads;
create trigger checkup_leads_status_at before update on public.checkup_leads
  for each row execute function checkup_private.touch_status();

-- 追蹤話術改寫（不再承諾「一頁改善重點」）
create or replace function checkup_private.brief(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  l public.checkup_leads; weak jsonb := '[]'::jsonb; d record; issues jsonb; strong text;
  nm text; w1 text; w2 text; top1 text; prep jsonb; script text; follow text; n int := 0;
  scale text[] := array['沒有','偶爾／部分','大致有','完整且持續'];
begin
  select * into l from public.checkup_leads where id = p_id;
  if not found then return null; end if;
  nm := coalesce(l.contact_name, '老闆');
  for d in
    select pd.*, (l.scores->>pd.dim)::int as score from checkup_private.pb_dim pd
    where (l.scores->>pd.dim) ~ '^[0-9]+$' order by (l.scores->>pd.dim)::int, pd.ord
  loop
    n := n + 1;
    exit when n > 2 or (n = 2 and d.score >= 75);
    select coalesce(jsonb_agg(jsonb_build_object('q', x.question, 'answer', scale[x.v + 1], 'issue', x.issue, 'fix', x.fix) order by x.v, x.ord), '[]'::jsonb) into issues
    from (select q.*, (l.answers->>q.id)::int v from checkup_private.pb_q q
          where q.dim = d.dim and (l.answers->>q.id) ~ '^[0-3]$'
          order by (l.answers->>q.id)::int, q.ord limit 3) x
    where x.v <= 1 or not exists (select 1 from checkup_private.pb_q q2 where q2.dim = d.dim and (l.answers->>q2.id) in ('0', '1'));
    weak := weak || jsonb_build_object('dim', d.dim, 'name', d.name, 'full', d.full_name, 'score', d.score, 'issues', issues, 'ask', to_jsonb(d.ask), 'tool', d.tool);
  end loop;
  select pd.full_name into strong from checkup_private.pb_dim pd
    where (l.scores->>pd.dim) ~ '^[0-9]+$' order by (l.scores->>pd.dim)::int desc, pd.ord limit 1;
  w1 := weak->0->>'full'; w2 := weak->1->>'full'; top1 := weak->0->'issues'->0->>'issue';
  script := nm || '您好，我是品牌加辣餐飲顧問 Marvin，謝謝您填寫經營健檢。看了結果，' || coalesce(l.brand, '您的店') ||
    case when strong is not null then '在「' || strong || '」做得不錯；' else '' end ||
    '比較值得優先處理的是「' || coalesce(w1, '') || '」' || coalesce('和「' || w2 || '」', '') || '。' ||
    coalesce('像是「' || top1 || '」這一點，通常調整後很快就能看到成效。', '') ||
    '我想約您 30 分鐘，免費把結果講清楚，並給您 2 到 3 個馬上能做的改善建議。這週哪個時段方便？';
  follow := nm || '您好，上次健檢提到的「' || coalesce(w1, '經營重點') || '」，我可以用 30 分鐘免費幫您排出改善的先後順序，馬上就能開始做。想聊的話回我一個方便的時間就好。';
  prep := jsonb_build_array('近 3 個月的營業額與主要成本（損益表或記帳本都可以）', '目前的菜單與售價', '主要進貨單據或供應商清單');
  if coalesce(l.finance->>'revenue', '') = '' then prep := prep || to_jsonb('（健檢時沒填營運數字，訪談時先問月營業額、食材、人事、租金）'::text); end if;
  if weak->0->>'dim' = 'hr' or weak->1->>'dim' = 'hr' then prep := prep || to_jsonb('目前的班表與人員名單'::text); end if;

  return jsonb_build_object('weak', weak, 'strong', strong, 'script', script, 'followup', follow, 'prep', prep);
end $$;
-- 業主結果信
create or replace function checkup_private.owner_mail(new_id bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare
  l public.checkup_leads; b jsonb; w jsonb; it jsonb; sec text := ''; cells text := ''; i int; v text;
  keys text[] := array['prod','mkt','hr','rd','fin','info'];
  names text[] := array['生產','行銷','人力','研發','財務','資訊'];
begin
  select * into l from public.checkup_leads where id = new_id;
  if not found or l.email is null then return; end if;
  b := checkup_private.brief(new_id);
  for i in 1..6 loop
    v := coalesce(l.scores->>keys[i], '-');
    cells := cells || '<td style="padding:6px 8px;text-align:center;border:1px solid #d9dfdc"><div style="color:#5d6a65;font-size:13px">' || names[i] || '</div><div style="font-size:18px;font-weight:700">' || bom_private.esc(v) || '</div></td>';
  end loop;
  for w in select * from jsonb_array_elements(b->'weak') loop
    sec := sec || '<p style="font-weight:700;margin:14px 0 4px">' || (w->>'full') || '（' || (w->>'score') || ' 分）</p><ul style="margin:0;padding-left:20px">';
    for it in select * from jsonb_array_elements(w->'issues') loop
      sec := sec || '<li style="margin:4px 0">' || (it->>'issue') || '<br>建議做法：<b>' || (it->>'fix') || '</b></li>';
    end loop;
    sec := sec || '</ul>';
  end loop;
  perform bom_private.send_mail('checkup_owner', l.email,
    '您的餐飲經營健檢結果：' || coalesce(l.total::text, '-') || ' 分',
    '<p>' || bom_private.esc(l.contact_name) || ' 您好，</p>' ||
    '<p>謝謝您完成' || coalesce('「' || bom_private.esc(l.brand) || '」的', '') || '餐飲經營健檢。以下是您的結果摘要：</p>' ||
    '<p style="margin:10px 0 0">總分 <b style="font-size:24px">' || coalesce(l.total::text, '-') || '</b> / 100</p>' ||
    '<table style="border-collapse:collapse;margin:6px 0"><tr>' || cells || '</tr></table>' ||
    case when coalesce(b->>'strong', '') <> '' then '<p>做得最好的是「' || (b->>'strong') || '」，這是您的優勢。</p>' else '' end ||
    '<p style="font-size:16px;font-weight:700;margin:20px 0 0">建議優先改善</p>' || sec ||
    '<p style="margin:20px 0 0">顧問 Marvin 會在 1 到 2 個工作天內和您聯絡，免費用 30 分鐘幫您把結果講清楚，並給您 2 到 3 個馬上能做的改善建議。</p>' ||
    '<p>想先準備的話，可以帶：近 3 個月的營業額與主要成本、目前的菜單與售價、主要進貨單據。</p>' ||
    '<p style="margin:18px 0"><a href="https://marvintien90-jpg.github.io/bom-center/checkup/" style="color:#0f6b5c">重新做一次健檢</a></p>' ||
    '<p>品牌加辣餐飲顧問　Marvin</p>', null);
exception when others then null;
end $$;
revoke all on function checkup_private.owner_mail(bigint) from public, anon, authenticated;

-- 每日提醒（只有需要處理時才寄）
create or replace function checkup_private.daily_reminder() returns int
language plpgsql security definer set search_path to '' as $$
declare r record; b jsonb; rows1 text := ''; rows2 text := ''; n1 int := 0; n2 int := 0;
  base text := 'https://marvintien90-jpg.github.io/bom-center/checkup/leads/?id=';
begin
  for r in select * from public.checkup_leads where status = '新名單' and created_at < now() - interval '1 day' order by created_at loop
    n1 := n1 + 1;
    rows1 := rows1 || '<li style="margin:6px 0"><a href="' || base || r.id || '">' || coalesce(bom_private.esc(r.brand), '（未填品牌）') || '｜' || bom_private.esc(r.contact_name) || '</a>　' ||
      coalesce(r.total::text, '-') || ' 分・已等 ' || extract(day from now() - r.created_at)::int || ' 天' ||
      coalesce('・<a href="tel:' || bom_private.esc(r.phone) || '">' || bom_private.esc(r.phone) || '</a>', '') || '</li>';
  end loop;
  for r in select * from public.checkup_leads where status = '已聯絡' and coalesce(status_at, created_at) < now() - interval '3 days' order by status_at loop
    n2 := n2 + 1; b := checkup_private.brief(r.id);
    rows2 := rows2 || '<li style="margin:8px 0"><a href="' || base || r.id || '">' || coalesce(bom_private.esc(r.brand), '（未填品牌）') || '｜' || bom_private.esc(r.contact_name) || '</a>　聯絡後 ' ||
      extract(day from now() - coalesce(r.status_at, r.created_at))::int || ' 天沒進展<div style="background:#f3f5f4;border-radius:8px;padding:8px;margin-top:4px">' || bom_private.esc(b->>'followup') || '</div></li>';
  end loop;
  if n1 + n2 = 0 then return 0; end if;
  perform bom_private.send_mail('checkup_remind', 'marvintien90@gmail.com',
    '健檢名單提醒：' || case when n1 > 0 then n1 || ' 筆還沒聯絡' else '' end || case when n1 > 0 and n2 > 0 then '、' else '' end || case when n2 > 0 then n2 || ' 筆該追蹤' else '' end,
    case when n1 > 0 then '<p style="font-size:16px;font-weight:700;margin:0">超過 1 天還沒聯絡</p><ul style="padding-left:20px">' || rows1 || '</ul>' else '' end ||
    case when n2 > 0 then '<p style="font-size:16px;font-weight:700;margin:16px 0 0">已聯絡超過 3 天沒進展（追蹤話術可直接貼）</p><ul style="padding-left:20px">' || rows2 || '</ul>' else '' end ||
    '<p style="color:#5d6a65;font-size:13px">聯絡後把名單狀態改掉，就不會再提醒。</p>', null);
  return n1 + n2;
end $$;
revoke all on function checkup_private.daily_reminder() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'checkup-daily-reminder';
select cron.schedule('checkup-daily-reminder', '30 0 * * *', 'select checkup_private.daily_reminder()');

-- 送出：寫入後通知 Marvin，並寄結果給業主
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
  -- 同一個 Email 一天最多寄 3 次結果信，避免被拿來寄垃圾信
  if em is not null and (select count(*) from public.checkup_leads where lower(email) = lower(em) and created_at > now() - interval '1 day') <= 3 then
    perform checkup_private.owner_mail(new_id);
  end if;
  return jsonb_build_object('id', new_id, 'mailed', em is not null);
end $$;
revoke execute on function public.checkup_submit(jsonb) from public;
grant execute on function public.checkup_submit(jsonb) to anon, authenticated;
