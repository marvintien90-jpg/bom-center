// 綠界 ECPay 共用工具：檢查碼（CheckMacValue, SHA256）、建立定期定額付款表單、解析回呼。
// 純 Web 標準 API（crypto.subtle、TextEncoder），Deno（edge function）與 Node 20 都能跑，方便單元測試。

export const ECPAY = {
  test: { checkout: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5', action: 'https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction' },
  live: { checkout: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5', action: 'https://payment.ecpay.com.tw/Cashier/CreditCardPeriodAction' },
};
// 綠界公開的測試特店（只能在測試環境用）
export const ECPAY_TEST_MERCHANT = { id: '3002607', key: 'pwFHCqoQZGmho4w6', iv: 'EkRm7iFT261dpevs' };

// 綠界規定的編碼：仿 .NET HttpUtility.UrlEncode 後轉小寫，再把 -_.!*() 還原
function dotnetEncode(s) {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/'/g, '%27')
    .replace(/~/g, '%7e')
    .toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_').replace(/%2e/g, '.').replace(/%21/g, '!')
    .replace(/%2a/g, '*').replace(/%28/g, '(').replace(/%29/g, ')');
}

export async function checkMac(params, key, iv) {
  const keys = Object.keys(params).filter(k => k !== 'CheckMacValue').sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  const raw = `HashKey=${key}&` + keys.map(k => `${k}=${params[k]}`).join('&') + `&HashIV=${iv}`;
  const enc = dotnetEncode(raw);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(enc));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function verifyMac(params, key, iv) {
  if (!params || typeof params.CheckMacValue !== 'string') return false;
  const want = await checkMac(params, key, iv);
  const got = params.CheckMacValue.toUpperCase();
  if (want.length !== got.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}

// 台北時間 yyyy/MM/dd HH:mm:ss
export function tpeStamp(d = new Date()) {
  const t = new Date(d.getTime() + 8 * 3600e3);
  const p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

// 特店訂單編號：最多 20 碼英數，唯一
export function tradeNo(prefix = 'SUB') {
  const r = crypto.getRandomValues(new Uint8Array(6));
  const s = [...r].map(b => (b % 36).toString(36)).join('').toUpperCase();
  return (prefix + Date.now().toString(36).toUpperCase() + s).slice(0, 20);
}

// 每月定期定額（信用卡）付款表單欄位
export async function periodCheckout({ merchant, mode, tradeNo: no, amount, itemName, returnURL, periodReturnURL, clientBackURL, orderResultURL, custom = {} }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('BAD_AMOUNT');
  const f = {
    MerchantID: merchant.id,
    MerchantTradeNo: no,
    MerchantTradeDate: tpeStamp(),
    PaymentType: 'aio',
    TotalAmount: String(amount),
    TradeDesc: 'BOM and PL subscription',
    ItemName: String(itemName).replace(/[#&<>]/g, ' ').slice(0, 200),
    ReturnURL: returnURL,
    ChoosePayment: 'Credit',
    EncryptType: '1',
    PeriodAmount: String(amount),
    PeriodType: 'M',
    Frequency: '1',
    ExecTimes: '99',
    PeriodReturnURL: periodReturnURL,
    NeedExtraPaidInfo: 'Y',
  };
  if (clientBackURL) f.ClientBackURL = clientBackURL;
  if (orderResultURL) f.OrderResultURL = orderResultURL;
  for (const [k, v] of Object.entries(custom)) if (v != null) f[k] = String(v).slice(0, 50);
  f.CheckMacValue = await checkMac(f, merchant.key, merchant.iv);
  return { action: ECPAY[mode === 'live' ? 'live' : 'test'].checkout, fields: f };
}

// 停用定期定額
export async function periodCancelRequest({ merchant, mode, tradeNo: no }) {
  const f = { MerchantID: merchant.id, MerchantTradeNo: no, Action: 'Cancel', TimeStamp: String(Math.floor(Date.now() / 1000)) };
  f.CheckMacValue = await checkMac(f, merchant.key, merchant.iv);
  return { url: ECPAY[mode === 'live' ? 'live' : 'test'].action, body: new URLSearchParams(f).toString() };
}

export function parseForm(text) {
  const o = {};
  for (const [k, v] of new URLSearchParams(text)) o[k] = v;
  return o;
}
