-- 客戶全景：開店籌備、選址、投資試算、客戶類型（存在輔導客戶主檔）
-- 只加一個欄位，權限沿用 coach_clients 原本的「只有管理員」政策。
alter table public.coach_clients add column if not exists plan jsonb not null default '{}'::jsonb;

-- 欄位還沒建立前，網頁會先把資料暫存在備註最後面（#全景:{...}），這裡搬進新欄位並把備註清乾淨
update public.coach_clients
set plan = substring(note from position(E'\n#全景:' in note) + 5)::jsonb,
    note = nullif(left(note, position(E'\n#全景:' in note) - 1), '')
where note like E'%\n#全景:%';
