# 訂閱產品（BOM 運算中心＋損益分析中心）

## 組成

| 部分 | 位置 | 說明 |
|---|---|---|
| 資料庫 | `supabase/migrations/20261103_sub_core.sql` | 方案 `sub_plans`、設定 `sub_settings`、試點名單 `sub_pilots`、訂閱 `sub_subscriptions`、付款 `sub_payments`、紀錄 `sub_log`、健檢簡報 `sub_reports` |
| 會員中心 | `member/index.html`（網址 `/bom-center/member/`） | 註冊、14 天試用、選方案、綁卡、取消、下載健檢簡報；管理員可管試點名單、價格、模式、既有客戶轉訂閱 |
| 金流 | `supabase/functions/billing`、`billing-notify` | 綠界信用卡定期定額（每月），`_shared/ecpay.js` 算檢查碼 |
| 健檢簡報 | `supabase/functions/health-deck`、`_shared/health_deck.js` | 每月 5 日替顧問會員產生上個月的 .pptx，存 Storage `sub-reports` 並寄信 |

訂閱表是唯一真相：觸發程序把狀態寫進 `bom_profiles`、`pl_profiles`（狀態、方案、到期日），既有的權限函式一行都沒改。

## 價格（2026-11-03 Marvin 決定）

基本版 990、進階版 1,500、顧問會員 5,000，皆為每店每月。會員中心的管理頁可以直接改。

## 安全與資料隔離審查（2026-11-03）

測試：`tests/sub_isolation.sql`，在交易內建立假帳號、扮演業主操作，最後丟例外全部回復。2026-11-03 對正式資料庫結構跑過，40/40 通過。

| 風險 | 處理 | 測試 |
|---|---|---|
| 自助客戶取了和既有客戶一樣的名稱，接到別人的損益資料（損益中心用客戶名稱當鑰匙） | 試用時檢查 7 張表，撞名就加隨機尾碼；客戶名稱建立後鎖死不能改 | 2、8、8d |
| 業主自己把訂閱改成付費、延長期限 | 訂閱只有管理員能改；入帳函式只給 service role | 5a、5c |
| 業主自己改授權、加品牌或損益權限 | 沿用既有規則：只有管理員能寫 | 5d、5d2、5f、5f2、5h |
| 試用者看到其他客戶的品牌、進貨、損益、帳號 | 新品牌只指派給本人，既有讀取規則不變 | 3a–3g、8b、8c |
| 到期後仍可使用 | 每日排程轉 expired，授權到期日寫成昨天；資料保留 | 10、10c、10d |
| 有人用綠界公開測試金鑰偽造付款通知 | 測試模式只接受管理員標記「測試帳號」的訂閱；正式模式用正式金鑰驗檢查碼 | `tests/ecpay.test.mjs`＋程式邏輯 |
| 付款通知重送造成重複延期 | `sub_payments` 唯一鍵（訂單、類型、期數），重複就略過 | 程式邏輯 |
| 付款金額被竄改 | 首期金額必須等於建單金額才入帳 | 程式邏輯 |
| 換方案後新舊兩筆定期定額同時扣款 | 新單首期成功時自動停用舊單 | 程式邏輯 |
| 試用被大量註冊灌爆 | 預設不開放（只限試點名單）；開放後全站每天上限 30 筆；必須先驗證 Email | 1、11c |
| 健檢簡報被其他人下載 | Storage 私有，路徑第一層是 user_id，只有本人與管理員能取 | 規則 |

還沒做、上線正式收款前要補：

1. 綠界正式特店申請（需要統編或個人身分、銀行帳戶），拿到正式 MerchantID／HashKey／HashIV。
2. 服務條款與隱私權政策頁（信用卡定期扣款需要明示扣款週期、取消方式、退款規則）。
3. 電子發票（綠界有加值服務；先人工開立也可以）。

## 上線步驟

1. 套用 migration（Supabase SQL Editor 貼上 `20261103_sub_core.sql`，或由 Claude 在你同意後套用）。
2. 部署 edge functions：`billing`、`health-deck`（需登入）、`billing-notify`（`--no-verify-jwt`）。
3. Edge function secrets：`SUB_CRON_SECRET`（隨機字串，同一串也存進 vault 名稱 `sub_cron_secret`）；正式收款時再加 `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`。
4. 合併這個 PR，GitHub Pages 會發布會員中心。
5. 會員中心 → 管理 → 試點名單加入測試帳號；設定改「測試模式」；訂閱列表把測試帳號勾「測試帳號」；用綠界測試卡 4311-9522-2222-2222（3D 驗證碼 1234）走一次完整流程。
6. 一級棒讚試點：會員中心 →「既有客戶轉訂閱」，客戶名稱填「一級棒讚企業社」、品牌「一級棒讚」、BOM 品牌 id `yijibang-gongyi`。
7. 綠界正式金鑰設好後，設定改「正式收款」。

## 測試

```
cd tests && npm i --no-save xlsx@0.18.5 pptxgenjs@3.12.0
node ecpay.test.mjs            # 綠界檢查碼（含官方範例）
node health_deck.test.mjs /tmp # 健檢簡報指標與產檔
node member.test.js            # 會員中心四種畫面、電腦與手機
node run.js /abs/index.html    # 原本的主站測試
```
