// 綠界伺服器回呼（ReturnURL 首期、PeriodReturnURL 每期）。不需要登入（verify_jwt 關閉），以檢查碼驗證來源。
// 一律冪等：同一筆通知重送不會重複延長期限。回應 1|OK 綠界才不會重送。
import { admin, settings, merchant } from '../_shared/billing_env.ts';
import { verifyMac, parseForm, periodCancelRequest } from '../_shared/ecpay.js';

const txt = (s: string, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain' } });
const tpeDate = (s?: string) => {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(s || '');
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return txt('0|METHOD', 405);
  const db = admin();
  let f: Record<string, string> = {};
  try {
    f = parseForm(await req.text());
    const cfg = await settings(db);
    if (cfg.billing_mode === 'off') return txt('0|OFF');
    const m = merchant(cfg.billing_mode);
    if (f.MerchantID !== m.id || !(await verifyMac(f, m.key, m.iv))) {
      await db.from('sub_log').insert({ action: 'notify_bad_mac', detail: { MerchantTradeNo: f.MerchantTradeNo || null } });
      return txt('0|CheckMacValue Error');
    }
    const no = f.MerchantTradeNo;
    const { data: co } = await db.from('sub_payments').select('*').eq('provider', 'ecpay').eq('merchant_trade_no', no).eq('kind', 'checkout').maybeSingle();
    if (!co) { await db.from('sub_log').insert({ action: 'notify_unknown', detail: { no } }); return txt('1|OK'); }
    const { data: sub } = await db.from('sub_subscriptions').select('*').eq('id', co.subscription_id).maybeSingle();
    if (!sub) return txt('1|OK');
    const sandbox = cfg.billing_mode !== 'live';
    if (sandbox && !sub.sandbox) { await db.from('sub_log').insert({ user_id: sub.user_id, action: 'notify_sandbox_refused', detail: { no } }); return txt('1|OK'); }
    if (f.SimulatePaid === '1') { await db.from('sub_log').insert({ user_id: sub.user_id, action: 'notify_simulated', detail: { no } }); return txt('1|OK'); }
    const ok = f.RtnCode === '1';
    const isPeriod = 'TotalSuccessTimes' in f || 'ExecTimes' in f && !('TradeNo' in f);

    if (!isPeriod) {
      // 首期授權
      const amt = parseInt(f.TradeAmt || '0', 10);
      const { error: dup } = await db.from('sub_payments').insert({
        subscription_id: sub.id, user_id: sub.user_id, provider: 'ecpay', merchant_trade_no: no, trade_no: f.TradeNo || null, kind: 'first', seq: 1,
        amount: amt, plan: co.plan, stores: co.stores, status: ok ? 'paid' : 'failed', rtn_code: f.RtnCode, rtn_msg: f.RtnMsg,
        paid_at: ok ? new Date().toISOString() : null, sandbox, raw: f,
      });
      if (dup) return txt('1|OK'); // 重送：已處理過
      if (!ok) return txt('1|OK');
      if (amt !== co.amount) { await db.from('sub_log').insert({ user_id: sub.user_id, action: 'notify_amount_mismatch', detail: { no, amt, want: co.amount } }); return txt('1|OK'); }
      // 換方案：舊的定期定額要停掉，避免重複扣款
      if (sub.provider_ref && sub.provider_ref !== no && sub.auto_renew) {
        try {
          const r = await periodCancelRequest({ merchant: m, mode: cfg.billing_mode, tradeNo: sub.provider_ref });
          const res = parseForm(await (await fetch(r.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: r.body })).text());
          await db.from('sub_log').insert({ user_id: sub.user_id, action: 'cancel_old_period', detail: { old: sub.provider_ref, rtn: res.RtnCode } });
        } catch (e) { await db.from('sub_log').insert({ user_id: sub.user_id, action: 'cancel_old_period_failed', detail: { old: sub.provider_ref } }); }
      }
      const last4 = (f.card4no || '').slice(-4) || null;
      const { error: ae } = await db.rpc('sub_apply_payment', { p_sub: sub.id, p_kind: 'first', p_paid_on: tpeDate(f.PaymentDate), p_ref: no, p_last4: last4, p_plan: co.plan, p_stores: co.stores });
      if (ae) throw ae;
      await db.from('sub_subscriptions').update({ provider: 'ecpay', sandbox: sub.sandbox }).eq('id', sub.id);
      return txt('1|OK');
    }

    // 每期扣款
    const times = parseInt(f.TotalSuccessTimes || '0', 10);
    const seq = ok ? times : 100000 + (parseInt(f.gwsr || '0', 10) % 1000000000 || Math.floor(Date.now() / 1000) % 1000000000);
    const { error: dup } = await db.from('sub_payments').insert({
      subscription_id: sub.id, user_id: sub.user_id, provider: 'ecpay', merchant_trade_no: no, trade_no: f.gwsr || null, kind: 'period', seq,
      amount: parseInt(f.Amount || '0', 10), plan: co.plan, stores: co.stores, status: ok ? 'paid' : 'failed', rtn_code: f.RtnCode, rtn_msg: f.RtnMsg,
      paid_at: ok ? new Date().toISOString() : null, sandbox, raw: f,
    });
    if (dup) return txt('1|OK');
    if (sub.provider_ref !== no) return txt('1|OK'); // 舊的、已換掉的扣款單
    if (ok && times > 1) {
      const { error: ae } = await db.rpc('sub_apply_payment', { p_sub: sub.id, p_kind: 'period', p_paid_on: tpeDate(f.ProcessDate), p_ref: no, p_last4: null, p_plan: null, p_stores: null });
      if (ae) throw ae;
    } else if (!ok && sub.status === 'active') {
      await db.from('sub_subscriptions').update({ status: 'past_due' }).eq('id', sub.id);
    }
    return txt('1|OK');
  } catch (e) {
    console.error(e);
    try { await db.from('sub_log').insert({ action: 'notify_error', detail: { no: f.MerchantTradeNo || null, err: String(e).slice(0, 300) } }); } catch (_) { /* ignore */ }
    return txt('0|ERROR', 500);
  }
});
