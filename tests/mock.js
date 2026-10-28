/* 假的 supabase-js：記憶體資料庫，模擬會影響畫面的觸發程序與權限 */
(function(){
const P=window.__MOCK||{}; const role=P.role||'admin';
const users={admin:{id:'u-admin',email:'marvintien90@gmail.com'},pro:{id:'u-pro',email:'pro@x.tw'},basic:{id:'u-basic',email:'basic@x.tw'},pending:{id:'u-pend',email:'pend@x.tw'}};
const me=users[role]||null;
const brand={name:'測試石鍋',sample:false,settings:{defaultMarkup:15,targetRate:35,franchiseStores:1,directStores:0,logisticsPct:3,cycleDays:3,safetyPct:10,daysPerMonth:30},
 ingredients:[{id:'i1',cat:'肉類',name:'牛五花肉片',unit:'g',yield:100,markup:null,supply:'hq',buyPrice:420,packSize:1000,packUnit:'公斤'},
  {id:'i7',cat:'蔬菜',name:'洋蔥',unit:'g',yield:88,markup:null,supply:'self',buyPrice:35,packSize:1000,packUnit:'公斤'},
  {id:'i10',cat:'蛋豆',name:'雞蛋',unit:'顆',yield:100,markup:null,supply:'self',buyPrice:1100,packSize:200,packUnit:'箱(200顆)'},
  {id:'i12',cat:'乳品',name:'起司<絲>',unit:'g',yield:100,markup:null,supply:'self',buyPrice:320,packSize:1000,packUnit:'包(1kg)'}],
 semis:[{id:'s1',name:'招牌燒肉醬',unit:'g',lines:[{qty:2500,ref:'i:i12'}],markup:30,supply:'hq',packSize:1000,packUnit:'包(1kg)',batchYield:5000}],
 items:[{id:'m1',cat:'主餐',name:'招牌石鍋牛五花',lines:[{qty:120,ref:'i:i1'},{qty:40,ref:'s:s1'},{qty:40,ref:'i:i7'},{qty:1,ref:'i:i10'}],price:280,monthlySales:620}],
 periods:[],fixed:[],channels:[{name:'內用',comm:0,extra:0,pack:0,up:0}],priceLog:[],combos:[]};
const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
const db={bom_profiles:[{user_id:'u-admin',email:users.admin.email,role:'admin',status:'active',plan:'pro',access:'edit'},{user_id:'u-pro',email:'pro@x.tw',role:'client',status:'active',plan:'pro',access:'edit',expires_on:'2099-01-01'},{user_id:'u-basic',email:'basic@x.tw',role:'client',status:'active',plan:'basic',access:'view'},{user_id:'u-pend',email:'pend@x.tw',role:'client',status:'pending',plan:'basic',access:'edit'}],
 bom_brands:[{id:'b1',name:'測試石鍋',data:brand,rev:1},{id:'b2',name:'第二品牌',data:Object.assign({},brand,{name:'第二品牌',ingredients:[]}),rev:1}],
 bom_brand_access:[{user_id:'u-pro',brand_id:'b1'},{user_id:'u-basic',brand_id:'b1'}],
 bom_snapshots:[],bom_change_log:[],bom_uploads:[],bom_announcements:[],bom_announcement_reads:[],bom_public_settings:[{id:1}],bom_mail_log:[],
 bom_suppliers:[{id:'sp1',brand_id:'b1',name:'大成肉品',contact:'王先生',phone:'0912',active:true}],
 bom_receipts:[{id:'r0',brand_id:'b1',supplier_id:'sp1',supplier_name:'大成肉品',received_on:today.slice(0,8)+'01',lines:[{key:'i:i1',name:'牛五花肉片',qty:10,pack:1000,unit:'公斤',price:483,amount:4830}],total:4830,created_by_email:'pro@x.tw'}],
 bom_counts:[{id:'c0',brand_id:'b1',count_on:'2026-09-30',label:'9 月盤點',status:'closed',created_by_email:'pro@x.tw',closed_by_email:'pro@x.tw'}],
 bom_count_lines:[{count_id:'c0',brand_id:'b1',item_key:'i:i1',name:'牛五花肉片',qty_base:5500,unit_cost:0.483},{count_id:'c0',brand_id:'b1',item_key:'i:i7',name:'洋蔥',qty_base:3000,unit_cost:0.035}]};
window.__db=db; window.__fail=null;
const prof=()=>db.bom_profiles.find(p=>p.user_id===(me&&me.id));
const isAdmin=()=>{const p=prof(); return !!p&&p.role==='admin'};
const canRead=b=>isAdmin()||(prof()&&prof().status==='active'&&db.bom_brand_access.some(a=>a.user_id===me.id&&a.brand_id===b));
const canWrite=b=>isAdmin()||(canRead(b)&&prof().access==='edit');
const INV=['bom_suppliers','bom_receipts','bom_counts','bom_count_lines'];
let seq=1; const err=m=>({data:null,error:{message:m}});
function exec(q){ const T=db[q.t]||(db[q.t]=[]); let rows=T.filter(r=>q.f.every(f=>f(r)));
  if(INV.includes(q.t)) rows=rows.filter(r=>canRead(r.brand_id));
  if(q.t==='bom_brands') rows=rows.filter(r=>canRead(r.id));
  if(window.__fail&&window.__fail.t===q.t&&window.__fail.op===q.op) return err(window.__fail.msg);
  const em=me&&me.email;
  if(q.op==='select'){ let out=rows.slice(); q.o.forEach(o=>{}); for(let i=q.o.length-1;i>=0;i--){ const o=q.o[i]; out.sort((a,b)=>(a[o.c]>b[o.c]?1:a[o.c]<b[o.c]?-1:0)*(o.asc?1:-1)) } if(q.r) out=out.slice(q.r[0],q.r[1]+1); return {data:out.map(r=>JSON.parse(JSON.stringify(r))),error:null} }
  if(q.op==='insert'||q.op==='upsert'){ const arr=Array.isArray(q.v)?q.v:[q.v], out=[];
    for(const v0 of arr){ const v=Object.assign({},v0);
      if(INV.includes(q.t)&&!canWrite(v.brand_id)) return err('new row violates row-level security policy');
      if(q.t==='bom_count_lines'){ const c=db.bom_counts.find(x=>x.id===v.count_id); if(!c) return err('count not found'); if(c.status!=='open') return err('BOM_COUNT_CLOSED: 這張盤點單已完成，不能再修改'); v.brand_id=c.brand_id; v.counted_by_email=em;
        const ex=T.find(r=>r.count_id===v.count_id&&r.item_key===v.item_key); if(ex){ if(q.op!=='upsert') return err('duplicate'); Object.assign(ex,v); out.push(ex); continue } }
      if(q.t==='bom_counts'){ v.status='open'; v.created_by_email=em }
      if(q.t==='bom_receipts') v.created_by_email=em;
      if(q.t!=='bom_count_lines'&&!v.id) v.id='x'+(seq++); if(q.t==='bom_suppliers'&&v.active===undefined) v.active=true;
      T.push(v); out.push(v) }
    return {data:JSON.parse(JSON.stringify(out)),error:null} }
  if(q.op==='update'){ for(const r of rows){ if(INV.includes(q.t)&&!canWrite(r.brand_id)) return err('permission denied');
      if(q.t==='bom_counts'&&r.status==='closed'&&q.v.status==='open'&&!isAdmin()) return err('BOM_COUNT_CLOSED: 已完成的盤點只有顧問可以重新開啟');
      if(q.t==='bom_counts'&&q.v.status==='closed') q.v.closed_by_email=em;
      if(q.t==='bom_brands'){ if(r.rev!==q.v.rev-1) return err('BOM_CONFLICT') }
      Object.assign(r,q.v) } return {data:JSON.parse(JSON.stringify(rows)),error:null} }
  if(q.op==='delete'){ for(const r of rows){ if(INV.includes(q.t)&&!canWrite(r.brand_id)) return err('permission denied');
      if(q.t==='bom_counts'&&r.status==='closed'&&!isAdmin()) return err('BOM_COUNT_CLOSED: 已完成的盤點只有顧問可以刪除');
      if(q.t==='bom_count_lines'){ const c=db.bom_counts.find(x=>x.id===r.count_id); if(c&&c.status!=='open'&&!isAdmin()) return err('BOM_COUNT_CLOSED: 這張盤點單已完成，不能再修改') } }
    db[q.t]=T.filter(r=>!rows.includes(r)); if(q.t==='bom_counts') db.bom_count_lines=db.bom_count_lines.filter(l=>!rows.some(r=>r.id===l.count_id));
    if(q.t==='bom_suppliers') db.bom_receipts.forEach(x=>{ if(rows.some(r=>r.id===x.supplier_id)) x.supplier_id=null });
    return {data:null,error:null} } }
function B(t){ const q={t,op:'select',f:[],o:[],r:null,v:null,one:false,maybe:false};
  const b={select(){ return b }, insert(v){ q.op='insert'; q.v=v; return b }, upsert(v){ q.op='upsert'; q.v=v; return b }, update(v){ q.op='update'; q.v=v; return b }, delete(){ q.op='delete'; return b },
    eq(c,v){ q.f.push(r=>r[c]===v); return b }, neq(c,v){ q.f.push(r=>r[c]!==v); return b }, in(c,v){ q.f.push(r=>v.includes(r[c])); return b }, gte(c,v){ q.f.push(r=>r[c]>=v); return b }, gt(c,v){ q.f.push(r=>r[c]>v); return b }, lte(){ return b }, is(){ return b }, or(){ return b },
    order(c,o){ q.o.push({c,asc:!o||o.ascending!==false}); return b }, limit(n){ q.r=[0,n-1]; return b }, range(a,z){ q.r=[a,z]; return b },
    single(){ q.one=true; return b }, maybeSingle(){ q.maybe=true; return b },
    then(res,rej){ return new Promise(r=>setTimeout(r,5)).then(()=>{ const x=exec(q); if(x.error) return x; if(q.one||q.maybe){ const d=x.data||[]; return {data:d[0]||null,error:q.one&&!d[0]?{message:'no rows'}:null} } return x }).then(res,rej) } };
  return b }
window.supabase={createClient(){ return {from:B, rpc:async()=>({data:null,error:null}),
  auth:{getSession:async()=>({data:{session:me?{user:me}:null}}),onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}} },signOut:async()=>({}),signInWithPassword:async()=>({error:{message:'x'}})},
  storage:{from:()=>({upload:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:'#'}})})},
  channel:()=>({on(){ return this },subscribe(){ return this }}),removeChannel(){} } }};
})();
