# 顧問工作台（/consult/）

顧問專用的單一入口，和業主入口共用同一組 Supabase 登入（同網域，登入一次兩邊都通）。

- 權限：只有 `bom_profiles.role='admin'` 且 `status='active'` 才看到系統清單；業主與未登入只看到「只開放顧問使用／請先登入」。
- 業主入口 `portal/` 在管理員畫面上方多一張「顧問工作台」卡片，業主看不到。
- 系統清單在 `consult/index.html` 的 `GROUPS`，加一筆就多一張卡。
- 上方數字直接讀 `checkup_leads`（管理員 RLS 已允許）：新名單、逾期（新名單 ≥1 天、已聯絡 ≥3 天）、本月新健檢、累計成交。
- 測試：`node tests/consult.test.js`、`node tests/portal.test.js`。
