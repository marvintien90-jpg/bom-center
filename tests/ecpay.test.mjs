// node tests/ecpay.test.mjs
import { checkMac, verifyMac, periodCheckout, tradeNo, ECPAY_TEST_MERCHANT as M } from '../supabase/functions/_shared/ecpay.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m) } else console.log('ok  ', m) };
// 綠界文件的範例（檢查碼機制說明頁）
const doc = { ChoosePayment: 'ALL', EncryptType: '1', ItemName: 'Apple iphone 15', MerchantID: '3002607', MerchantTradeDate: '2023/03/12 15:30:23', MerchantTradeNo: 'ecpay20230312153023', PaymentType: 'aio', ReturnURL: 'https://www.ecpay.com.tw/receive.php', TotalAmount: '30000', TradeDesc: '促銷方案' };
const mac = await checkMac(doc, M.key, M.iv);
console.log('doc example mac', mac);
ok(mac === '6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840', '文件範例檢查碼相符');
ok(await verifyMac({ ...doc, CheckMacValue: mac }, M.key, M.iv), '驗證自己算的檢查碼');
ok(!(await verifyMac({ ...doc, TotalAmount: '1', CheckMacValue: mac }, M.key, M.iv)), '金額被改就驗證失敗');
ok(!(await verifyMac({ ...doc }, M.key, M.iv)), '沒有檢查碼就失敗');
const c = await periodCheckout({ merchant: M, mode: 'test', tradeNo: tradeNo(), amount: 1500, itemName: '進階版 1 店 每月', returnURL: 'https://x/notify', periodReturnURL: 'https://x/notify' });
ok(c.action.includes('payment-stage'), '測試模式送到 stage');
ok(c.fields.TotalAmount === c.fields.PeriodAmount && c.fields.PeriodType === 'M' && c.fields.ExecTimes === '99', '定期定額參數');
ok(await verifyMac(c.fields, M.key, M.iv), '表單檢查碼正確');
ok(c.fields.MerchantTradeNo.length <= 20 && /^[A-Z0-9]+$/.test(c.fields.MerchantTradeNo), '訂單編號格式');
let threw = false; try { await periodCheckout({ merchant: M, mode: 'test', tradeNo: 'X', amount: 0 }) } catch { threw = true } ok(threw, '金額 0 拒絕');
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
