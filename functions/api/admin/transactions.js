// Giao dịch sao kê và lượt đăng ký ủng hộ: đồng bộ, dán sao kê tay, gán giao dịch chưa nhận diện để cấp GCN.
import { adminApi, log, can } from '../../_lib/auth.js';
import { loadSettings, getState, setState } from '../../_lib/db.js';
import { json, readJson, clip, normPhone, vnToday } from '../../_lib/util.js';
import { syncBank, applyTx, parsePasted, statementUrl, fetchStatement, payDonation } from '../../_lib/bank.js';
import { issueCertificate, verifyPath, deleteCertificate } from '../../_lib/certs.js';
import { campaignById } from '../../_lib/campaigns.js';

export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  if (request.method === 'GET') {
    const u = new URL(request.url), view = u.searchParams.get('view') || 'tx', status = u.searchParams.get('status') || '';
    if (view === 'donations') {
      const q = clip(u.searchParams.get('q'), 80).trim(), where = [], args = [];
      if (status) { where.push('d.status=?'); args.push(status); }
      if (q) { where.push('(d.name LIKE ? OR d.phone LIKE ? OR d.memo LIKE ?)'); args.push(`%${q}%`, `%${normPhone(q) || q}%`, `%${q}%`); }
      const { results } = await env.DB.prepare(`SELECT d.*, c.title campaign, x.code cert_code, x.sig cert_sig FROM donations d LEFT JOIN campaigns c ON c.id=d.campaign_id LEFT JOIN certificates x ON x.id=d.cert_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${status === 'pending' ? "(d.reported_at<>'') DESC, " : ''}d.id DESC LIMIT 300`).bind(...args).all();
      const n = await env.DB.prepare("SELECT status, COUNT(*) n FROM donations GROUP BY status").all();
      return json({ counts: Object.fromEntries((n.results || []).map(r => [r.status, r.n])), items: (results || []).map(d => ({ ...d, token: undefined, cert_url: d.cert_code ? verifyPath({ code: d.cert_code, sig: d.cert_sig }) : '' })) });
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
  if (b.action === 'approve') {
    // Duyệt thủ công: admin xác nhận đã nhận tiền (xem trên app ngân hàng), hệ thống cấp Giấy chứng nhận.
    const d = await env.DB.prepare('SELECT * FROM donations WHERE id=?').bind(Number(b.donation) || 0).first();
    if (!d) return json({ error: 'Không tìm thấy lượt ủng hộ.' }, 404);
    if (d.status === 'paid' || d.cert_id) return json({ error: 'Lượt này đã được duyệt.' }, 400);
    const c = await campaignById(env, b.campaign || d.campaign_id);
    if (!c) return json({ error: 'Vui lòng chọn dự án.' }, 400);
    const amount = Math.round(Number(String(b.amount ?? d.amount).replace(/[^\d]/g, '')) || 0);
    if (c.kind === 'money' && amount < 1000) return json({ error: 'Vui lòng nhập số tiền thực nhận.' }, 400);
    const name = clip(b.name, 160).trim() || d.name;
    if (!name) return json({ error: 'Vui lòng nhập họ tên.' }, 400);
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : vnToday();
    await env.DB.prepare('UPDATE donations SET name=?, campaign_id=? WHERE id=?').bind(name, c.id, d.id).run();
    const certId = await payDonation(env, settings, { ...d, name, campaign_id: c.id }, c, amount, '', iso, { source: 'manual', by: me.username });
    const cert = await env.DB.prepare('SELECT code, sig FROM certificates WHERE id=?').bind(certId).first();
    await log(env, me, `duyệt ủng hộ #${d.id} ${name} ${amount}, cấp ${cert?.code}`);
    return json({ ok: true, code: cert?.code, url: cert ? verifyPath(cert) : '' });
  }
  if (b.action === 'deleteDonation') {
    // Xóa hẳn lượt ủng hộ (đăng ký nhầm, trùng, thử). Lượt đã cấp giấy thì xóa luôn giấy: chỉ Quản trị cao nhất.
    const d = await env.DB.prepare('SELECT * FROM donations WHERE id=?').bind(Number(b.donation) || 0).first();
    if (!d) return json({ error: 'Không tìm thấy lượt ủng hộ.' }, 404);
    const cert = d.cert_id ? await env.DB.prepare('SELECT * FROM certificates WHERE id=?').bind(d.cert_id).first() : null;
    if (cert && !can(me, 'super')) return json({ error: 'Lượt này đã cấp Giấy chứng nhận. Chỉ Quản trị cao nhất được xóa; bạn có thể thu hồi giấy ở mục Giấy chứng nhận.' }, 403);
    if (cert) await deleteCertificate(env, cert);
    await env.DB.batch([
      env.DB.prepare('UPDATE bank_tx SET donation_id=0 WHERE donation_id=?').bind(d.id),
      env.DB.prepare('DELETE FROM donations WHERE id=?').bind(d.id),
    ]);
    await log(env, me, `xóa lượt ủng hộ #${d.id} ${d.name} ${d.amount}` + (cert ? ' và giấy ' + cert.code : ''));
    return json({ ok: true });
  }
  if (b.action === 'cancelDonation' || b.action === 'restoreDonation') {
    const [to, from] = b.action === 'cancelDonation' ? ['cancelled', 'pending'] : ['pending', 'cancelled'];
    await env.DB.prepare('UPDATE donations SET status=? WHERE id=? AND status=?').bind(to, Number(b.donation) || 0, from).run();
    await log(env, me, (to === 'cancelled' ? 'hủy' : 'khôi phục') + ' lượt ủng hộ #' + b.donation);
    return json({ ok: true });
  }
  if (b.action === 'confirm') {
    // Gắn Giấy xác nhận tài trợ (PDF/ảnh đã tải lên) cho lượt ủng hộ; người ủng hộ tải được khi tra cứu.
    const file = String(b.file || '').trim();
    if (file && !/^\/media\/confirm\/[a-z0-9/_.-]+$/i.test(file) && !/^https:\/\//.test(file)) return json({ error: 'Đường dẫn tệp không hợp lệ.' }, 400);
    await env.DB.prepare('UPDATE donations SET confirm_file=? WHERE id=?').bind(file, Number(b.donation) || 0).run();
    await log(env, me, 'cập nhật Giấy xác nhận tài trợ cho lượt ủng hộ #' + b.donation);
    return json({ ok: true });
  }
  if (b.action === 'resetSync') { await setState(env, 'bank_sync', {}); return json({ ok: true }); }
  return json({ error: 'Thao tác không hợp lệ' }, 400);
});
