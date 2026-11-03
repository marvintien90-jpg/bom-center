// 金流環境：模式由資料表 sub_settings.billing_mode 決定（off／test／live），金鑰只放在 edge function 的 secrets。
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { ECPAY_TEST_MERCHANT } from './ecpay.js';

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export type Mode = 'off' | 'test' | 'live';

export async function settings(db: ReturnType<typeof admin>) {
  const { data, error } = await db.from('sub_settings').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('NO_SETTINGS');
  return data as { billing_mode: Mode; provider: string; grace_days: number };
}

// 正式模式一定要有正式金鑰；測試模式沒設定就用綠界公開的測試特店
export function merchant(mode: Mode) {
  if (mode === 'live') {
    const id = Deno.env.get('ECPAY_MERCHANT_ID'), key = Deno.env.get('ECPAY_HASH_KEY'), iv = Deno.env.get('ECPAY_HASH_IV');
    if (!id || !key || !iv) throw new Error('NO_LIVE_KEYS');
    return { id, key, iv };
  }
  return {
    id: Deno.env.get('ECPAY_TEST_MERCHANT_ID') || ECPAY_TEST_MERCHANT.id,
    key: Deno.env.get('ECPAY_TEST_HASH_KEY') || ECPAY_TEST_MERCHANT.key,
    iv: Deno.env.get('ECPAY_TEST_HASH_IV') || ECPAY_TEST_MERCHANT.iv,
  };
}

export const SITE = Deno.env.get('SUB_SITE_URL') || 'https://marvintien90-jpg.github.io/bom-center/member/';
