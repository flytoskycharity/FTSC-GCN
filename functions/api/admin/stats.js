import { adminApi } from '../../_lib/auth.js';
import { getState } from '../../_lib/db.js';
import { json } from '../../_lib/util.js';
import { driveId } from '../../_lib/drive.js';
import { baseCode } from '../../_lib/search.js';

export const onRequestGet = adminApi('view', async ({ env }) => {
  const one = sql => env.DB.prepare(sql).first().then(r => r?.n || 0);
  const [certs, revoked, campaigns, open, pending, unmatched, month, suspicious, fixes] = await Promise.all([
    one('SELECT COUNT(*) n FROM certificates'), one("SELECT COUNT(*) n FROM certificates WHERE status='revoked'"),
    one('SELECT COUNT(*) n FROM campaigns'), one("SELECT COUNT(*) n FROM campaigns WHERE status='open'"),
    one("SELECT COUNT(*) n FROM donations WHERE status='pending'"), one("SELECT COUNT(*) n FROM bank_tx WHERE status='unmatched'"),
    one("SELECT COUNT(*) n FROM certificates WHERE created_at >= date('now','-30 day')"),
    one("SELECT COUNT(*) n FROM verify_logs WHERE status='new'"), one("SELECT COUNT(*) n FROM cert_requests WHERE status='pending'"),
  ]);
  const { results: recent } = await env.DB.prepare('SELECT code,sig,name,campaign_name,amount,amount_text,issued_date,source,status FROM certificates ORDER BY id DESC LIMIT 8').all();
  const { results: audit } = await env.DB.prepare('SELECT actor,action,at FROM audit ORDER BY id DESC LIMIT 12').all();
  // Tệp gốc Google Drive gắn cho nhiều giấy khác nhau (thường do dán nhầm link): trang Kiểm tra giấy sẽ không so được các giấy này.
  const { results: linked } = await env.DB.prepare("SELECT code,name,name_key,campaign_name,file_url FROM certificates WHERE status<>'revoked' AND (doc_file IS NULL OR doc_file='') AND file_url LIKE '%google.com%'").all();
  const byFile = new Map();
  for (const c of linked || []) { const id = driveId(c.file_url); if (id) byFile.set(id, [...(byFile.get(id) || []), c]); }
  const sharedFiles = [...byFile.values()].filter(g => new Set(g.map(c => baseCode(c.code) + '|' + c.name_key)).size > 1)
    .map(g => g.map(c => ({ code: c.code, name: c.name, campaign: c.campaign_name })));
  return json({ sharedCount: sharedFiles.length, sharedFiles: sharedFiles.slice(0, 50), certs, revoked, campaigns, open, pending, unmatched, month, suspicious, fixes, recent, audit, sync: await getState(env, 'bank_sync') });
});
