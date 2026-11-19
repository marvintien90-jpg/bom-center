# S01 短片／限動產生工具

- `npm i satori@0.10.14 @resvg/resvg-js@2.6.2`（在 tools/ 底下）
- 圖：`node render.mjs spec.json` → `out/card-N.png`。spec 是參數陣列，`type=story` 為 1080x1920 限動版（`cta` 兩行用 | 分隔，`-` 代表不放）。
- 短片：`./reel.sh out reels/2026-11-xx.mp4 3`（每張 3 秒、滑入轉場、無聲音軌）。
- 檔案 push 到本分支後，Meta 用 `https://raw.githubusercontent.com/marvintien90-jpg/bom-center/media/<路徑>` 抓取。
