// 電子發票工具測試：加解密來回、與 Node 原生 AES 比對、統編檢查碼、發票內容組裝。
import crypto from 'node:crypto';
import { encryptData, decryptData, validTaxId, issuePayload, issueInvoice, EINV_TEST_MERCHANT as M } from '../supabase/functions/_shared/einvoice.js';
let fail = 0; const ok = (c, n) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (!c) fail++; };

const obj = { MerchantID: '2000132', RelateNumber: 'SUB123', CustomerName: '一級棒 讚', SalesAmount: 5000 };
const enc = await encryptData(obj, M.key, M.iv);
const c = crypto.createCipheriv('aes-128-cbc', M.key, M.iv);
const want = Buffer.concat([c.update(encodeURIComponent(JSON.stringify(obj)).replace(/%20/g, '+'), 'utf8'), c.final()]).toString('base64');
ok(enc === want, '加密結果與 Node AES-128-CBC 相同');
ok(JSON.stringify(await decryptData(enc, M.key, M.iv)) === JSON.stringify(obj), '解密還原（含中文與空白）');

ok(validTaxId('22099131'), '統編 22099131 有效');
ok(validTaxId('04595257'), '統編 04595257 有效');
ok(!validTaxId('12345678'), '統編 12345678 無效');
ok(!validTaxId('1234567'), '7 碼無效');

const p = issuePayload({ merchantId: '2000132', relateNumber: 'SUB-MW1H#1', email: 'a@b.com', amount: 3000, items: [{ name: '進階版', count: 2, price: 1500 }] });
ok(p.RelateNumber === 'SUBMW1H1' && p.CarrierType === '1' && p.Print === '0' && p.CustomerIdentifier === '', '個人發票：會員載具、不列印');
ok(p.Items[0].ItemAmount === 3000 && p.SalesAmount === 3000, '品項金額加總等於總額');
const q = issuePayload({ merchantId: '2000132', relateNumber: 'X', email: 'a@b.com', taxId: '22099131', title: '台積電', amount: 990, items: [{ name: '基本版', count: 1, price: 990 }] });
ok(q.CustomerIdentifier === '22099131' && q.CustomerName === '台積電', '公司發票帶統編與抬頭');
let threw = ''; try { issuePayload({ merchantId: '1', relateNumber: 'X', email: 'a@b.com', taxId: '12345678', amount: 990, items: [{ name: 'a', count: 1, price: 990 }] }); } catch (e) { threw = e.message; }
ok(threw === 'BAD_TAX_ID', '錯誤統編拒絕');
threw = ''; try { issuePayload({ merchantId: '1', relateNumber: 'X', email: 'a@b.com', amount: 1000, items: [{ name: 'a', count: 1, price: 990 }] }); } catch (e) { threw = e.message; }
ok(threw === 'ITEM_SUM', '品項加總不符拒絕');

// 假的綠界回應
const fakeFetch = async (url, init) => {
  const b = JSON.parse(init.body); const d = await decryptData(b.Data, M.key, M.iv);
  const r = { RtnCode: 1, RtnMsg: '開立發票成功', InvoiceNo: 'AB12345678', InvoiceDate: '2026-11-04 14:00:00', RandomNumber: '1234', echo: d.RelateNumber };
  return { status: 200, json: async () => ({ MerchantID: M.id, RpHeader: { Timestamp: 1 }, TransCode: 1, TransMsg: '', Data: await encryptData(r, M.key, M.iv) }) };
};
const r = await issueInvoice({ merchant: M, mode: 'test', payload: p, fetchImpl: fakeFetch });
ok(r.ok && r.InvoiceNo === 'AB12345678' && r.echo === 'SUBMW1H1', '送出並解密回應');
const r2 = await issueInvoice({ merchant: M, mode: 'test', payload: p, fetchImpl: async () => ({ status: 200, json: async () => ({ TransCode: 999, TransMsg: '驗證失敗' }) }) });
ok(!r2.ok && r2.TransMsg === '驗證失敗', '綠界拒絕時回報原因');
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
