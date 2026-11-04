// 會員中心呼叫：建立綠界定期定額付款單（checkout）、停用自動扣款（cancel）。
// 需要登入（verify_jwt 開啟）。測試模式只允許管理員標記為 sandbox 的訂閱，避免有人用公開測試金鑰偽造付款。
import { admin, settings, merchant, SITE } from '../_shared/billing_env.ts';
import { periodCheckout, periodCancelRequest, tradeNo, parseForm } from '../_shared/ecpay.js';

const ORIGINS = ['https://marvintien90-jpg.github.io'];
const cors = (req: Request) => {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};

Deno.serve(async (req) => {
  const h = { ...cors(req), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(405, { error: 'METHOD' });
  try {
    const db = admin();
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error: ue } = await db.auth.getUser(jwt);
    if (ue || !u?.user) return reply(401, { error: 'LOGIN' });
    const uid = u.user.id;
    const body = await req.json().catch(() => ({}));
    const cfg = await settings(db);
    if (cfg.billing_mode === 'off') return reply(400, { error: 'BILLING_OFF' });
    const { data: sub } = await db.from('sub_subscriptions').select('*').eq('user_id', uid).maybeSingle();
    if (!sub) return reply(400, { error: 'SUB_NONE' });
    if (cfg.billing_mode === 'test' && !sub.sandbox) return reply(400, { error: 'BILLING_TEST_ONLY' });
    const m = merchant(cfg.billing_mode);

    if (body.action === 'checkout') {
      const plan = typeof body.plan === 'string' ? body.plan : sub.plan;
      const stores = Number.isInteger(body.stores) ? body.stores : sub.stores;
      if (stores < 1 || stores > 50) return reply(400, { error: 'SUB_BAD_INPUT' });
      const { data: p } = await db.from('sub_plans').select('*').eq('code', plan).eq('active', true).maybeSingle();
      if (!p) return reply(400, { error: 'SUB_BAD_PLAN' });
      if (p.price_per_store == null) return reply(400, { error: 'PLAN_NO_PRICE' });
      if (sub.status === 'active' && sub.auto_renew && sub.plan === plan && sub.stores === stores) return reply(400, { error: 'ALREADY_ACTIVE' });
      // 同一個人 10 分鐘內最多建 5 張單，避免被拿來洗單
      const since = new Date(Date.now() - 10 * 60e3).toISOString();
      const { count } = await db.from('sub_payments').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('kind', 'checkout').gte('created_at', since);
      if ((count || 0) >= 5) return reply(429, { error: 'TOO_MANY' });
      const amount = p.price_per_store * stores;
      const no = tradeNo('SUB');
      const notify = `${Deno.env.get('SUPABASE_URL')}/functions/v1/billing-notify`;
      const form = await periodCheckout({
        merchant: m, mode: cfg.billing_mode, tradeNo: no, amount,
        itemName: `BOM＋損益中心 ${p.name} ${stores} 店 每月`,
        returnURL: notify, periodReturnURL: notify, clientBackURL: SITE + '?paid=1',
        custom: { CustomField1: String(sub.id), CustomField2: plan, CustomField3: String(stores) },
      });
      const { error: ie } = await db.from('sub_payments').insert({
        subscription_id: sub.id, user_id: uid, provider: 'ecpay', merchant_trade_no: no, kind: 'checkout', seq: 0,
        amount, plan, stores, status: 'pending', sandbox: cfg.billing_mode !== 'live',
      });
      if (ie) return reply(500, { error: 'DB' });
      return reply(200, form);
    }

    if (body.action === 'cancel') {
      if (!sub.auto_renew) return reply(400, { error: 'NOT_RENEWING' });
      if (sub.provider_ref) {
        const r = await periodCancelRequest({ merchant: m, mode: cfg.billing_mode, tradeNo: sub.provider_ref });
        const res = await fetch(r.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: r.body });
        const out = parseForm(await res.text());
        await db.from('sub_payments').insert({
          subscription_id: sub.id, user_id: uid, provider: 'ecpay', merchant_trade_no: sub.provider_ref, kind: 'cancel',
          seq: Math.floor(Date.now() / 1000), status: out.RtnCode === '1' ? 'canceled' : 'failed', rtn_code: out.RtnCode || null,
          rtn_msg: out.RtnMsg || null, sandbox: cfg.billing_mode !== 'live', raw: out,
        });
        if (out.RtnCode !== '1') return reply(502, { error: 'PROVIDER', msg: out.RtnMsg || '' });
      }
      await db.from('sub_subscriptions').update({ auto_renew: false, status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', sub.id);
      await db.from('sub_log').insert({ user_id: uid, actor: uid, action: 'cancel', detail: { ref: sub.provider_ref } });
      return reply(200, { ok: true, until: sub.period_end });
    }
    return reply(400, { error: 'ACTION' });
  } catch (e) {
    console.error(e);
    return reply(500, { error: 'SERVER' });
  }
});
