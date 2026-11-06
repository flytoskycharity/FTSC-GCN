import { adminApi } from '../../_lib/auth.js';
import { getState } from '../../_lib/db.js';
import { json } from '../../_lib/util.js';

export const onRequestGet = adminApi('view', async ({ env }) => {
  const one = sql => env.DB.prepare(sql).first().then(r => r?.n || 0);
  const [certs, revoked, campaigns, open, pending, unmatched, month] = await Promise.all([
    one('SELECT COUNT(*) n FROM certificates'), one("SELECT COUNT(*) n FROM certificates WHERE status='revoked'"),
    one('SELECT COUNT(*) n FROM campaigns'), one("SELECT COUNT(*) n FROM campaigns WHERE status='open'"),
    one("SELECT COUNT(*) n FROM donations WHERE status='pending'"), one("SELECT COUNT(*) n FROM bank_tx WHERE status='unmatched'"),
    one("SELECT COUNT(*) n FROM certificates WHERE created_at >= date('now','-30 day')"),
  ]);
  const { results: recent } = await env.DB.prepare('SELECT code,sig,name,campaign_name,amount,amount_text,issued_date,source,status FROM certificates ORDER BY id DESC LIMIT 8').all();
  const { results: audit } = await env.DB.prepare('SELECT actor,action,at FROM audit ORDER BY id DESC LIMIT 12').all();
  return json({ certs, revoked, campaigns, open, pending, unmatched, month, recent, audit, sync: await getState(env, 'bank_sync') });
});
