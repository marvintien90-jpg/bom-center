# BOM 運算中心

餐飲品牌的食材、配方、成本與獲利試算工具（授權版網站）。

由品牌加辣餐飲顧問工作室授權使用。網站為單一檔案 `index.html`，資料與帳號權限存放於 Supabase。

## 原始檔

`src/` 內是產生 `index.html` 的來源：`base-page.html`（試算功能本體）、`sitecode.js`（登入、授權、存檔與防覆蓋）、`buildsite.js`（組合腳本）。

## 庫存與進貨（2026-10 新增）

盤點、進貨登記、供應商存在獨立資料表 `bom_suppliers`、`bom_receipts`、`bom_counts`、`bom_count_lines`，權限沿用 `bom_private.can_read／can_write`。結構見 `supabase/migrations/`。上線前跑 `tests/` 的模擬測試。
