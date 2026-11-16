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
