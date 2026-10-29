/* 大量資料版的模擬門市（給 big.js 用）：跟 seed_model_store.sql 同樣的規模與規則。
   156 食材（其中 6 樣沒有用在任何配方）、10 總部半成品、60 道菜、25 供應商、1500 張進貨單、13 次月底盤點＋1 張盤點中。
   window.__BIG.v 記錄每樣東西預埋的實際用量偏差，用來核對差異表算得對不對。 */
(function(){
let seed=20261029; const rnd=()=>{ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648 }, ri=n=>Math.floor(rnd()*n);
const cats=['肉類','海鮮','蔬菜','菇類','蛋豆','乳品','醬料','乾貨'], pad=(n,w)=>String(n).padStart(w,'0');
const ing=[], semis=[], items=[];
for(let n=1;n<=156;n++) ing.push({id:'i'+n,cat:cats[n%8],name:cats[n%8]+'食材'+pad(n,3),unit:'g',yield:80+ri(21),markup:null,supply:n%4===0?'hq':'self',buyPrice:30+ri(300),packSize:1000,packUnit:'公斤'});
for(let n=1;n<=10;n++) semis.push({id:'s'+n,name:'總部醬料'+pad(n,2),unit:'g',markup:20,supply:'hq',packSize:1000,packUnit:'包(1kg)',batchYield:5000,lines:[{ref:'i:i'+((n*7)%150+1),qty:1500},{ref:'i:i'+((n*11)%150+1),qty:2000},{ref:'i:i'+((n*13)%150+1),qty:1500}]});
for(let n=1;n<=60;n++){ const lines=[1,2,3,4].map(j=>({ref:'i:i'+((n*3+j*37)%150+1),qty:15+ri(90)})); if(n%3===0) lines.push({ref:'s:s'+(n%10+1),qty:30});
  items.push({id:'m'+n,cat:n%5===0?'加點':'主餐',name:'測試餐點'+pad(n,2),price:120+ri(27)*10,monthlySales:30+ri(200),lines}) }
const brand={name:'【測試】模擬門市',sample:false,settings:{defaultMarkup:15,targetRate:35,franchiseStores:1,directStores:0,logisticsPct:3,cycleDays:3,safetyPct:10,daysPerMonth:30},
  ingredients:ing,semis,items,combos:[],periods:[],channels:[{name:'內用／外帶',comm:0,extra:0,pack:0,up:0}],priceLog:[],fixed:[],be:{varPct:8,ticket:280,target:0,foodMode:'auto',foodPct:35},fr:{}};
/* 每樣東西：門市進價（每公斤）、每月用量（克，含可用率損耗）、偏差 */
const K=[]; const used=k=>items.some(it=>it.lines.some(l=>l.ref===k));
ing.forEach((e,i)=>{ const k='i:'+e.id, net=items.reduce((t,it)=>t+it.lines.filter(l=>l.ref===k).reduce((s,l)=>s+l.qty*it.monthlySales,0),0);
  K.push({k,nm:e.name,pp:e.buyPrice*(e.supply==='hq'?1.15:1),self:e.supply==='self',n:i+1,mu:net/(e.yield/100)+(!used(k)?1500:0)}) });
semis.forEach((s,i)=>{ const k='s:'+s.id, raw=s.lines.reduce((t,l)=>{ const g=ing.find(x=>'i:'+x.id===l.ref); return t+g.buyPrice*(g.supply==='hq'?1.15:1)/1000/(g.yield/100)*l.qty },0);
  K.push({k,nm:s.name,pp:Math.round(raw/5000*1000*1.2*100)/100,self:false,n:157+i,mu:items.reduce((t,it)=>t+it.lines.filter(l=>l.ref===k).reduce((x,l)=>x+l.qty*it.monthlySales,0),0)}) });
const V={}; K.forEach(x=>{ const h=ri(10); x.v=h===0?0.12+ri(13)/100:h===1?-0.10:(ri(50)-25)/1000; x.sup=1+(x.n%25); V[x.k]=used(x.k)?x.v:null });
const st=K.map(x=>Array.from({length:13},()=>Math.round(x.mu*(0.15+ri(30)/100))));
const supp=Array.from({length:25},(_,i)=>({id:'sp'+(i+1),brand_id:'b1',name:'測試供應商'+pad(i+1,2),contact:'聯絡人'+(i+1),phone:'09'+pad(ri(1e8),8),pay_terms:i%3===2?'貨到付款':'月結 30 天',active:true}));
const iso=d=>d.toISOString().slice(0,10), eom=m=>iso(new Date(Date.UTC(2025,9+m,0))), price=(x,m)=>Math.round(x.pp*(x.self&&x.n%9===0&&m>=7?1.08:1)*100)/100;
const counts=[], lines=[], rcv=[]; let rid=1;
for(let m=0;m<=12;m++){ const id='bc'+m; counts.push({id,brand_id:'b1',count_on:eom(m),label:(+eom(m).slice(5,7))+' 月盤點',status:'closed',created_by_email:'marvintien90@gmail.com',created_at:'2026-01-01T00:00:00Z'});
  K.forEach((x,i)=>lines.push({count_id:id,brand_id:'b1',item_key:x.k,name:x.nm,qty_base:st[i][m],unit_cost:Math.round(price(x,m)/1000*1e6)/1e6})) }
for(let m=1;m<=12;m++){ const s=new Date(Date.UTC(2025,9+m-1,1)), days=new Date(Date.UTC(2025,9+m,0)).getUTCDate();
  supp.forEach((sp,si)=>[3,9,15,21,27].forEach(dd=>{ const L=[]; K.forEach((x,i)=>{ if(x.sup!==si+1) return; const q=Math.round(Math.max(0,x.mu*days/30*(1+x.v)+st[i][m]-st[i][m-1])/1000/5*100)/100; if(q>0){ const p=price(x,m); L.push({key:x.k,name:x.nm,qty:q,pack:1000,unit:x.k[0]==='s'?'包(1kg)':'公斤',price:p,amount:Math.round(q*p*100)/100}) } });
    if(L.length) rcv.push({id:'r'+(rid++),brand_id:'b1',supplier_id:sp.id,supplier_name:sp.name,received_on:iso(new Date(s.getTime()+(dd-1)*864e5)),invoice_no:'T'+m+'-'+si+'-'+dd,lines:L,total:Math.round(L.reduce((t,l)=>t+l.amount,0)*100)/100,created_by_email:'marvintien90@gmail.com',created_at:'2026-01-01T00:00:00Z'}) })) }
const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
counts.push({id:'bcopen',brand_id:'b1',count_on:today,label:'抽盤（測試）',status:'open',created_by_email:'marvintien90@gmail.com',created_at:'2026-10-29T00:00:00Z'});
K.forEach(x=>{ if(x.n%2===0) lines.push({count_id:'bcopen',brand_id:'b1',item_key:x.k,name:x.nm,qty_base:Math.round(x.mu*0.3),unit_cost:Math.round(x.pp/1000*1e6)/1e6}) });
/* 損益表：營收依菜單、進貨依分類 */
const catOf=k=>k[0]==='s'?'總部半成品':ing.find(e=>'i:'+e.id===k).cat, plp=[];
for(let m=1;m<=12;m++){ const s=new Date(Date.UTC(2025,9+m-1,1)), mo=iso(s).slice(0,7), days=new Date(Date.UTC(2025,9+m,0)).getUTCDate();
  const r=Math.round(items.reduce((t,it)=>t+it.price*it.monthlySales,0)*days/30*(1+(ri(11)-5)/100)), pc={};
  rcv.filter(x=>x.received_on.slice(0,7)===mo).forEach(x=>x.lines.forEach(l=>pc[catOf(l.key)]=(pc[catOf(l.key)]||0)+l.amount));
  plp.push({month:mo,source:'模擬資料'+mo.replace('-','')+'.pdf',revenue:[{name:'內用／外帶',amount:r-Math.round(r*0.3)},{name:'外送平台',amount:Math.round(r*0.3)}],
    purchases:Object.keys(pc).sort().map(k=>({name:k,amount:Math.round(pc[k])})),
    expenses:[{name:'薪資',amount:Math.round(r*0.22)},{name:'租金支出',amount:120000},{name:'水電瓦斯',amount:Math.round(r*0.04)},{name:'外送平台服務費',amount:Math.round(r*0.09)},{name:'雜支',amount:Math.round(r*0.02)}]}) }
/* 第二階段：9 月的耗損（多用的品項一半有登記，正好等於多用的量）＋一筆整份餐點報廢；9 月整月 POS 銷量（含一個套餐和一個不算的飲料） */
brand.posMap={'可樂':'x'}; brand.combos=[{id:'k1',name:'雙人套餐',price:500,lines:[{item:'m1',qty:1},{item:'m2',qty:1}]}];
const waste=[]; let wid=1, odd=0;
K.forEach(x=>{ if(V[x.k]!=null&&x.v>=0.12&&(odd++)%2===0){ const q=Math.round(x.mu*x.v); waste.push({id:'w'+(wid++),brand_id:'b1',waste_on:'2026-09-15',item_key:x.k,name:x.nm,qty:q,unit_cost:Math.round(price(x,12)/1000*1e6)/1e6,amount:Math.round(q*price(x,12)/1000*100)/100,reason:'過期',note:null,created_by_email:'pro@x.tw',created_at:'2026-09-15T10:00:00Z'}) } });
waste.push({id:'w'+(wid++),brand_id:'b1',waste_on:'2026-09-20',item_key:'m:m2',name:items[1].name,qty:2,unit_cost:100,amount:200,reason:'製作失誤',note:'翻鍋',created_by_email:'pro@x.tw',created_at:'2026-09-20T10:00:00Z'});
const sl=items.map(it=>{ const q=it.monthlySales-(it.id==='m1'||it.id==='m2'?20:0); return {key:'m:'+it.id,name:it.name,qty:q,amount:q*it.price} }).concat([{key:'k:k1',name:'雙人套餐（套餐）',qty:20,amount:10000}]);
const sales=[{id:'sl1',brand_id:'b1',start_on:'2026-09-01',end_on:'2026-09-30',source:'POS_202609.xlsx',lines:sl,unmatched:[{name:'可樂',qty:300,amount:9000,key:'x'}],qty_total:sl.reduce((t,l)=>t+l.qty,0)+300,amount_total:sl.reduce((t,l)=>t+l.amount,0)+9000,created_by_email:'marvintien90@gmail.com',created_at:'2026-10-01T00:00:00Z'}];
window.__BIG={brand,supp,rcv,counts,lines,plp,v:V,waste,sales};
})();
