-- 經營健檢「顧問作業包」（2026-11-04）
-- 每筆新名單自動產生：最弱兩個面向、具體可能問題與改善方案、訪談提問、邀約與追蹤話術、訪談前請業主準備的資料。
-- 內容放在 checkup_private（外部讀不到）；通知信與名單管理頁都從 checkup_private.brief() 取同一份。

create schema if not exists checkup_private;

create table if not exists checkup_private.pb_dim (
  dim text primary key, ord int not null, name text not null, full_name text not null,
  ask text[] not null, tool text not null
);
create table if not exists checkup_private.pb_q (
  id text primary key, dim text not null references checkup_private.pb_dim(dim), ord int not null,
  question text not null, issue text not null, fix text not null
);

insert into checkup_private.pb_dim (dim, ord, name, full_name, ask, tool) values
('prod',1,'產','生產與營運', array['目前最常被客訴的是哪道菜或哪個環節？','上個月食材成本率大概多少？有沒有算過哪幾道菜其實不賺錢？','多久盤點一次？盤點結果跟預期差多少？'], 'BOM×ERP 運算中心（成本卡、盤點、用量差異、叫貨）'),
('mkt',2,'銷','行銷與營收', array['客人大多從哪裡知道你們？熟客大概佔幾成？','最近三個月來客數和客單價是變多還是變少？','外送佔營收幾成？扣完平台抽成還賺嗎？'], '品牌調研與定位提案＋每月營收三數字追蹤'),
('hr',3,'人','人力資源', array['最近半年離職幾個人？主要原因是什麼？','新人多久可以獨立上班？誰負責教？','尖峰和離峰各排幾個人？人事費占營收多少？'], '門市稽核＋SOP 訓練、排班與人力成本（即將推出）'),
('rd',4,'發','商品研發', array['菜單有幾道菜？哪幾道最賣、哪幾道最少人點？','上一次推新品是什麼時候？賣得怎麼樣？','原物料漲價後有沒有調整售價或份量？'], '菜單工程（即將推出）＋BOM 毛利試算'),
('fin',5,'財','財務管理', array['每個月什麼時候才知道上個月賺多少？','知道一天要賣多少才打平嗎？','有沒有遇過帳上有賺、但錢不夠付款的時候？'], '損益分析中心（月損益、兩平、三大成本燈號）'),
('info',6,'資','資訊與數據', array['現在用哪一套 POS？資料多久看一次？','進貨、庫存、損益分別記在哪裡？','重要事情怎麼交辦？怎麼確認有做完？'], 'BOM＋損益中心訂閱、顧問會員每月經營月報')
on conflict (dim) do update set ord=excluded.ord, name=excluded.name, full_name=excluded.full_name, ask=excluded.ask, tool=excluded.tool;

insert into checkup_private.pb_q (id, dim, ord, question, issue, fix) values
('p1','prod',1,'每道菜都有標準食譜（份量、做法），出餐品質一致','出餐份量與口味依人而異，客訴和食材浪費都難控制','先挑銷量前 10 道菜做標準食譜卡（克數、步驟、成品照），貼在出餐區'),
('p2','prod',2,'算過每道菜的食材成本，進價變動時會更新','不知道每道菜的真實毛利，可能賣越多賺越少','用 BOM 建每道菜的成本卡，進價一更新就自動重算毛利'),
('p3','prod',3,'至少每月盤點一次，並比對理論用量與實際用量','看不到理論與實際用量的落差，耗損、浪費或短少無從追查','每月固定日盤點，差異超過 3% 的品項追查原因'),
('p4','prod',4,'叫貨有安全庫存規則，很少缺貨或叫太多','叫貨靠感覺，缺貨掉營收、過量造成報廢與現金卡住','依近 4 週用量設安全庫存與叫貨點，用叫貨單取代口頭叫貨'),
('p5','prod',5,'有食安與衛生紀錄（溫度、效期、清潔）','食安紀錄不完整，遇到稽查或客訴沒有證據','建每日溫度、效期、清潔檢核表，店長每天簽核'),
('m1','mkt',1,'清楚知道目標客群，以及和競品不同的地方','定位不清楚，陷入價格戰與同質化競爭，客人記不住你','做一次客群與競品調研，寫出一句話定位和三個差異點'),
('m2','mkt',2,'每月追蹤來客數、客單價與回客','營收起落找不到原因，行銷花了錢不知道有沒有效','每月把營收拆成來客數 × 客單價 × 回客率三個數字追蹤'),
('m3','mkt',3,'固定經營社群或 Google 商家，並回覆評論','線上曝光與口碑弱，新客找不到你，負評沒有處理','每週固定發文 2 次，48 小時內回覆所有 Google 評論'),
('m4','mkt',4,'有會員、集點或其他回購機制','只靠新客撐營收，熟客沒有被留住','先做簡單集點或 LINE 官方帳號會員，鎖定回購'),
('m5','mkt',5,'外送平台與內用的毛利分開計算','外送平台抽成約三成，可能接越多單越虧','外送與內用分開算毛利，外送菜單另訂價或調整組合'),
('h1','hr',1,'主要崗位都有書面 SOP','做法靠老員工口傳，人一走品質就掉','先寫 5 個核心崗位 SOP（開店、收店、出餐、收銀、清潔），一頁一張'),
('h2','hr',2,'新人有固定的訓練流程與上線檢核','新人上線慢、出錯多，一直重新教','建新人 7 天訓練表與上線檢核，主管簽核後才可獨立上班'),
('h3','hr',3,'依預估營業額排班，而不是固定人數','人事費失控，或尖峰人手不足','依各時段營業額估算所需人力，離峰減班、尖峰加人'),
('h4','hr',4,'定期巡店或稽核，並追蹤改善到完成','標準有寫但沒人檢查，執行落差大','每週一次巡店檢核表，缺失列表追蹤到改善完成'),
('h5','hr',5,'有考核或獎勵制度，員工流動率在可接受範圍','員工沒有努力的理由，好人才留不住','設簡單的月考核（出勤、品質、業績），連結獎金'),
('r1','rd',1,'每季檢視菜單，知道哪些品項賺錢又好賣','菜單品項太多，賠錢品項佔用備料與人力','用菜單工程把品項分成明星、金牛、問號、低效，每季汰換低效品'),
('r2','rd',2,'新品上市前會試算成本、訂價與目標毛利','新品上市後才發現沒賺頭','新品上市前先過成本卡，毛利率沒達標不上市'),
('r3','rd',3,'新品有試作、試賣、檢討的固定流程','新品憑感覺推出，成功率低','建立試作、內部試吃、限量試賣、檢討四關流程'),
('r4','rd',4,'會依季節或節慶規劃商品與活動','淡旺季營收起伏大，沒有活動拉抬','排年度商品與活動行事曆，提前 2 個月準備'),
('r5','rd',5,'會參考市場趨勢與競品動態調整商品','商品老化，客人被新品牌搶走','每季做一次競品與趨勢觀察，挑 1 到 2 個方向試作'),
('f1','fin',1,'每月看損益表，且在次月 15 日前完成','每月盈虧很晚才知道，問題發生時來不及反應','固定每月 10 日前出損益表，用損益中心自動產出'),
('f2','fin',2,'知道每月的損益兩平營業額','不知道每天要賣多少才不虧','算出月兩平營業額，換算成每日目標貼在店內'),
('f3','fin',3,'有年度或月預算，並每月比較預算與實際','花錢沒有標準，超支到月底才發現','編年度預算，每月比對實際，差異超過一成就檢討'),
('f4','fin',4,'掌握未來 1–3 個月的現金流','帳上賺錢但現金不夠，付款日周轉吃緊','做未來 13 週現金流表，提前排好大額支出'),
('f5','fin',5,'定期檢視食材、人事、租金三大成本占比','三大成本失衡沒有察覺，利潤被慢慢吃掉','每月看食材、人事、租金占比，超過參考值就啟動改善'),
('i1','info',1,'POS 銷售資料可以匯出，並且定期拿來用','POS 資料沒在用，錯過熱賣時段與品項的訊號','每月匯出 POS，看品項排行與各時段來客'),
('i2','info',2,'進貨、庫存、損益資料集中在同一個地方','資料分散在紙本、Excel、LINE，彙整耗時又容易錯','進貨、庫存、損益集中到同一套系統'),
('i3','info',3,'主管每天或每週可以看到關鍵數字','主管看不到數字，只能憑感覺管理','設一張每日／每週關鍵數字表（營收、來客、客單、食材率）'),
('i4','info',4,'公告與交辦事項有追蹤，不只靠 LINE 群組','交辦事項淹沒在 LINE 群裡，沒人負責也沒有追蹤','公告與交辦改用有負責人、有期限的追蹤工具'),
('i5','info',5,'重要文件、SOP、合約集中存放，找得到','文件找不到，交接時一片混亂','建一個雲端資料夾架構，SOP、合約、證照集中存放')
on conflict (id) do update set dim=excluded.dim, ord=excluded.ord, question=excluded.question, issue=excluded.issue, fix=excluded.fix;

revoke all on all tables in schema checkup_private from public, anon, authenticated;

-- 作業包（JSON），給通知信與名單頁共用
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
revoke all on function checkup_private.brief(bigint) from public, anon, authenticated;

-- 名單頁用：只有管理員能取
create or replace function public.checkup_brief(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not bom_private.is_admin() then raise exception 'not allowed'; end if;
  return checkup_private.brief(p_id);
end $$;
revoke all on function public.checkup_brief(bigint) from public, anon;
grant execute on function public.checkup_brief(bigint) to authenticated;

-- 通知信 v3：顧問作業包
create or replace function checkup_private.notify(new_id bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare
  l public.checkup_leads; b jsonb; w jsonb; it jsonb; a text; p text;
  keys text[] := array['prod','mkt','hr','rd','fin','info'];
  names text[] := array['產','銷','人','發','財','資'];
  cells text := ''; sec text := ''; i int; v text;
  url text := 'https://marvintien90-jpg.github.io/bom-center/checkup/leads/?id=' || new_id;
  e text := '';
  h2 text := '<p style="font-size:16px;font-weight:700;margin:22px 0 6px;border-left:4px solid #0f6b5c;padding-left:8px">';
begin
  select * into l from public.checkup_leads where id = new_id;
  if not found then return; end if;
  b := checkup_private.brief(new_id);
  for i in 1..6 loop
    v := coalesce(l.scores->>keys[i], '-');
    cells := cells || '<td style="padding:6px 10px;text-align:center;border:1px solid #d9dfdc"><div style="color:#5d6a65">' || names[i] || '</div><div style="font-size:18px;font-weight:700">' || bom_private.esc(v) || '</div></td>';
  end loop;
  for w in select * from jsonb_array_elements(b->'weak') loop
    sec := sec || '<p style="font-weight:700;margin:12px 0 4px">' || (w->>'name') || '｜' || (w->>'full') || '　' || (w->>'score') || ' 分</p><ol style="margin:0;padding-left:20px">';
    for it in select * from jsonb_array_elements(w->'issues') loop
      sec := sec || '<li style="margin:4px 0">可能問題：' || (it->>'issue') || '<br><span style="color:#5d6a65">（' || (it->>'q') || '：' || (it->>'answer') || '）</span><br>改善方案：<b>' || (it->>'fix') || '</b></li>';
    end loop;
    sec := sec || '</ol><p style="margin:4px 0;color:#0f6b5c">對應工具：' || (w->>'tool') || '</p><p style="margin:4px 0 0">訪談時問：</p><ul style="margin:0;padding-left:20px">';
    for a in select * from jsonb_array_elements_text(w->'ask') loop sec := sec || '<li>' || a || '</li>'; end loop;
    sec := sec || '</ul>';
  end loop;
  for p in select * from jsonb_array_elements_text(b->'prep') loop e := e || '<li>' || p || '</li>'; end loop;

  perform bom_private.send_mail('checkup', 'marvintien90@gmail.com',
    '新的經營健檢預約：' || coalesce(l.brand, l.contact_name) || '（' || coalesce(l.total::text, '-') || ' 分）',
    '<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#18211e;max-width:640px">' ||
    '<p style="font-size:18px;font-weight:700;margin:0">' || coalesce(bom_private.esc(l.brand), '（未填品牌）') || '｜' || bom_private.esc(l.contact_name) || '</p>' ||
    '<p style="margin:4px 0 8px;color:#5d6a65">' || coalesce(bom_private.esc(l.biz_type), '') || coalesce('・' || l.stores || ' 店', '') || coalesce('・' || bom_private.esc(l.years), '') || '</p>' ||
    '<p style="margin:0">' || coalesce('手機：<a href="tel:' || bom_private.esc(l.phone) || '">' || bom_private.esc(l.phone) || '</a>　', '') ||
      coalesce('LINE：' || bom_private.esc(l.line_id) || '　', '') || coalesce('Email：' || bom_private.esc(l.email), '') || '</p>' ||
    '<p style="margin:10px 0 0">總分 <b style="font-size:22px">' || coalesce(l.total::text, '-') || '</b> / 100</p>' ||
    '<table style="border-collapse:collapse;margin:6px 0"><tr>' || cells || '</tr></table>' ||
    h2 || '第一步：邀約話術（LINE 或電話）</p><div style="background:#dcefea;border-radius:8px;padding:12px">' || bom_private.esc(b->>'script') || '</div>' ||
    h2 || '問題判讀與改善方案</p>' || sec ||
    h2 || '請業主訪談前準備</p><ul style="margin:0;padding-left:20px">' || e || '</ul>' ||
    h2 || '3 天沒回覆時的追蹤話術</p><div style="background:#f3f5f4;border-radius:8px;padding:12px">' || bom_private.esc(b->>'followup') || '</div>' ||
    '<p style="margin:22px 0"><a href="' || url || '" style="background:#0f6b5c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">打開這筆名單（完整答案、改狀態）</a></p>' ||
    '</div>', null);
exception when others then null;
end $$;
revoke all on function checkup_private.notify(bigint) from public, anon, authenticated;

-- 送出函式：寫入後呼叫 notify
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
