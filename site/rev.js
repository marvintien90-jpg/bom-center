/* 反向找點 v2：依業態與目標找商圈
   用到主頁的全域：$, esc, nf, css, map, layer, heatL, pin, site, last, VILL, RENT, DATA, T, C, FULL, j, base,
   SiteScore, TUNE, run, render, loadHist, status
   需在 index.html 主程式之後載入。 */
(function(){
const say=(t,type)=>{ if(window.Kit&&Kit.toast) return Kit.toast(t,type||'ok');
  let b=document.querySelector('.rtoasts'); if(!b){b=document.createElement('div');b.className='rtoasts';b.setAttribute('role','status');document.body.appendChild(b)}
  const el=document.createElement('div'); el.className='rtoast '+(type||''); el.textContent=t; b.appendChild(el); setTimeout(()=>el.remove(),4200)};
window.revSay=say;
const typing=e=>{const t=e.target; return t&&(t.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))};
const pct=x=>x==null?'—':Math.round(x*100)+'%';

// ---------- 目標客群 ----------
const RSEG=[...SiteScore.SEGS.map(x=>[x.k,x.label+'（'+x.note+'）']),['office','日間上班族'],['income','高所得家庭'],['single','小家庭／單身戶']];
const RDEF={breakfast:['kid','teen','family'],bento:['work','office'],noodle:['work','young'],drink:['teen','young'],cafe:['work','office','income'],dinner:['family','mid','income'],night:['young','work','single']};
for(const [k,f] of Object.entries(SiteScore.FORMATS)) $('#rFmt').insertAdjacentHTML('beforeend',`<option value="${k}">${f.label}</option>`);
$('#rFmt').value='noodle';
function rSegUI(){const on=new Set(RDEF[$('#rFmt').value]||[]); $('#rSegs').innerHTML=RSEG.map(([k,l])=>`<label class="chip ${on.has(k)?'':'off'}"><input type="checkbox" data-seg="${k}" ${on.has(k)?'checked':''}>${esc(l)}</label>`).join('');
  $('#rSegs').querySelectorAll('input').forEach(b=>b.onchange=()=>b.parentNode.classList.toggle('off',!b.checked));
  const F=SiteScore.FORMATS[$('#rFmt').value]; $('#rTicket').placeholder='預設 '+F.ticket+' 元';}
$('#rFmt').onchange=rSegUI; rSegUI();

// ---------- 區域：縣市＋多選行政區 ----------
let AREA=null;
const selTowns=()=>[...$('#rTowns').querySelectorAll('input:checked')].map(x=>x.value);
function townCount(){ if(!VILL) return; const c=$('#rCity').value, ts=new Set(selTowns()); const n=VILL.filter(v=>v.pop&&v.c===c&&(!ts.size||ts.has(v.t))).length;
  $('#rTownN').textContent=`${ts.size?`已選 ${ts.size} 個行政區，`:'全部行政區，'}共 ${nf(n)} 個里${n>MAXV?`（會先挑人口密度最高的 ${MAXV} 個）`:''}`}
async function rAreas(){ await base(); if(AREA) return; AREA={}; for(const v of VILL){ if(!v.pop) continue; (AREA[v.c]=AREA[v.c]||new Set()).add(v.t)}
  const cs=Object.keys(AREA).sort((a,b)=>a.localeCompare(b,'zh-Hant')); $('#rCity').innerHTML=cs.map(c=>`<option>${esc(c)}</option>`).join('');
  const fill=(pre)=>{const ts=[...AREA[$('#rCity').value]].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
    $('#rTowns').innerHTML=ts.map(t=>`<label class="chip ${pre&&pre.includes(t)?'':'off'}"><input type="checkbox" value="${esc(t)}" ${pre&&pre.includes(t)?'checked':''}>${esc(t)}</label>`).join('');
    $('#rTowns').querySelectorAll('input').forEach(b=>b.onchange=()=>{b.parentNode.classList.toggle('off',!b.checked); townCount()}); townCount()};
  $('#rCity').onchange=()=>fill([]);
  if(cs.includes('臺北市')) $('#rCity').value='臺北市'; fill(['大安區']);
  $('#rTAll').onclick=()=>{$('#rTowns').querySelectorAll('input').forEach(b=>{b.checked=true;b.parentNode.classList.remove('off')}); townCount()};
  $('#rTNone').onclick=()=>{$('#rTowns').querySelectorAll('input').forEach(b=>{b.checked=false;b.parentNode.classList.add('off')}); townCount()};
}
const MAXV=600;

// ---------- 模式切換 ----------
window.REVMODE=false;
function setMode(rev){ window.REVMODE=rev; document.body.classList.toggle('rev',rev);
  $('#mRev').classList.toggle('on',rev); $('#mFwd').classList.toggle('on',!rev); $('#mRev').setAttribute('aria-selected',rev); $('#mFwd').setAttribute('aria-selected',!rev);
  $('#revCard').hidden=!rev; $('#fwdCard').hidden=rev; $('#out').hidden=rev; $('#cmp').hidden=rev; $('#tune').hidden=rev||!last; $('#rOut').hidden=!rev; $('#layers').hidden=rev; $('#mapTip').hidden=rev;
  $('#hist').hidden=rev||!loadHist().length; legend(rev);
  setTimeout(()=>map.invalidateSize(),0); rev?map.scrollWheelZoom.enable():map.scrollWheelZoom.disable();
  layer.clearLayers(); heatL.clearLayers(); if(pin){pin.remove();pin=null}
  if(rev){ if(!AREA) rAreas(); if(REV) draw(true) } else if(last){ render(true) } }
window.setMode=setMode;
$('#mFwd').onclick=()=>setMode(false); $('#mRev').onclick=()=>setMode(true);

// ---------- 讀圖磚（店家＋道路），快取 ----------
const TP={};
async function tile(k){ if(k in TP) return TP[k]; const t=await j(`${DATA}tiles/${k}.json`); const pois=[], roads=[];
  if(t){ for(const p of t.p) pois.push({cat:p[0],lat:p[1]/1e5,lon:p[2]/1e5,name:p[3],sub:p[4],brand:p[5]||''});
    for(const [k2,v] of Object.entries(t.r||{})){const [a,b]=k2.split('_').map(Number); roads.push({lat:(a+.5)*C,lon:(b+.5)*C,cls:v[0],name:v[1]})} }
  return TP[k]={pois,roads}}
async function ctxFast(s){const ti=Math.floor(s.lat/T), tj=Math.floor(s.lon/T), ks=[]; for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++) ks.push(`${ti+a}_${tj+b}`);
  const parts=await Promise.all(ks.map(tile)); return {pois:[].concat(...parts.map(p=>p.pois)),roads:[].concat(...parts.map(p=>p.roads)),villages:VILL}}

// ---------- 找點 ----------
let REV=null, RUNID=0;
async function revRun(){
  if(!FULL){say('請先用顧問帳號登入','bad');$('#rStatus').textContent='請先用顧問帳號登入';return}
  await rAreas();
  const fmt=$('#rFmt').value, F=SiteScore.FORMATS[fmt], ticket=+$('#rTicket').value||F.ticket, target=(+$('#rTarget').value||0)*10000, rentCap=(+$('#rRent').value||0)*10000, ping=+$('#rPing').value||20;
  const segs=[...$('#rSegs').querySelectorAll('input:checked')].map(x=>x.dataset.seg);
  const city=$('#rCity').value, towns=selTowns(), ts=new Set(towns);
  let vs=VILL.filter(v=>v.pop&&v.c===city&&(!ts.size||ts.has(v.t)));
  if(!vs.length){say('這個區域沒有資料','bad');return}
  const total=vs.length; if(vs.length>MAXV) vs=vs.sort((a,b)=>b.pop/(b.km2||1)-a.pop/(a.km2||1)).slice(0,MAXV);
  const id=++RUNID; $('#rGo').disabled=true; const need=target?Math.ceil(target/30/ticket):null, out=[];
  // 行政區層級：稅籍餐飲登記家數、近一年新登記比例
  const biz=await j(`${DATA}biz/${city}.json`)||{}; const tpop={}; for(const v of VILL) if(v.c===city) tpop[v.t]=(tpop[v.t]||0)+(v.pop||0);
  try{
    for(let i=0;i<vs.length;i++){ const v=vs[i]; if(i%12===0){$('#rStatus').textContent=`評估中… ${i}/${vs.length} 個里`; await new Promise(r=>setTimeout(r,0)); if(id!==RUNID) return}
      const s={lat:v.lat,lon:v.lon}, ctx=await ctxFast(s);
      const mk=RENT[`${v.c}|${v.t}`]||null, estRent=mk?Math.round(mk[0]*ping):null;
      const res=SiteScore.evaluate(s,ctx,{format:fmt,ticket,rent:estRent||0,ping});
      const fit=SiteScore.segFit(res.profile,segs);
      const cap=SiteScore.capacity(s,ctx,{format:fmt,ticket},F.radius);
      const attain=need?Math.min(1.5,cap.daily/need):null;
      let score=res.total*(fit?.5:.7)+(fit?fit.score*.25:0)+(attain!=null?Math.min(100,attain*80)*.25:res.total*.3);
      if(rentCap&&estRent&&estRent>rentCap) score-=8;
      const n=res.numbers, a=n.a10, at=a?a.reduce((x,y)=>x+y,0)||1:0, tb=biz[`${v.t}|`];
      const m={pop5:n.pop5, inc:n.inc, young:a?(a[3]+a[4])/at:null, old:a?(a[8]+a[9])/at:null, kids:a?(a[0]+a[1]+a[2])/at:null,
        flow:res.dims.flow, access:res.dims.access, comp:res.dims.comp, st:n.stations[0]?n.stations[0].d:null, stName:n.stations[0]?n.stations[0].name:'',
        conv:n.conv, school:n.school, office:n.office, hospital:n.hospital, mall:n.mall, bus:n.bus, parking:n.parking, hotel:n.hotel, attract:n.attract,
        same:n.same, sub:n.sub, chain:n.chains, foodR:n.foodR, road:n.roadCls, mk:mk?mk[0]:null, mkN:mk?mk[1]:0, estRent,
        rentPct:estRent&&target?estRent/target:null, attain, fit:fit?fit.avg:null, total:res.total,
        tBiz:tb?tb[0]:null, tNew:tb&&tb[0]?tb[1]/tb[0]:null, tPerK:tb&&tpop[v.t]?tb[0]/tpop[v.t]*1000:null};
      for(const k of Object.keys(res.daypart)) m['d_'+k]=res.daypart[k];
      out.push({v,s,res,fit,cap,attain,estRent,mk,m,score:Math.round(score)});
    }
    REV={fmt,F,ticket,target,need,rentCap,ping,segs,city,towns,total,list:out};
    $('#rFilt').hidden=false; buildFilters(); draw(true); $('#mapCard').scrollIntoView({behavior:'smooth',block:'start'});
    const ok=need?out.filter(o=>o.attain>=1).length:null;
    $('#rStatus').textContent=`評估了 ${out.length} 個里`;
    say(`找點完成：評估 ${out.length} 個里${ok!=null?`，預設商圈就撐得到目標的有 ${ok} 個`:''}。可以用左邊的篩選條件縮小範圍。`,'ok');
  }catch(e){console.error(e);say('找點失敗：'+e.message,'bad');$('#rStatus').textContent='找點失敗'}
  finally{ if(id===RUNID) $('#rGo').disabled=false }
}
$('#rGo').onclick=revRun;

// ---------- 篩選條件 ----------
// t:'min' 至少、'max' 最多；none：拉到這個值代表不限
const DP={breakfast:'早餐',lunch:'午餐',afternoon:'下午茶',dinner:'晚餐',late:'宵夜'};
const FG=[
  ['綜合與立地',[
    {k:'score',l:'綜合分至少',t:'min',min:0,max:90,step:5,u:'分',v:o=>o.score},
    {k:'total',l:'立地總分至少',t:'min',min:0,max:90,step:5,u:'分',v:o=>o.m.total},
    {k:'attain',l:'目標營收達成度至少',t:'min',min:0,max:150,step:10,u:'%',v:o=>o.m.attain==null?null:o.m.attain*100,need:'target'},
  ]],
  ['客群與消費力',[
    {k:'pop5',l:'500 公尺內居民至少',t:'min',min:0,max:30000,step:1000,u:'人',v:o=>o.m.pop5},
    {k:'fit',l:'目標客群指數至少（100＝全台平均）',t:'min',min:0,max:160,step:5,u:'',v:o=>o.m.fit,need:'segs'},
    {k:'inc',l:'所得中位數至少',t:'min',min:0,max:1200,step:50,u:'千元',v:o=>o.m.inc},
    {k:'incMax',l:'所得中位數最多',t:'max',min:300,max:1500,step:50,u:'千元',v:o=>o.m.inc,none:1500},
    {k:'young',l:'19–34 歲占比至少（學生、年輕上班族）',t:'min',min:0,max:30,step:1,u:'%',v:o=>o.m.young==null?null:o.m.young*100},
    {k:'kids',l:'18 歲以下占比至少（有小孩的家庭）',t:'min',min:0,max:30,step:1,u:'%',v:o=>o.m.kids==null?null:o.m.kids*100},
    {k:'old',l:'65 歲以上占比最多',t:'max',min:5,max:40,step:1,u:'%',v:o=>o.m.old==null?null:o.m.old*100,none:40},
  ]],
  ['人流與周邊設施',[
    {k:'flow',l:'人流分數至少',t:'min',min:0,max:95,step:5,u:'分',v:o=>o.m.flow},
    {k:'st',l:'離捷運／火車站最遠',t:'max',min:100,max:1000,step:50,u:'公尺',v:o=>o.m.st,none:1000},
    {k:'conv',l:'300 公尺內便利商店至少',t:'min',min:0,max:15,step:1,u:'家',v:o=>o.m.conv},
    {k:'bus',l:'300 公尺內公車站至少',t:'min',min:0,max:20,step:1,u:'站',v:o=>o.m.bus},
    {k:'office',l:'500 公尺內辦公點至少',t:'min',min:0,max:60,step:2,u:'個',v:o=>o.m.office},
    {k:'school',l:'500 公尺內學校至少',t:'min',min:0,max:10,step:1,u:'所',v:o=>o.m.school},
    {k:'hospital',l:'500 公尺內醫院診所至少',t:'min',min:0,max:20,step:1,u:'家',v:o=>o.m.hospital},
    {k:'mall',l:'500 公尺內商場／市場／超市至少',t:'min',min:0,max:10,step:1,u:'處',v:o=>o.m.mall},
    {k:'attract',l:'500 公尺內景點／休閒至少',t:'min',min:0,max:15,step:1,u:'處',v:o=>o.m.attract},
    {k:'day',l:'主力時段',t:'sel',opts:[['','不限'],...Object.entries(DP)],v:o=>o},
    {k:'dayMin',l:'主力時段潛力至少',t:'min',min:0,max:90,step:5,u:'分',v:null},
  ]],
  ['交通與停車',[
    {k:'access',l:'交通分數至少',t:'min',min:0,max:95,step:5,u:'分',v:o=>o.m.access},
    {k:'parking',l:'300 公尺內停車場至少',t:'min',min:0,max:10,step:1,u:'處',v:o=>o.m.parking},
  ]],
  ['競爭',[
    {k:'same',l:'商圈內直接競爭最多',t:'max',min:0,max:40,step:1,u:'家',v:o=>o.m.same,none:40},
    {k:'sub',l:'商圈內替代競爭最多',t:'max',min:0,max:150,step:5,u:'家',v:o=>o.m.sub,none:150},
    {k:'chain',l:'連鎖同業最多',t:'max',min:0,max:10,step:1,u:'家',v:o=>o.m.chain,none:10},
    {k:'cluster',l:'餐飲聚集程度',t:'sel',opts:[['','不限'],['hot','聚集商圈（周邊餐飲 40 家以上）'],['mid','一般（10–40 家）'],['calm','較空白（10 家以下）']],v:o=>o},
    {k:'tNew',l:'行政區近一年新登記餐飲比例最多（換手快代表風險）',t:'max',min:5,max:40,step:1,u:'%',v:o=>o.m.tNew==null?null:o.m.tNew*100,none:40},
  ]],
  ['租金',[
    {k:'mk',l:'1 樓店面行情最多（元／坪）',t:'max',min:500,max:8000,step:100,u:'元',v:o=>o.m.mk,none:8000},
    {k:'rentPct',l:'租金占目標營收最多（3–5% 優良、8% 紅燈）',t:'max',min:3,max:15,step:.5,u:'%',v:o=>o.m.rentPct==null?null:o.m.rentPct*100,none:15,need:'target'},
  ]],
];
const FALL=FG.flatMap(g=>g[1]); const FBY=Object.fromEntries(FALL.map(f=>[f.k,f]));
const neutral=f=>f.t==='sel'?'':f.t==='min'?(f.k==='dayMin'?60:f.min):f.none;
let FV={}; const resetFV=()=>{FV={}; for(const f of FALL) FV[f.k]=neutral(f)}; resetFV();
const active=f=>f.k!=='dayMin'&&FV[f.k]!==neutral(f);
const PRE=[
  ['人流熱區',{flow:70,conv:5,st:500}],
  ['住宅社區',{pop5:12000}],
  ['辦公午餐',{office:10,day:'lunch',dayMin:60}],
  ['學區',{school:3,kids:16}],
  ['年輕客群',{young:21}],
  ['高消費力',{inc:700}],
  ['低競爭藍海',{same:3,chain:0}],
  ['開車族好停',{parking:3,access:60}],
  ['撐得到目標',{attain:100},'target'],
  ['租金優良',{rentPct:5},'target'],
];
const SORTS=[['score','綜合分（高→低）'],['total','立地總分（高→低）'],['fit','目標客群指數（高→低）'],['attain','目標營收達成度（高→低）'],['flow','人流分數（高→低）'],['same','直接競爭（少→多）'],['mk','店面行情（低→高）'],['pop5','居民數（多→少）'],['inc','所得（高→低）']];
let SORT='score';
function fmtV(f,x){ if(f.t==='max'&&x===f.none) return '不限'; if(f.t==='min'&&x===f.min&&f.k!=='dayMin') return '不限'; return (f.k==='pop5'||f.k==='mk'?nf(x):x)+' '+f.u }
function usable(f){ return !(f.need==='target'&&!REV.need)&&!(f.need==='segs'&&!REV.segs.length) }
function buildFilters(){
  $('#rSort').innerHTML=SORTS.filter(([k])=>!(k==='fit'&&!REV.segs.length)&&!(k==='attain'&&!REV.need)).map(([k,l])=>`<option value="${k}">${l}</option>`).join('');
  if(![...$('#rSort').options].some(o=>o.value===SORT)) SORT='score'; $('#rSort').value=SORT; $('#rSort').onchange=()=>{SORT=$('#rSort').value; draw(false)};
  $('#rPre').innerHTML=PRE.map(([l,,need],i)=>need==='target'&&!REV.need?'':`<button type="button" data-p="${i}">${l}</button>`).join('');
  $('#rPre').querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const [l,set]=PRE[+b.dataset.p]; const on=b.classList.toggle('on');
    for(const [k,v] of Object.entries(set)) FV[k]=on?v:neutral(FBY[k]); syncUI(); draw(false)});
  const wide=innerWidth>980; $('#rFG').innerHTML=FG.map(([g,fs],gi)=>`<details class="fg" ${wide&&gi<2?'open':''} data-g="${gi}"><summary>${g}<span class="on" data-on="${gi}"></span></summary><div class="fgb">${fs.map(f=>{const dis=!usable(f);
    if(f.t==='sel') return `<div class="fs1"><span>${f.l}</span><span></span><select data-f="${f.k}">${f.opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>`;
    return `<div class="fs1 ${dis?'dis':''}" ${dis?`title="${f.need==='target'?'要先填目標月營收':'要先選目標客群'}"`:''}><label for="f_${f.k}" style="margin:0;color:inherit;font-size:13.5px">${f.l}</label><output id="o_${f.k}"></output><input type="range" id="f_${f.k}" data-f="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" ${dis?'disabled':''}></div>`}).join('')}</div></details>`).join('');
  let tmr=0;
  $('#rFG').querySelectorAll('[data-f]').forEach(el=>{const f=FBY[el.dataset.f];
    el.oninput=el.onchange=()=>{FV[f.k]=f.t==='sel'?el.value:+el.value; syncOut(); clearTimeout(tmr); tmr=setTimeout(()=>draw(false),120)}});
  $('#rShowOff').onchange=()=>draw(false);
  syncUI();
}
function syncOut(){ for(const f of FALL){ const o=$('#o_'+f.k); if(o){o.textContent=fmtV(f,FV[f.k]); o.classList.toggle('none',!active(f))} }
  FG.forEach(([,fs],gi)=>{const n=fs.filter(f=>usable(f)&&active(f)).length; const s=$(`[data-on="${gi}"]`); if(s) s.textContent=n?`已設 ${n} 項`:''});
  $('#f_dayMin')&&($('#f_dayMin').closest('.fs1').classList.toggle('dis',!FV.day)) }
function syncUI(){ for(const f of FALL){const el=$(`[data-f="${f.k}"]`); if(el) el.value=FV[f.k]} syncOut() }
$('#rClear').onclick=()=>clearF();
function clearF(){ resetFV(); $('#rPre').querySelectorAll('.on').forEach(b=>b.classList.remove('on')); syncUI(); if(REV) draw(false) }
function pass(o){ for(const f of FALL){ if(!usable(f)||!active(f)||f.v==null) continue;
    if(f.k==='day'){ if((o.m['d_'+FV.day]??0)<FV.dayMin) return false; continue }
    if(f.k==='cluster'){ const r=o.m.foodR; if(FV.cluster==='hot'&&r<40||FV.cluster==='mid'&&(r<10||r>=40)||FV.cluster==='calm'&&r>=10) return false; continue }
    const x=f.v(o); if(x==null) continue;   // 沒資料的里不因這項被排除
    if(f.t==='min'&&x<FV[f.k]) return false; if(f.t==='max'&&x>FV[f.k]) return false }
  return true }
const SK={score:o=>-o.score,total:o=>-o.m.total,fit:o=>-(o.m.fit??0),attain:o=>-(o.m.attain??0),flow:o=>-o.m.flow,same:o=>o.m.same*1000-o.score,mk:o=>(o.m.mk??1e9)*10-o.score,pop5:o=>-o.m.pop5,inc:o=>-(o.m.inc??0)};

// ---------- 地圖：圖示、提示、資訊卡 ----------
const rcol=v=>v>=75?css('--good'):v>=60?css('--accent'):v>=45?css('--warn'):css('--bad');
let SHOWN=[], SEL=-1, MK=[], SUGID=0, NSHOW=20;
const nm=o=>o.v.t+o.v.v;
function why(o){const R=REV,t=[]; if(o.fit&&o.fit.avg>=115) t.push(`目標客群偏多（指數 ${o.fit.avg}）`); if(o.m.flow>=70) t.push('人流強'); if(o.m.comp>=70) t.push('競爭少'); else if(o.m.comp<45) t.push('競爭激烈');
  if(o.m.st!=null&&o.m.st<=300) t.push(`近${o.m.stName||'車站'}`); if(o.m.office>=15) t.push('辦公點多'); if(o.m.school>=3) t.push('學校多'); if(o.m.inc>=800) t.push('消費力高');
  if(o.attain!=null&&o.attain<1) t.push('預設商圈撐不到目標'); if(R.rentCap&&o.estRent>R.rentCap) t.push('行情租金可能超過上限'); return t.join('、')||'各面向平均'}
function sugTxt(o){ const R=REV; return o.sug?(o.sug.ok?o.sug.radius+' 公尺':'超過 1,500 公尺'):R.need?'計算中…':R.F.radius+' 公尺（預設）' }
function popFor(o,i){ const R=REV, m=o.m;
  return `<div class="pc"><div class="pc-h">${i>=0?`<span class="num" style="background:${rcol(o.score)}">${i+1}</span>`:''}<b>${esc(nm(o))}</b></div>
  <div class="pc-s"><div><b>${o.score}</b><span>綜合</span></div><div><b>${m.total}<small> ${o.res.grade}</small></b><span>立地</span></div><div><b>${m.fit??'—'}</b><span>客群指數</span></div><div><b class="${m.attain!=null&&m.attain>=1?'ok':''}">${m.attain!=null?pct(m.attain):'—'}</b><span>目標達成</span></div></div>
  <dl class="pc-k">
    <dt>500 公尺內居民</dt><dd>${nf(m.pop5)} 人</dd>
    <dt>所得中位數</dt><dd>${m.inc?nf(m.inc)+' 千元':'—'}</dd>
    <dt>19–34 歲／65 歲以上</dt><dd>${pct(m.young)}／${pct(m.old)}</dd>
    <dt>人流／交通分數</dt><dd>${m.flow}／${m.access}</dd>
    <dt>最近車站</dt><dd>${m.st!=null?esc(m.stName||'車站')+' '+nf(m.st)+' 公尺':'500 公尺內沒有'}</dd>
    <dt>便利商店／辦公／學校</dt><dd>${m.conv}／${m.office}／${m.school}</dd>
    <dt>直接／替代競爭</dt><dd>${m.same}／${m.sub} 家${m.chain?`（連鎖 ${m.chain}）`:''}</dd>
    <dt>可支撐每日來客</dt><dd>${nf(o.cap.daily)}${R.need?' / '+nf(R.need):''} 位</dd>
    <dt>建議商圈半徑</dt><dd>${sugTxt(o)}</dd>
    <dt>店面行情</dt><dd>${m.mk?nf(m.mk)+' 元／坪':'—'}${m.estRent?`<br><span class="note">${R.ping} 坪約 ${nf(m.estRent/10000)} 萬${m.rentPct!=null?`（占目標 ${(m.rentPct*100).toFixed(1)}%）`:''}</span>`:''}</dd>
  </dl>
  <p class="pc-w">重點：${esc(why(o))}</p>
  <div class="pc-b"><button class="pri" data-pa="open">完整評估 <kbd>E</kbd></button><button data-pa="zoom">放大這裡</button></div></div>` }
function ttFor(o,i){ return `<b>${i>=0?(i+1)+'. ':''}${esc(nm(o))}</b><span>綜合 ${o.score}｜立地 ${o.m.total} ${o.res.grade}${o.m.attain!=null?'｜達成 '+pct(o.m.attain):''}</span><span>點一下看詳細資料</span>` }
function openPop(o,i){ const p=L.popup({maxWidth:340,minWidth:300,autoPanPaddingTopLeft:[20,60],autoPanPaddingBottomRight:[20,20]}).setLatLng([o.s.lat,o.s.lon]).setContent(popFor(o,i));
  p.on('add',()=>{ const el=p.getElement(); if(!el) return; el.querySelector('[data-pa=open]').onclick=()=>revOpen(o); el.querySelector('[data-pa=zoom]').onclick=()=>map.setView([o.s.lat,o.s.lon],17) });
  p.openOn(map); SEL=i; hl(i) }
function hl(i){ $('#rOut').querySelectorAll('tbody tr').forEach(tr=>tr.classList.toggle('hl',+tr.dataset.i===i)) }
function legend(on){ if(!window.LEG){ window.LEG=L.control({position:'bottomleft'}); LEG.onAdd=()=>{const d=L.DomUtil.create('div','mlegend'); d.innerHTML=`<i style="background:${css('--good')}"></i>75+<i style="background:${css('--accent')}"></i>60–74<i style="background:${css('--warn')}"></i>45–59<i style="background:${css('--bad')}"></i>45 以下<i style="background:#9aa5a1"></i>不符合篩選`; return d} }
  on?LEG.addTo(map):LEG.remove() }

function draw(fit){ const R=REV; if(!R) return; layer.clearLayers(); heatL.clearLayers(); map.closePopup();
  const ok=R.list.filter(pass).sort((a,b)=>SK[SORT](a)-SK[SORT](b)), bad=R.list.filter(o=>!ok.includes(o));
  const PREV=SHOWN.length||fit; SHOWN=ok; SEL=-1; const top=ok.slice(0,10);
  $('#rCount').innerHTML=`符合 <b>${ok.length}</b> / ${R.list.length} 個里`;
  if(!ok.length&&R.list.length&&PREV) say('沒有里符合全部條件，放寬篩選（例如把「不限」打開）再看看。','info');
  if($('#rShowOff').checked) for(const o of bad) L.circleMarker([o.s.lat,o.s.lon],{radius:3,color:'#9aa5a1',weight:0,fillColor:'#9aa5a1',fillOpacity:.45,bubblingMouseEvents:false})
    .bindTooltip(`<b>${esc(nm(o))}</b><span>不符合目前的篩選條件</span>`,{className:'tip tt',direction:'top'}).on('click',()=>openPop(o,-1)).addTo(layer);
  ok.slice(10).forEach((o,k)=>L.circleMarker([o.s.lat,o.s.lon],{radius:5,color:'#fff',weight:1,fillColor:rcol(o.score),fillOpacity:.85,bubblingMouseEvents:false})
    .bindTooltip(ttFor(o,k+10),{className:'tip tt',direction:'top',offset:[0,-4]}).on('click',()=>openPop(o,k+10)).addTo(layer));
  MK=top.map((o,i)=>{ const c=L.circle([o.s.lat,o.s.lon],{radius:o.sug?o.sug.radius:R.F.radius,color:rcol(o.score),weight:i<3?2:1,fillOpacity:i<3?.08:.03,interactive:false}).addTo(layer);
    L.marker([o.s.lat,o.s.lon],{icon:L.divIcon({className:'',html:`<span class="num" style="background:${rcol(o.score)}">${i+1}</span>`,iconSize:[22,22],iconAnchor:[11,11]}),zIndexOffset:500-i,keyboard:false})
     .bindTooltip(ttFor(o,i),{className:'tip tt',direction:'top',offset:[0,-12]}).on('click',()=>openPop(o,i)).addTo(layer); return c});
  if(fit) fitRes();
  table(); sugTop(top);
}
function fitRes(){ const top=SHOWN.slice(0,10); setTimeout(()=>{map.invalidateSize(); if(top.length) map.fitBounds(L.latLngBounds(top.map(o=>[o.s.lat,o.s.lon])).pad(0.25),{maxZoom:16})},30) }
// 建議商圈半徑：只算前 10 名，算完補回表格與地圖圓圈
async function sugTop(top){ const R=REV; if(!R.need) return; const id=++SUGID;
  for(let i=0;i<top.length;i++){ const o=top[i]; if(o.sug) continue; await new Promise(r=>setTimeout(r,0)); if(id!==SUGID) return;
    const ctx=await ctxFast(o.s); o.sug=SiteScore.suggestRadius(o.s,ctx,{format:R.fmt,ticket:R.ticket},R.need);
    if(MK[i]) MK[i].setRadius(o.sug.radius); const td=$(`#rOut [data-sug="${i}"]`); if(td) td.textContent=sugTxt(o) } }

function table(){ const R=REV, ok=SHOWN, list=ok.slice(0,NSHOW), segL=R.segs.map(k=>(RSEG.find(x=>x[0]===k)||[,k])[1].replace(/（.*/,''));
  const mks=new Set(R.list.map(o=>o.mk?o.mk[0]:'-')), oneMk=mks.size===1, m0=R.list[0]&&R.list[0].mk, e0=R.list[0]&&R.list[0].estRent;
  const where=R.towns.length?(R.towns.length<=3?R.towns.join('、'):`${R.towns.slice(0,3).join('、')} 等 ${R.towns.length} 區`):'全部行政區';
  const mkNote=oneMk&&m0?`<p>${esc(R.towns[0]||R.city)} 1 樓店面租金行情約 <b>${nf(m0[0])}</b> 元／坪（實價登錄 ${m0[1]} 筆），${R.ping} 坪約 ${nf(e0/10000)} 萬／月${R.rentCap?(e0>R.rentCap?`，<b class="bad">高於你設定的上限 ${nf(R.rentCap/10000)} 萬</b>，要找巷內或較小坪數`:`，在上限 ${nf(R.rentCap/10000)} 萬以內`):''}。${R.target?`租金占目標營收約 ${Math.round(e0/R.target*1000)/10}%（3–5% 優良、8% 以上紅燈）。`:''}</p>`:'';
  const okN=R.need?ok.filter(o=>o.attain>=1).length:null;
  $('#rOut').innerHTML=`<div class="card"><h2>找點結果：${esc(R.city)}${esc(where)}・${esc(R.F.label)}</h2>
    <p>${R.need?`目標月營收 ${nf(R.target/10000)} 萬、客單價 ${nf(R.ticket)} 元，每天需要約 <b>${nf(R.need)}</b> 位客人。`:''}評估了 ${R.list.length} 個里${R.total>R.list.length?`（區內共 ${nf(R.total)} 個，先挑人口密度最高的）`:''}，符合篩選條件的有 <b>${ok.length}</b> 個${okN!=null?`，其中在預設商圈（${R.F.radius} 公尺）內就撐得到目標的有 <b>${okN}</b> 個`:''}。${segL.length?`目標客群：${esc(segL.join('、'))}。`:''}</p>
    ${mkNote}${R.need&&ok.length&&!okN?`<p class="bad">符合條件的里在預設商圈內都撐不到目標，建議：擴大商圈（看下表建議半徑）、拉高客單價、加做外送，或換一個區域。</p>`:''}
    ${ok.length?`<div class="scroll tblwrap"><table><thead><tr><th>#</th><th>位置</th><th>綜合</th><th>立地</th>${R.segs.length?'<th>客群</th>':''}<th>居民 500m</th><th>所得</th><th>人流</th><th>直接／替代競爭</th><th>最近車站</th><th>可支撐每日來客</th><th>建議商圈半徑</th>${oneMk?'':'<th>店面行情</th>'}<th>重點</th><th></th></tr></thead><tbody>
    ${list.map((o,i)=>`<tr data-i="${i}"><td>${i<10?`<span class="num" style="background:${rcol(o.score)}">${i+1}</span>`:i+1}</td><td>${esc(nm(o))}</td><td><b>${o.score}</b></td><td>${o.m.total} ${o.res.grade}</td>${R.segs.length?`<td>${o.m.fit??'—'}</td>`:''}
      <td>${nf(o.m.pop5)}</td><td>${o.m.inc?nf(o.m.inc)+'千':'—'}</td><td>${o.m.flow}</td><td>${o.m.same}／${o.m.sub}</td><td>${o.m.st!=null?nf(o.m.st)+' m':'—'}</td>
      <td>${nf(o.cap.daily)}${R.need?` / ${nf(R.need)}`:''}</td><td data-sug="${i}">${i<10?sugTxt(o):'—'}</td>
      ${oneMk?'':`<td>${o.mk?nf(o.mk[0])+' 元/坪'+(o.estRent?`<br><span class="note">${R.ping} 坪約 ${nf(o.estRent/10000)} 萬${R.rentCap&&o.estRent>R.rentCap?' <b class="bad">超過上限</b>':''}</span>`:''):'—'}</td>`}
      <td class="note" style="white-space:normal;min-width:160px">${esc(why(o))}</td><td><button data-ro="${i}">完整評估</button></td></tr>`).join('')}</tbody></table></div>
    ${ok.length>NSHOW?`<div class="row"><button id="rMore">再顯示 20 個（共 ${ok.length} 個）</button></div>`:''}`:'<p class="note">沒有符合條件的里。</p>'}
    <p class="note">綜合分＝立地總分${R.segs.length?'＋目標客群契合度':''}${R.need?'＋目標營收達成度':''}。點表格的一列會在地圖上打開該里的資訊卡。建議商圈半徑是要撐起目標每日來客所需的最小範圍（前 10 名），用「居民＋活動人口 × 業態消費頻率 × 可分到的市占」估算。每個里以里中心點代表，實際選店請點「完整評估」後再用熱區掃描找最佳的街口。</p></div>`;
  $('#rOut').querySelectorAll('[data-ro]').forEach(b=>b.onclick=e=>{e.stopPropagation(); revOpen(list[+b.dataset.ro])});
  $('#rOut').querySelectorAll('tbody tr').forEach(tr=>tr.onclick=()=>focusRes(+tr.dataset.i));
  const more=$('#rMore'); if(more) more.onclick=()=>{NSHOW+=20; table()};
}
function focusRes(i){ const o=SHOWN[i]; if(!o) return; const r=$('#map').getBoundingClientRect(); if(r.bottom<60||r.top>innerHeight-60) $('#map').scrollIntoView({behavior:'smooth',block:'center'});
  map.setView([o.s.lat,o.s.lon],Math.max(map.getZoom(),15),{animate:false}); openPop(o,i) }
function revOpen(o){ const R=REV; $('#fmt').value=R.fmt; TUNE={radius:o.sug&&o.sug.ok?o.sug.radius:null,weights:null,keyword:''};
  $('#ticket').value=$('#rTicket').value||''; $('#ping').value=R.ping; $('#rent').value=o.estRent||''; map.closePopup(); exitFs();
  $('#addr').value=''; site={lat:o.s.lat,lon:o.s.lon,label:''}; setMode(false); run(); window.scrollTo({top:0,behavior:'smooth'}); say(`已切到「評估一個地址」：${nm(o)}`,'info') }
$('#rCsv').onclick=()=>{ if(!REV) return; const R=REV, h=['排名','縣市','行政區','里','綜合','立地','等級','客群指數','500m居民','所得中位數(千元)','19-34歲占比','65歲以上占比','人流','交通','直接競爭','替代競爭','連鎖','最近車站(m)','便利商店','辦公','學校','醫院','停車場','可支撐每日來客','每日需求','達成度','店面行情(元/坪)','緯度','經度'];
  const rows=SHOWN.map((o,i)=>[i+1,o.v.c,o.v.t,o.v.v,o.score,o.m.total,o.res.grade,o.m.fit??'',o.m.pop5,o.m.inc??'',o.m.young!=null?Math.round(o.m.young*100):'',o.m.old!=null?Math.round(o.m.old*100):'',o.m.flow,o.m.access,o.m.same,o.m.sub,o.m.chain,o.m.st??'',o.m.conv,o.m.office,o.m.school,o.m.hospital,o.m.parking,o.cap.daily,R.need??'',o.m.attain!=null?Math.round(o.m.attain*100)+'%':'',o.m.mk??'',o.s.lat,o.s.lon]);
  const csv='﻿'+[h,...rows].map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`反向找點_${R.city}_${R.F.label}.csv`; a.click(); say(`已匯出 ${rows.length} 個里`,'ok') };

// ---------- 地圖按鈕：全螢幕、回到結果、比例尺 ----------
const IC={fs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  ex:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  fit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  key:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>'};
const Ctl=L.Control.extend({options:{position:'topright'},onAdd(){ const d=L.DomUtil.create('div','leaflet-bar mctl');
  d.innerHTML=`<button type="button" id="mFs" title="全螢幕（F）" aria-label="全螢幕">${IC.fs}</button><button type="button" id="mFit" title="回到結果範圍（0）" aria-label="回到結果範圍">${IC.fit}</button><button type="button" id="mKey" title="快捷鍵（?）" aria-label="快捷鍵說明">${IC.key}</button>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d }});
new Ctl().addTo(map); L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
function isFs(){return $('#map').classList.contains('fs')}
function toggleFs(){ const on=!isFs(); $('#map').classList.toggle('fs',on); document.body.classList.toggle('mapfs',on); $('#mFs').innerHTML=on?IC.ex:IC.fs; $('#mFs').title=on?'離開全螢幕（F 或 Esc）':'全螢幕（F）';
  if(on) map.scrollWheelZoom.enable(); else if(!window.REVMODE) map.scrollWheelZoom.disable(); setTimeout(()=>map.invalidateSize(),30); if(on) say('全螢幕地圖：按 Esc 或 F 離開','info') }
function exitFs(){ if(isFs()) toggleFs() }
$('#mFs').onclick=toggleFs; $('#mFit').onclick=()=>{ if(window.REVMODE&&REV) fitRes(); else if(site) map.setView([site.lat,site.lon],16) };
$('#mKey').onclick=()=>help(); $('#kHelp').onclick=()=>help();
// 一般模式：點一下地圖後才用滾輪縮放，避免捲頁時被地圖卡住
map.on('focus',()=>map.scrollWheelZoom.enable()); map.on('blur',()=>{ if(!window.REVMODE&&!isFs()) map.scrollWheelZoom.disable() });

// ---------- 快捷鍵 ----------
const KEYS=[['?','顯示這個說明'],['F','地圖全螢幕／離開'],['Esc','離開全螢幕、關閉資訊卡或說明'],['+ / −','地圖放大／縮小'],['0','回到結果範圍'],['M','切換「評估一個地址」與「反向找點」'],['R','開始找點（反向找點）'],['1–9','打開第 1–9 名的資訊卡'],['J / K','下一名／上一名'],['E','用目前選取的里做完整評估'],['C','清除篩選條件'],['/','跳到輸入框']];
function help(){ if($('.modal')) return closeModal(); const m=document.createElement('div'); m.className='modal'; m.innerHTML=`<div class="box" role="dialog" aria-modal="true" aria-label="快捷鍵"><h2>快捷鍵<button type="button" class="mini" data-x>關閉 <kbd>Esc</kbd></button></h2><table>${KEYS.map(([k,l])=>`<tr><td style="width:110px">${k.split(' / ').map(x=>`<kbd>${esc(x)}</kbd>`).join(' ')}</td><td>${l}</td></tr>`).join('')}</table><p class="note">在輸入框打字時快捷鍵不會作用，按 Esc 先離開輸入框。</p></div>`;
  m.onclick=e=>{if(e.target===m||e.target.closest('[data-x]')) closeModal()}; document.body.appendChild(m); m.querySelector('[data-x]').focus() }
function closeModal(){ const m=$('.modal'); if(m){m.remove(); return true} return false }
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ if(closeModal()) return; if(typing(e)){e.target.blur(); return} if(isFs()) return exitFs(); map.closePopup(); return }
  if(typing(e)||e.ctrlKey||e.metaKey||e.altKey) return;
  const k=e.key; let hit=true;
  if(k==='?') help();
  else if(k==='f'||k==='F') toggleFs();
  else if(k==='+'||k==='=') map.zoomIn();
  else if(k==='-'||k==='_') map.zoomOut();
  else if(k==='0') $('#mFit').click();
  else if(k==='m'||k==='M') setMode(!window.REVMODE);
  else if((k==='r'||k==='R')&&window.REVMODE) revRun();
  else if((k==='c'||k==='C')&&window.REVMODE&&REV) clearF();
  else if(/^[1-9]$/.test(k)&&window.REVMODE&&SHOWN.length){ focusRes(+k-1) }
  else if((k==='j'||k==='J')&&window.REVMODE&&SHOWN.length) focusRes(Math.min(SHOWN.length-1,SEL+1));
  else if((k==='k'||k==='K')&&window.REVMODE&&SHOWN.length) focusRes(Math.max(0,SEL-1));
  else if((k==='e'||k==='E')&&window.REVMODE&&SEL>=0&&SHOWN[SEL]) revOpen(SHOWN[SEL]);
  else if(k==='/'){ const el=window.REVMODE?($('#rFilt').hidden?$('#rTarget'):$('#rSort')):$('#addr'); el&&el.focus() }
  else hit=false;
  if(hit) e.preventDefault();
});
})();
