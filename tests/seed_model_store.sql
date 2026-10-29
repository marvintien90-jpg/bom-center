-- 大量資料驗證用的「模擬門市」：156 樣食材（6 樣沒用在配方）、10 個總部半成品、60 道菜、25 家供應商、
-- 12 個月進貨（1500 張單）、13 次月底盤點＋1 次盤點中、12 個月損益表，並對應到損益分析中心。
-- 只有管理員看得到（沒有指派業主）。品牌 id：test-model-store（資料庫裡現在的是改名成 test-model-store-2／【測試】模擬門市2 的第二版）。數字用 hashtext 產生，每次執行結果相同。
do $$
declare
  bid constant text := 'test-model-store';
  cname constant text := '【測試】模擬門市';
  cats constant text[] := array['肉類','海鮮','蔬菜','菇類','蛋豆','乳品','醬料','乾貨'];
  ing jsonb; semis jsonb; items jsonb; m int; d date; ds date; de date; days int; cid uuid;
begin
  if exists (select 1 from public.bom_brands where id = bid) then raise exception '模擬門市已存在，請先刪除再重建'; end if;
  select jsonb_agg(jsonb_build_object('id','i'||n,'cat',cats[1+n%8],'name',cats[1+n%8]||'食材'||lpad(n::text,3,'0'),'unit','g',
      'yield',80+(abs(hashtext('y'||n))%21),'markup',null,'supply',case when n%4=0 then 'hq' else 'self' end,
      'buyPrice',30+(abs(hashtext('p'||n))%300),'packSize',1000,'packUnit','公斤') order by n) into ing from generate_series(1,156) n;
  select jsonb_agg(jsonb_build_object('id','s'||n,'name','總部醬料'||lpad(n::text,2,'0'),'unit','g','markup',20,'supply','hq','packSize',1000,'packUnit','包(1kg)','batchYield',5000,
      'lines',jsonb_build_array(jsonb_build_object('ref','i:i'||((n*7)%150+1),'qty',1500),jsonb_build_object('ref','i:i'||((n*11)%150+1),'qty',2000),jsonb_build_object('ref','i:i'||((n*13)%150+1),'qty',1500))) order by n)
    into semis from generate_series(1,10) n;
  select jsonb_agg(jsonb_build_object('id','m'||n,'cat',case when n%5=0 then '加點' else '主餐' end,'name','測試餐點'||lpad(n::text,2,'0'),
      'price',120+(abs(hashtext('pr'||n))%27)*10,'monthlySales',30+(abs(hashtext('ms'||n))%200),
      'lines',(select jsonb_agg(jsonb_build_object('ref','i:i'||((n*3+j*37)%150+1),'qty',15+(abs(hashtext('q'||n||'-'||j))%90))) from generate_series(1,4) j)
        || case when n%3=0 then jsonb_build_array(jsonb_build_object('ref','s:s'||(n%10+1),'qty',30)) else '[]'::jsonb end) order by n)
    into items from generate_series(1,60) n;
  insert into public.bom_brands(id,name,data) values (bid,cname,jsonb_build_object('name',cname,'sample',false,
    'settings',jsonb_build_object('defaultMarkup',15,'targetRate',35,'franchiseStores',1,'directStores',0,'logisticsPct',3,'cycleDays',3,'safetyPct',10,'daysPerMonth',30),
    'ingredients',ing,'semis',semis,'items',items,'combos','[]'::jsonb,'periods','[]'::jsonb,'channels',jsonb_build_array(jsonb_build_object('name','內用／外帶','comm',0,'extra',0,'pack',0,'up',0)),
    'priceLog','[]'::jsonb,'fixed','[]'::jsonb,'be',jsonb_build_object('varPct',8,'ticket',280,'target',0,'foodMode','auto','foodPct',35),'fr','{}'::jsonb));

  insert into public.bom_suppliers(brand_id,name,contact,phone,pay_terms)
  select bid,'測試供應商'||lpad(n::text,2,'0'),'聯絡人'||n,'09'||lpad((abs(hashtext('ph'||n))%100000000)::text,8,'0'),case when n%3=0 then '貨到付款' else '月結 30 天' end from generate_series(1,25) n;

  -- 每樣東西的門市進價（每公斤）、每月理論用量（克，已含可用率損耗）、實際用量偏差
  create temp table k_cost on commit drop as
  select 'i:'||(e->>'id') k, e->>'name' nm, e->>'cat' cat, (e->>'yield')::numeric yl,
         (e->>'buyPrice')::numeric*case when e->>'supply'='hq' then 1.15 else 1 end pp, e->>'supply'='self' self, (substr(e->>'id',2))::int n
  from jsonb_array_elements(ing) e;
  insert into k_cost
  select 's:'||(s->>'id'), s->>'name', '總部半成品', 100,
         round(sum(((i->>'buyPrice')::numeric*case when i->>'supply'='hq' then 1.15 else 1 end)/1000/((i->>'yield')::numeric/100)*(l->>'qty')::numeric)/5000*1000*1.2,2), false, 156+(substr(s->>'id',2))::int
  from jsonb_array_elements(semis) s, jsonb_array_elements(s->'lines') l, jsonb_array_elements(ing) i where i->>'id' = substr(l->>'ref',3)
  group by s->>'id', s->>'name';
  create temp table k_use on commit drop as
  select c.k, c.nm, c.cat, c.pp, c.self, c.n,
    coalesce((select sum((l->>'qty')::numeric*(it->>'monthlySales')::numeric) from jsonb_array_elements(items) it, jsonb_array_elements(it->'lines') l where l->>'ref'=c.k),0)/(c.yl/100)
      + case when not exists (select 1 from jsonb_array_elements(items) it, jsonb_array_elements(it->'lines') l where l->>'ref'=c.k) then 1500 else 0 end mu,
    case when abs(hashtext('v'||c.k))%10=0 then 0.12+(abs(hashtext('w'||c.k))%13)/100.0 when abs(hashtext('v'||c.k))%10=1 then -0.10 else ((abs(hashtext('w'||c.k))%50)-25)/1000.0 end v,
    1+(c.n%25) sup
  from k_cost c;

  -- 13 次月底盤點（2025-09-30 起）＋ 12 個月進貨
  create temp table st on commit drop as
  select u.k, x idx, round(u.mu*(0.15+(abs(hashtext('s'||u.k||x))%30)/100.0)) qty from k_use u, generate_series(0,12) x;
  for m in 0..12 loop
    d := (date '2025-10-01' + (m||' month')::interval - interval '1 day')::date;
    insert into public.bom_counts(brand_id,count_on,label) values (bid,d,extract(month from d)||' 月盤點') returning id into cid;
    insert into public.bom_count_lines(count_id,brand_id,item_key,name,qty_base,unit_cost)
    select cid,bid,u.k,u.nm,s.qty,round(u.pp*case when u.self and u.n%9=0 and m>=7 then 1.08 else 1 end/1000,6) from k_use u join st s on s.k=u.k and s.idx=m;
    update public.bom_counts set status='closed' where id=cid;
  end loop;
  for m in 1..12 loop
    ds := (date '2025-10-01' + ((m-1)||' month')::interval)::date; de := (ds + interval '1 month' - interval '1 day')::date; days := extract(day from de);
    insert into public.bom_receipts(brand_id,supplier_id,supplier_name,received_on,invoice_no,lines,total)
    select bid, sp.id, sp.name, ds + (dd-1), 'T'||to_char(ds,'YYMM')||lpad(sp.n::text,2,'0')||dd,
           jsonb_agg(jsonb_build_object('key',q.k,'name',q.nm,'qty',q.qty,'pack',1000,'unit',case when q.k like 's:%' then '包(1kg)' else '公斤' end,'price',q.price,'amount',round(q.qty*q.price,2))),
           sum(round(q.qty*q.price,2))
    from (select s.id, s.name, row_number() over (order by s.name) n from public.bom_suppliers s where s.brand_id=bid) sp
    cross join (values (3),(9),(15),(21),(27)) dv(dd)
    join lateral (
      select u.k, u.nm, round(greatest(0, u.mu*days/30.0*(1+u.v) + s1.qty - s0.qty)/1000/5, 2) qty,
             round(u.pp*case when u.self and u.n%9=0 and m>=7 then 1.08 else 1 end, 2) price
      from k_use u join st s0 on s0.k=u.k and s0.idx=m-1 join st s1 on s1.k=u.k and s1.idx=m where u.sup=sp.n) q on q.qty>0
    group by sp.id, sp.name, sp.n, dd;
  end loop;
  -- 一張盤點中的單（今天），只填了一半
  insert into public.bom_counts(brand_id,count_on,label) values (bid,current_date,'抽盤（測試）') returning id into cid;
  insert into public.bom_count_lines(count_id,brand_id,item_key,name,qty_base,unit_cost) select cid,bid,k,nm,round(mu*0.3),round(pp/1000,6) from k_use where n%2=0;

  -- 12 個月損益表（進貨依分類加總，營收依菜單理論營業額＋波動）
  for m in 1..12 loop
    ds := (date '2025-10-01' + ((m-1)||' month')::interval)::date; days := extract(day from (ds + interval '1 month' - interval '1 day'));
    with rev as (select round(sum((it->>'price')::numeric*(it->>'monthlySales')::numeric)*days/30.0*(1+((abs(hashtext('r'||m))%11)-5)/100.0)) r from jsonb_array_elements(items) it),
    cogs as (select coalesce(c.cat,'總部半成品') cat, round(sum((l->>'amount')::numeric)) a from public.bom_receipts r cross join lateral jsonb_array_elements(r.lines) l left join k_cost c on c.k=l->>'key'
             where r.brand_id=bid and r.received_on between ds and (ds + interval '1 month' - interval '1 day')::date group by 1),
    ins as (insert into public.pl_statements(client_name,brand_name,store_name,unit_type,period_month,source_file,stated_revenue,stated_cogs,stated_opex,stated_net)
            select cname,cname,'測試店','門市',ds,'模擬資料'||to_char(ds,'YYYYMM')||'.pdf',r,(select sum(a) from cogs),round(r*0.22)+120000+round(r*0.04)+round(r*0.3*0.3)+round(r*0.02),
                   r-(select sum(a) from cogs)-(round(r*0.22)+120000+round(r*0.04)+round(r*0.3*0.3)+round(r*0.02)) from rev returning id, stated_revenue r)
    insert into public.pl_line_items(statement_id,section,category,account_name,amount,sort_order)
    select ins.id,'營業收入','內用/外帶','內用／外帶',ins.r-round(ins.r*0.3),1 from ins
    union all select ins.id,'營業收入','外送','外送平台',round(ins.r*0.3),2 from ins
    union all select ins.id,'營業成本','食材成本',cogs.cat,cogs.a,10+row_number() over (order by cogs.cat) from ins, cogs
    union all select ins.id,'營業費用','人事費用','薪資',round(ins.r*0.22),40 from ins
    union all select ins.id,'營業費用','租金','租金支出',120000,41 from ins
    union all select ins.id,'營業費用','水電燃料','水電瓦斯',round(ins.r*0.04),42 from ins
    union all select ins.id,'營業費用','外送平台費用','外送平台服務費',round(ins.r*0.3*0.3),43 from ins
    union all select ins.id,'營業費用','一般營運費用','雜支',round(ins.r*0.02),44 from ins;
  end loop;
  insert into public.bom_pl_link(brand_id,client_name,brand_name,store_name) values (bid,cname,cname,'測試店');
end $$;
