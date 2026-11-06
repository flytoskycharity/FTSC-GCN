// Giao dịch sao kê và lượt đăng ký ủng hộ: đồng bộ, dán sao kê tay, gán giao dịch chưa nhận diện để cấp GCN.
import { adminApi, log } from '../../_lib/auth.js';
import { loadSettings, getState, setState } from '../../_lib/db.js';
import { json, readJson, clip, normPhone } from '../../_lib/util.js';
import { syncBank, applyTx, parsePasted, statementUrl, fetchStatement } from '../../_lib/bank.js';
import { issueCertificate, verifyPath } from '../../_lib/certs.js';
import { campaignById } from '../../_lib/campaigns.js';

export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  if (request.method === 'GET') {
    const u = new URL(request.url), view = u.searchParams.get('view') || 'tx', status = u.searchParams.get('status') || '';
    if (view === 'donations') {
      const { results } = await env.DB.prepare(`SELECT d.*, c.title campaign, x.code cert_code, x.sig cert_sig FROM donations d LEFT JOIN campaigns c ON c.id=d.campaign_id LEFT JOIN certificates x ON x.id=d.cert_id
        ${status ? 'WHERE d.status=?' : ''} ORDER BY d.id DESC LIMIT 200`).bind(...(status ? [status] : [])).all();
      return json({ items: (results || []).map(d => ({ ...d, token: undefined, cert_url: d.cert_code ? verifyPath({ code: d.cert_code, sig: d.cert_sig }) : '' })) });
    }
    const { results } = await env.DB.prepare(`SELECT t.*, c.title campaign, x.code cert_code, x.sig cert_sig FROM bank_tx t LEFT JOIN campaigns c ON c.id=t.campaign_id LEFT JOIN certificates x ON x.id=t.cert_id
      ${status ? 'WHERE t.status=?' : "WHERE t.status<>'other'"} ORDER BY t.tx_date DESC, t.created_at DESC LIMIT 300`).bind(...(status ? [status] : [])).all();
    return json({ items: (results || []).map(t => ({ ...t, cert_url: t.cert_code ? verifyPath({ code: t.cert_code, sig: t.cert_sig }) : '' })), sync: await getState(env, 'bank_sync'), syncUrl: statementUrl(await loadSettings(env)) });
  }
  const b = await readJson(request) || {};
  const settings = await loadSettings(env);
  if (b.action === 'sync') {
    try { const r = await syncBank(env, settings, { force: true }); await log(env, me, `đồng bộ sao kê: ${r.added || 0} giao dịch mới, cấp ${r.matched || 0} GCN`); return json(r); }
    catch (e) { return json({ error: e.message }, 502); }
  }
  if (b.action === 'test') {
    try { const list = await fetchStatement({ ...settings, sync: { ...settings.sync, url: b.url || settings.sync.url } }); return json({ ok: true, count: list.length, sample: list.slice(0, 5) }); }
    catch (e) { return json({ error: e.message }, 400); }
  }
  if (b.action === 'paste') {
    const { results: camps } = await env.DB.prepare("SELECT * FROM campaigns WHERE memo_prefix<>''").all();
    const list = parsePasted(camps || [], b.text);
    if (!list.length) return json({ error: 'Không đọc được giao dịch nào. Mỗi dòng dạng: ngày | số tiền | nội dung.' }, 400);
    const r = await applyTx(env, settings, list, 'paste');
    await log(env, me, `dán sao kê: ${r.added} giao dịch mới, cấp ${r.matched} GCN`);
    return json({ ok: true, read: list.length, ...r });
  }
  const tx = b.id ? await env.DB.prepare('SELECT * FROM bank_tx WHERE id=?').bind(String(b.id)).first() : null;
  if (b.action === 'assign') {
    if (!tx) return json({ error: 'Không tìm thấy giao dịch.' }, 404);
    if (tx.cert_id) return json({ error: 'Giao dịch đã được cấp giấy.' }, 400);
    const c = await campaignById(env, b.campaign || tx.campaign_id);
    if (!c) return json({ error: 'Vui lòng chọn dự án.' }, 400);
    if (!clip(b.name, 160)) return json({ error: 'Vui lòng nhập họ tên.' }, 400);
    const cert = await issueCertificate(env, settings, { campaign: c, name: b.name, phone: normPhone(b.phone), org: b.org, amount: tx.amount, issued_date: tx.tx_date, source: 'auto', created_by: me.username, note: 'Gán từ giao dịch sao kê' });
    await env.DB.prepare("UPDATE bank_tx SET campaign_id=?, cert_id=?, status='matched' WHERE id=?").bind(c.id, cert.id, tx.id).run();
    await log(env, me, `gán giao dịch ${tx.amount} cho ${b.name}, cấp ${cert.code}`);
    return json({ ok: true, code: cert.code, url: verifyPath(cert) });
  }
  if (b.action === 'ignore' || b.action === 'unignore') {
    if (!tx) return json({ error: 'Không tìm thấy giao dịch.' }, 404);
    await env.DB.prepare('UPDATE bank_tx SET status=? WHERE id=?').bind(b.action === 'ignore' ? 'ignored' : (tx.campaign_id ? 'unmatched' : 'other'), tx.id).run();
    return json({ ok: true });
  }
  if (b.action === 'cancelDonation') {
    await env.DB.prepare("UPDATE donations SET status='cancelled' WHERE id=? AND status='pending'").bind(Number(b.donation) || 0).run();
    return json({ ok: true });
  }
  if (b.action === 'resetSync') { await setState(env, 'bank_sync', {}); return json({ ok: true }); }
  return json({ error: 'Thao tác không hợp lệ' }, 400);
});
