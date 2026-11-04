# 餐飲經營健檢（顧問入口）

- 健檢頁（給業主）：`https://marvintien90-jpg.github.io/bom-center/checkup/`
- 名單管理（只限管理員，用 BOM 管理員帳號登入）：`https://marvintien90-jpg.github.io/bom-center/checkup/leads/`
  一鍵複製 IG／FB／LINE／直接分享連結（自動帶來源標記）、看待聯絡數、直接改狀態與備註。

## 組成

| 部分 | 位置 | 說明 |
|---|---|---|
| 頁面 | `checkup/index.html` | 公開頁，不用登入。基本資料 → 30 題 → 營運數字（選填）→ 結果 → 預約解讀。答案存在訪客瀏覽器，重新整理不會不見 |
| 題庫與評分 | `checkup/score.js` | 產銷人發財資各 5 題，每題 0–3 分；構面分數 0–100；財構面有填數字時＝問卷 60%＋財務指標 40% |
| 名單 | `supabase/migrations/20261104_checkup_leads.sql` | 表 `checkup_leads`＋函式 `checkup_submit()`；每筆寄通知信給 Marvin |
| 名單管理 | `checkup/leads/index.html` | 管理員登入後看名單、改狀態（新名單→已聯絡→已預約→已成交／不需要）、寫備註；預設只顯示待處理 |
| 測試 | `tests/checkup.test.js`、`tests/checkup_leads_page.test.js`、`tests/checkup_leads.sql` | 評分單元測試＋頁面桌機／手機測試；資料庫權限測試（交易內跑完全部回復） |

## 結果頁給什麼

1. 總分與六構面雷達圖（75 以上良好、50–74 需加強、50 以下優先改善）。
2. 分數最低的三個構面，各附一句改善方向與對應工具（BOM 中心、損益中心、品牌調研、即將推出的稽核／SOP／排班／菜單工程）。
3. 回答「沒有／偶爾」的前 5 題。
4. 有填數字時：食材、人事、租金、主要成本率、營業利益率的燈號，兩平營業額與安全邊際。
5. 下載 PDF（瀏覽器列印）與預約免費 30 分鐘解讀。

財務參考值（食材 ≤35%、人事 ≤28%、租金 ≤12%、主要成本 ≤60%、營業利益 ≥12%）是顧問經驗值，改 `score.js` 的 `KPI` 即可。

## 名單的安全規則

- 匿名訪客只能透過 `checkup_submit()` 新增，不能讀、改、刪；只有管理員看得到。
- 必須勾同意、至少一種聯絡方式；欄位長度、JSON 大小有上限；全站每天最多 200 筆。
- 欄位去掉控制字元與 `<>`；通知信內容再跳脫一次。

## 上線步驟

1. 套用 migration（Supabase SQL Editor 貼上 `20261104_checkup_leads.sql` 執行），再貼 migration＋`tests/checkup_leads.sql` 跑一次，最後的錯誤訊息應該是 `RESULT fail=0`。
2. 合併 PR 後把 main 推到 gh-pages。
3. 用自己的手機實際做一次，確認收到通知信。

## 顧問作業包（2026-11-04）

每筆新名單的通知信直接帶出「顧問作業包」，名單頁展開「顧問作業包」也看得到同一份：

- 邀約話術（LINE／電話，一鍵複製）與 3 天沒回覆的追蹤話術
- 最弱的兩個面向（第二個低於 75 分才列）：每個面向最多 3 個具體可能問題（答「沒有」或「偶爾」的題目）＋改善方案＋對應工具
- 每個弱面向的 3 個訪談提問
- 請業主訪談前準備的資料

內容在 `checkup_private.pb_dim`（面向：提問、工具）與 `checkup_private.pb_q`（題目：可能問題、改善方案），改這兩張表就會同時改到信件和名單頁。
產生邏輯是 `checkup_private.brief(id)`；名單頁透過只限管理員的 `public.checkup_brief(p_id)` 讀取。
Migration：`supabase/migrations/20261104_checkup_brief.sql`（取代尚未套用的 v2 通知信）。
