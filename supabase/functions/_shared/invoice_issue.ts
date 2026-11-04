// 扣款成功後開立電子發票。失敗不影響扣款流程，只記錄在 sub_invoices，管理員可在會員中心補開。
import { invMerchant, type Mode } from './billing_env.ts';
import { issuePayload, issueInvoice } from './einvoice.js';

// deno-lint-ignore no-explicit-any
type DB = any;

export async function issueForPayment(db: DB, mode: Mode | undefined, paymentId: number): Promise<{ status: string; invoice_no?: string; error?: string } | null> {
  if (!mode || mode === 'off') return null;
  const { data: pay } = await db.from('sub_payments').select('*').eq('id', paymentId).maybeSingle();
  if (!pay || pay.status !== 'paid' || !(pay.amount > 0) || !['first', 'period'].includes(pay.kind)) return null;
  const { data: sub } = await db.from('sub_subscriptions').select('*').eq('id', pay.subscription_id).maybeSingle();
  if (!sub) return null;
  if (mode === 'test' && !sub.sandbox) return null;
  const { data: had } = await db.from('sub_invoices').select('*').eq('payment_id', pay.id).maybeSingle();
  if (had?.status === 'issued') return { status: 'issued', invoice_no: had.invoice_no };
  const { data: plan } = await db.from('sub_plans').select('name').eq('code', pay.plan).maybeSingle();
  const stores = pay.stores || 1, per = Math.round(pay.amount / stores);
  const name = `BOM運算中心＋損益分析中心 ${plan?.name || pay.plan}（月費）`;
  const items = per * stores === pay.amount ? [{ name, count: stores, price: per }] : [{ name, count: 1, price: pay.amount }];
  // 正式環境用固定編號，重送時綠界會擋重複開立；測試環境的測試特店是大家共用，所以加上時間避免撞號
  const relate = mode === 'live' ? `BOMSUB${pay.id}` : `BOMSUBT${pay.id}${Date.now().toString(36)}`;
  let r: Record<string, unknown>;
  try {
    const m = invMerchant(mode);
    r = await issueInvoice({ merchant: m, mode, payload: issuePayload({ merchantId: m.id, relateNumber: relate, email: sub.email, taxId: sub.tax_id, title: sub.invoice_title, amount: pay.amount, items, remark: `訂閱：${sub.company}` }) });
  } catch (e) {
    r = { ok: false, RtnMsg: String(e).slice(0, 200) };
  }
  const row = {
    payment_id: pay.id, subscription_id: sub.id, user_id: sub.user_id, amount: pay.amount, tax_id: sub.tax_id || null,
    status: r.ok ? 'issued' : 'failed', invoice_no: (r.InvoiceNo as string) || null, invoice_date: (r.InvoiceDate as string) || null,
    random_number: (r.RandomNumber as string) || null, error: r.ok ? null : String(r.RtnMsg || r.TransMsg || 'ERROR').slice(0, 300),
    sandbox: mode !== 'live', attempts: (had?.attempts || 0) + 1, updated_at: new Date().toISOString(),
  };
  await db.from('sub_invoices').upsert(row, { onConflict: 'payment_id' });
  return { status: row.status, invoice_no: row.invoice_no || undefined, error: row.error || undefined };
}
