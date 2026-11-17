# 餐飲立地評估（site/）

網址（上線後）：https://marvintien90-jpg.github.io/bom-center/site/

- `site/index.html`：評估頁。輸入地址（Nominatim 定位）或在地圖點選，選業態、客單價、開價月租與坪數。
- `site/score.js`：評分模型（客群、人流、交通與車流、競爭、租金成本；7 種業態權重；營收＝標準店來客 × 立地係數）。
- `site/data/`：由 `.github/workflows/site-data.yml` 自動產生，請勿手改。
  - `tiles/`：OpenStreetMap 店家、站點、道路（0.02 度方格）
  - `villages.json`：村里中心、面積、人口年齡（戶政司 ODRP014）、所得中位數（財政部）
  - `biz/<縣市>.json`：稅籍餐飲登記，依「區|路段」統計家數與近 1／3 年新登記
  - `rent.json`：實價登錄一樓店面租金中位數（元／坪／月），依區與路段
- 權限：未登入只看總分與重點；有訂閱（試用、付費、招待）或管理員可看完整報告與候選店比較。
- 更新：每月 4 日自動重跑；在 main 上跑完會把 `site/data` 直接推到 gh-pages。
- 已知限制：OSM 店家不完整（尤其手搖飲），人流是間接指標；第二版可加 Google 地圖評分、TDX 捷運進出量。

## 第二版（2026-11-17）
- 地址定位：Esri ArcGIS（門牌級，含輸入提示 suggest）→ Nominatim（地標）→ 逐步去掉樓層／門牌／巷弄。多個可能位置時讓使用者挑；圖釘可拖曳，點地圖直接重評。
- 地圖：滑鼠移到點上顯示店名、類型、料理、品牌、連鎖、距離與步行分鐘；11 個圖層開關（記在瀏覽器）。
- 條件調整（會員）：商圈半徑 200–1500m、自訂競品關鍵字、五面向權重拉桿，即時重算。score.js `evaluate` 新增 opt.radius / opt.weights / opt.keyword。
- 會員新增：業態適配排行（7 業態同點比較）、時段潛力（daypart）、競品清單搜尋／只看連鎖／CSV 匯出、損益試算（`SiteScore.pnl`）、附近 600m 熱區掃描（7×7 網格）、分享連結（?lat&lon&f&a&ticket&rent&ping）、最近評估紀錄（localStorage）。
