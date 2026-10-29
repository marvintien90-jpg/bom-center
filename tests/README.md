# 模擬測試

用假的 Supabase（`mock.js`，記憶體資料庫，模擬權限與盤點觸發程序）載入建置好的 `index.html`，測四種身分：管理員、進階版業主、基本版只讀（手機寬度）、待開通／未登入。

```
cd tests && npm i --no-save xlsx@0.18.5 playwright
node run.js /絕對路徑/index.html
```

全部通過才上線。這是模擬測試，正式網站仍要用真帳號實測。

## 大量資料驗證

`node big.js /abs/index.html`：用 `bigdata.js` 的模擬門市（156 食材、60 道菜、25 供應商、1500 張進貨單、14 次盤點）測分頁、用量差異（核對預埋偏差）、損益串接、速度與手機版。

資料庫裡的同一家模擬門市用 `seed_model_store.sql` 建立（品牌 id `test-model-store`，只有管理員看得到），`cleanup_model_store.sql` 刪除。
