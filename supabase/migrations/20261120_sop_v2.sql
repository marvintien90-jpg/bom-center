-- SOP 手冊第二版（2026-11-20）
-- 1) sop_manuals.profile：店況問卷（服務方式、規模、人力、廚房、外送、設備、痛點、未來規劃、健檢低分題）
-- 2) qsc_audits.crit_fail：該次稽核「關鍵項」不符合的數量（有任何一項時總分最高 59 分）
-- 兩個欄位都只是新增，有預設值，不影響既有資料；前端在欄位還沒建立前也能運作。

alter table public.sop_manuals add column if not exists profile jsonb not null default '{}'::jsonb;
comment on column public.sop_manuals.profile is '店況問卷：svc,stage,crew,staff,kitchen,deli,hours[],equip[],extra[],pain[],future[],ck[](健檢低分題),lead';

alter table public.qsc_audits add column if not exists crit_fail int not null default 0;
comment on column public.qsc_audits.crit_fail is '關鍵項不符合數；>0 時該次分數最高 59';
