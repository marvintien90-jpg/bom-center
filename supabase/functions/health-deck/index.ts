// 每月經營健檢簡報：替「顧問會員」方案的訂閱各產生一份上個月的 .pptx，存到 Storage（sub-reports/<user_id>/<YYYY-MM>.pptx），
// 並寄信通知。由每月排程（帶 x-cron-secret）或管理員（帶登入 JWT）呼叫。body 可帶 { subscription_id, month, force } 只跑一筆。
import pptxgen from 'npm:pptxgenjs@3.12.0';
import { admin } from '../_shared/billing_env.ts';
import { computeHealth, buildDeck } from '../_shared/health_deck.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD' });
  const db = admin();
  const cron = req.headers.get('x-cron-secret'), want = Deno.env.get('SUB_CRON_SECRET');
  let allowed = !!want && cron === want;
  // 排程金鑰存在資料庫 vault（sub_cron_secret），用只給 service role 的函式比對
  if (!allowed && cron && cron.length >= 32) {
    const { data: okSecret } = await db.rpc('sub_cron_secret_ok', { p: cron });
    allowed = okSecret === true;
  }
  if (!allowed) {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(jwt);
    if (u?.user) {
      const { data: p } = await db.from('bom_profiles').select('role,status').eq('user_id', u.user.id).maybeSingle();
      allowed = !!p && p.role === 'admin' && p.status === 'active';
    }
  }
  if (!allowed) return json(401, { error: 'AUTH' });
  const body = await req.json().catch(() => ({}));

  const { data: plans } = await db.from('sub_plans').select('code').eq('monthly_deck', true);
  const codes = (plans || []).map((p: { code: string }) => p.code);
  let q = db.from('sub_subscriptions').select('*').in('status', ['trial', 'active', 'past_due', 'canceled', 'comp']);
  if (body.subscription_id) q = db.from('sub_subscriptions').select('*').eq('id', body.subscription_id);
  else q = q.in('plan', codes);
  const { data: subs, error } = await q;
  if (error) return json(500, { error: 'DB' });

  const done: unknown[] = [];
  for (const s of subs || []) {
    try {
      const { data: st } = await db.from('pl_statements').select('period_month, pl_line_items(section, category, amount)').eq('client_name', s.client_name).eq('brand_name', s.brand_name).order('period_month');
      const rows: { m: string; s: string; c: string; a: number }[] = [];
      for (const x of st || []) for (const i of (x as any).pl_line_items || []) rows.push({ m: String(x.period_month).slice(0, 7), s: i.section, c: i.category || '', a: Number(i.amount) || 0 });
      if (!rows.length) { done.push({ id: s.id, skipped: 'no_data' }); continue; }
      const H = computeHealth(rows, body.month);
      if (!H) { done.push({ id: s.id, skipped: 'no_data' }); continue; }
      const { data: had } = await db.from('sub_reports').select('id').eq('subscription_id', s.id).eq('month', H.month).maybeSingle();
      if (had && !body.force) { done.push({ id: s.id, skipped: 'exists', month: H.month }); continue; }
      const deck = buildDeck(pptxgen, H, { brand: s.brand_name });
      const bytes = await deck.write({ outputType: 'uint8array' }) as Uint8Array;
      const path = `${s.user_id}/${H.month}.pptx`;
      const up = await db.storage.from('sub-reports').upload(path, bytes, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      if (up.error) throw up.error;
      const { error: re } = await db.rpc('sub_report_ready', { p_sub: s.id, p_month: H.month, p_path: path, p_summary: { advice: H.advice.map((a: any) => a.title), net: H.cur.r.net, rev: H.cur.rev } });
      if (re) throw re;
      done.push({ id: s.id, month: H.month, path });
    } catch (e) {
      console.error(e);
      done.push({ id: s.id, error: String(e).slice(0, 200) });
    }
  }
  return json(200, { done });
});
