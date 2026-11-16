-- 訂閱系統第三版（2026-11-11）：每日營運檢查
--   1. 每天 10:30（台北）檢查前 24 小時的金流異常、發票失敗、逾期未付、即將到期的試用、資料沒更新的顧問會員，
--      有狀況才寄信給 Marvin，沒事不寄。
--   2. 開立失敗的發票自動重試（最多 5 次），不用到會員中心按「補開」。
-- 可以重複執行。

create or replace function sub_private.ops_check() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  since timestamptz := now() - interval '24 hours';
  bad jsonb; inv jsonb; due jsonb; trials jsonb; stale jsonb; paid jsonb; html text := ''; n int := 0;
  anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoeHFuY3Bra3ptcGt0d3V2enZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTMyODcsImV4cCI6MjEwNjk4OTI4N30.cDjeuOxx2UZLrOWYcNhqy4dO2cdznscJ7CWr0DZGZ2g';
  sec text; r record;
begin
  -- 金流異常：簽章錯誤、金額不符、伺服器錯誤、舊扣款停不掉
  select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'email', s.email, 'detail', l.detail) order by l.at), '[]') into bad
  from public.sub_log l left join public.sub_subscriptions s on s.user_id = l.user_id
  where l.at >= since and l.action in ('notify_error', 'notify_bad_mac', 'notify_amount_mismatch', 'cancel_old_period_failed');

  -- 發票失敗：先自動重試（最多 5 次），再列出仍失敗的
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'sub_cron_secret' limit 1;
  if sec is not null and (select invoice_mode from public.sub_settings where id = 1) <> 'off' then
    for r in select payment_id from public.sub_invoices where status = 'failed' and attempts < 5 loop
      perform net.http_post(
        url := 'https://thxqncpkkzmpktwuvzvz.supabase.co/functions/v1/billing',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon, 'x-cron-secret', sec),
        body := jsonb_build_object('action', 'invoice_retry', 'payment_id', r.payment_id),
        timeout_milliseconds := 20000);
    end loop;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('payment', i.payment_id, 'email', s.email, 'amount', i.amount, 'attempts', i.attempts, 'error', i.error)), '[]') into inv
  from public.sub_invoices i join public.sub_subscriptions s on s.id = i.subscription_id
  where i.status = 'failed' and not i.sandbox;

  select coalesce(jsonb_agg(jsonb_build_object('email', email, 'company', company, 'period_end', period_end)), '[]') into due
  from public.sub_subscriptions where status = 'past_due';

  select coalesce(jsonb_agg(jsonb_build_object('email', email, 'company', company, 'ends', trial_ends_on)), '[]') into trials
  from public.sub_subscriptions where status = 'trial' and trial_ends_on between sub_private.today() and sub_private.today() + 3;

  select coalesce(jsonb_agg(jsonb_build_object('email', s.email, 'brand', s.brand_name, 'latest', l.detail->>'latest', 'want', l.detail->>'want')), '[]') into stale
  from public.sub_log l join public.sub_subscriptions s on s.user_id = l.user_id
  where l.at >= since and l.action = 'deck_stale';

  select jsonb_build_object('count', count(*), 'sum', coalesce(sum(amount), 0)) into paid
  from public.sub_payments where kind in ('first', 'period') and status = 'paid' and not sandbox and paid_at >= since;

  if jsonb_array_length(bad) > 0 then
    n := n + jsonb_array_length(bad);
    html := html || '<h3 style="color:#ae140c">金流異常 ' || jsonb_array_length(bad) || ' 筆</h3><p>沒有延長使用期限，請到 Supabase 的 sub_log 查看。</p><ul>'
      || (select string_agg('<li>' || to_char((x->>'at')::timestamptz at time zone 'Asia/Taipei', 'MM/DD HH24:MI') || ' ' || bom_private.esc(x->>'action') || ' ' || coalesce(bom_private.esc(x->>'email'), ''), '' ) from jsonb_array_elements(bad) x) || '</ul>';
  end if;
  if jsonb_array_length(inv) > 0 then
    n := n + jsonb_array_length(inv);
    html := html || '<h3 style="color:#ae140c">發票開立失敗 ' || jsonb_array_length(inv) || ' 筆</h3><p>系統已自動重試；仍失敗的請到會員中心「發票」分頁按補開。</p><ul>'
      || (select string_agg('<li>' || bom_private.esc(x->>'email') || ' NT$' || (x->>'amount') || '（已試 ' || (x->>'attempts') || ' 次）' || coalesce(bom_private.esc(x->>'error'), ''), '') from jsonb_array_elements(inv) x) || '</ul>';
  end if;
  if jsonb_array_length(due) > 0 then
    n := n + jsonb_array_length(due);
    html := html || '<h3 style="color:#e08208">扣款失敗、寬限中 ' || jsonb_array_length(due) || ' 位</h3><ul>'
      || (select string_agg('<li>' || bom_private.esc(x->>'company') || '（' || bom_private.esc(x->>'email') || '）', '') from jsonb_array_elements(due) x) || '</ul>';
  end if;
  if jsonb_array_length(stale) > 0 then
    n := n + jsonb_array_length(stale);
    html := html || '<h3 style="color:#e08208">顧問會員月報還沒更新 ' || jsonb_array_length(stale) || ' 位</h3><p>這個月的健檢簡報沒有產生，請提醒業主上傳月報。</p><ul>'
      || (select string_agg('<li>' || bom_private.esc(x->>'brand') || '：資料只到 ' || (x->>'latest') || '，需要 ' || (x->>'want'), '') from jsonb_array_elements(stale) x) || '</ul>';
  end if;
  if n > 0 and jsonb_array_length(trials) > 0 then
    html := html || '<h3>3 天內試用到期 ' || jsonb_array_length(trials) || ' 位</h3><ul>'
      || (select string_agg('<li>' || bom_private.esc(x->>'company') || ' ' || (x->>'ends'), '') from jsonb_array_elements(trials) x) || '</ul>';
  end if;

  if n > 0 then
    perform bom_private.send_mail('ops', 'marvintien90@gmail.com', '訂閱系統每日檢查：有 ' || n || ' 件要注意',
      html || '<p style="color:#8c8c8c">昨天正式收款 ' || (paid->>'count') || ' 筆，共 NT$' || (paid->>'sum') || '。</p>', null);
  end if;
  insert into public.sub_log (action, detail) values ('ops_check', jsonb_build_object('alerts', n, 'paid', paid));
  return jsonb_build_object('alerts', n, 'bad', bad, 'invoice_failed', inv, 'past_due', due, 'trials', trials, 'stale', stale, 'paid', paid);
end $$;
revoke execute on function sub_private.ops_check() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'sub-ops') then perform cron.unschedule('sub-ops'); end if;
  perform cron.schedule('sub-ops', '30 2 * * *', 'select sub_private.ops_check()');
end $$;

select '完成' as 結果, sub_private.ops_check() as 今天的檢查;
