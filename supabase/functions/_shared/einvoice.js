// 綠界 B2C 電子發票（開立）。Data 欄位：JSON → URL encode → AES-128-CBC（PKCS7）→ Base64。
// 純 Web 標準 API，Deno 與 Node 20 都能跑。金鑰只放 edge function secrets；測試環境用綠界公開的測試特店。

export const EINV = {
  test: 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/Issue',
  live: 'https://einvoice.ecpay.com.tw/B2CInvoice/Issue',
};
export const EINV_TEST_MERCHANT = { id: '2000132', key: 'ejCk326UnaZWKisg', iv: 'q9jcZX8Ib9LM8wYk' };

const te = new TextEncoder(), td = new TextDecoder();
const b64 = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// 綠界用 .NET UrlEncode：空白轉 +；解碼時 + 還原成空白
const urlenc = s => encodeURIComponent(s).replace(/%20/g, '+');
const urldec = s => decodeURIComponent(s.replace(/\+/g, '%20'));

async function keyOf(key, usage) {
  return crypto.subtle.importKey('raw', te.encode(key), { name: 'AES-CBC' }, false, [usage]);
}
export async function encryptData(obj, key, iv) {
  const k = await keyOf(key, 'encrypt');
  const out = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: te.encode(iv) }, k, te.encode(urlenc(JSON.stringify(obj))));
  return b64(new Uint8Array(out));
}
export async function decryptData(s, key, iv) {
  const k = await keyOf(key, 'decrypt');
  const out = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: te.encode(iv) }, k, unb64(s));
  return JSON.parse(urldec(td.decode(out)));
}

// 統一編號檢查碼（財政部 2023 新規則：加總可被 5 整除；第 7 碼為 7 時另有一種算法）
export function validTaxId(id) {
  if (!/^\d{8}$/.test(id)) return false;
  const w = [1, 2, 1, 2, 1, 2, 4, 1], d = id.split('').map(Number);
  const sum = d.reduce((t, x, i) => { const p = x * w[i]; return t + Math.floor(p / 10) + (p % 10); }, 0);
  return sum % 5 === 0 || (d[6] === 7 && (sum + 1) % 5 === 0);
}

// 組開立發票的 Data。amount 是含稅總額（整數）；items: [{ name, count, price }]，價格含稅
export function issuePayload({ merchantId, relateNumber, email, taxId, title, amount, items, remark }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('BAD_AMOUNT');
  const sum = items.reduce((t, i) => t + i.count * i.price, 0);
  if (sum !== amount) throw new Error('ITEM_SUM');
  const withId = !!taxId;
  if (withId && !validTaxId(taxId)) throw new Error('BAD_TAX_ID');
  return {
    MerchantID: merchantId,
    RelateNumber: String(relateNumber).replace(/[^A-Za-z0-9_]/g, '').slice(0, 30),
    CustomerIdentifier: withId ? taxId : '',
    CustomerName: withId ? String(title || '').slice(0, 60) : '',
    CustomerAddr: '',
    CustomerPhone: '',
    CustomerEmail: String(email || '').slice(0, 80),
    Print: '0',
    Donation: '0',
    LoveCode: '',
    CarrierType: '1', // 綠界會員載具：中獎通知寄到 email；有統編也可以不列印
    CarrierNum: '',
    TaxType: '1',
    SalesAmount: amount,
    InvoiceRemark: String(remark || '').slice(0, 100),
    Items: items.map((i, n) => ({ ItemSeq: n + 1, ItemName: String(i.name).slice(0, 100), ItemCount: i.count, ItemWord: '店', ItemPrice: i.price, ItemTaxType: '1', ItemAmount: i.count * i.price })),
    InvType: '07',
    vat: '1',
  };
}

// 送出並解密回應。回傳 { ok, InvoiceNo, InvoiceDate, RandomNumber, RtnCode, RtnMsg, TransCode, TransMsg }
export async function issueInvoice({ merchant, mode, payload, fetchImpl = fetch }) {
  const body = { MerchantID: merchant.id, RqHeader: { Timestamp: Math.floor(Date.now() / 1000) }, Data: await encryptData(payload, merchant.key, merchant.iv) };
  const res = await fetchImpl(EINV[mode === 'live' ? 'live' : 'test'], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (j.TransCode !== 1 || !j.Data) return { ok: false, TransCode: j.TransCode ?? null, TransMsg: j.TransMsg || `HTTP ${res.status}` };
  const d = await decryptData(j.Data, merchant.key, merchant.iv);
  return { ok: d.RtnCode === 1, ...d, TransCode: j.TransCode };
}
