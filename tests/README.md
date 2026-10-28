# 模擬測試

用假的 Supabase（`mock.js`，記憶體資料庫，模擬權限與盤點觸發程序）載入建置好的 `index.html`，測四種身分：管理員、進階版業主、基本版只讀（手機寬度）、待開通／未登入。

```
cd tests && npm i --no-save xlsx@0.18.5 playwright
node run.js /絕對路徑/index.html
```

全部通過才上線。這是模擬測試，正式網站仍要用真帳號實測。
