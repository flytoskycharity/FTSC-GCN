import { adminApi, log, can } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/db.js';
import { json, readJson, clip, nameKey, normPhone, toIsoDate, vnToday, amountOf } from '../../_lib/util.js';
import { issueCertificate, verifyPath } from '../../_lib/certs.js';
import { campaignById } from '../../_lib/campaigns.js';

const PAGE = 30;

export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  if (request.method === 'GET') {
    const u = new URL(request.url), q = (u.searchParams.get('q') || '').trim(), page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    const where = [], args = [];
    if (q) {
      const phone = normPhone(q);
      if (phone) { where.push('phone=?'); args.push(phone); }
      else { where.push('(code LIKE ? OR name_key LIKE ?)'); args.push('%' + q.toUpperCase() + '%', '%' + nameKey(q) + '%'); }
    }
    const camp = u.searchParams.get('campaign');
    if (camp !== null && camp !== '') { where.push('campaign_id=?'); args.push(Number(camp) || 0); }
    for (const k of ['source', 'status']) { const v = u.searchParams.get(k); if (v) { where.push(k + '=?'); args.push(v); } }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = (await env.DB.prepare('SELECT COUNT(*) n FROM certificates' + w).bind(...args).first()).n;
    const { results } = await env.DB.prepare('SELECT * FROM certificates' + w + ' ORDER BY id DESC LIMIT ? OFFSET ?').bind(...args, PAGE, (page - 1) * PAGE).all();
    return json({ items: (results || []).map(c => ({ ...c, url: verifyPath(c) })), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
  }
  const b = await readJson(request) || {};
  const settings = await loadSettings(env);
  const id = Number(b.id) || 0;
  const cur = id ? await env.DB.prepare('SELECT * FROM certificates WHERE id=?').bind(id).first() : null;
  if (['update', 'revoke', 'restore', 'delete'].includes(b.action) && !cur) return json({ error: 'Không tìm thấy giấy chứng nhận.' }, 404);

  if (b.action === 'create' || b.action === 'bulk') {
    const list = b.action === 'bulk' ? (Array.isArray(b.records) ? b.records : []) : [b.record || {}];
    if (!list.length) return json({ error: 'Chưa có dữ liệu.' }, 400);
    if (list.length > 500) return json({ error: 'Mỗi lần cấp tối đa 500 giấy.' }, 400);
    const campaign = b.campaign ? await campaignById(env, b.campaign) : null;
    const out = [], errors = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const c = r.campaign_id ? await campaignById(env, r.campaign_id) : campaign;
      const amt = typeof r.amount === 'number' ? { amount: r.amount, text: '' } : amountOf(r.amount);
      try {
        if (!clip(r.name, 160)) throw new Error('thiếu họ tên');
        const cert = await issueCertificate(env, settings, {
          campaign: c, campaign_name: r.campaign_name, name: r.name, phone: r.phone, org: r.org,
          amount: amt.amount, amount_text: r.amount_text || amt.text, issued_date: r.issued_date || vnToday(),
          template_id: r.template_id ?? b.template_id ?? 'auto', code: r.code, source: 'manual', file_url: r.file_url, note: r.note, created_by: me.username,
        });
        out.push({ id: cert.id, code: cert.code, url: verifyPath(cert) });
      } catch (e) { errors.push(`Dòng ${i + 1}: ${e.message}`); }
    }
    await log(env, me, `cấp ${out.length} giấy chứng nhận` + (campaign ? ' cho ' + campaign.title : ''));
    return json({ ok: true, created: out, errors });
  }

  if (b.action === 'update') {
    const r = b.record || {};
    const c = r.campaign_id !== undefined ? await campaignById(env, r.campaign_id) : null;
    const amt = r.amount === '' || r.amount === null || r.amount === undefined ? { amount: null, text: '' } : amountOf(r.amount);
    const next = {
      name: clip(r.name ?? cur.name, 160), org: clip(r.org ?? cur.org, 200), phone: r.phone !== undefined ? (normPhone(r.phone) || '') : cur.phone,
      amount: amt.amount, amount_text: clip(r.amount_text ?? amt.text, 200), issued_date: toIsoDate(r.issued_date) || cur.issued_date,
      campaign_id: c ? c.id : (r.campaign_id !== undefined ? 0 : cur.campaign_id), campaign_name: clip(r.campaign_name ?? (c ? c.title : cur.campaign_name), 200),
      template_id: r.template_id !== undefined && r.template_id !== '' ? Number(r.template_id) || 0 : cur.template_id,
      file_url: /^https:\/\//.test(String(r.file_url || '')) ? clip(r.file_url, 500) : (r.file_url === '' ? '' : cur.file_url),
      note: clip(r.note ?? cur.note, 500),
    };
    if (!next.name) return json({ error: 'Họ tên không được để trống.' }, 400);
    const keys = ['name', 'org', 'phone', 'amount', 'amount_text', 'issued_date', 'campaign_name'];
    const old = Object.fromEntries(keys.map(k => [k, cur[k]]));
    const changed = keys.some(k => String(old[k] ?? '') !== String(next[k] ?? ''));
    const hist = JSON.parse(cur.history || '[]');
    if (changed) hist.push({ at: vnToday(), by: me.username, old, reason: clip(b.reason, 300) });
    await env.DB.prepare(`UPDATE certificates SET name=?,name_key=?,org=?,phone=?,amount=?,amount_text=?,issued_date=?,campaign_id=?,campaign_name=?,template_id=?,file_url=?,note=?,history=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(next.name, nameKey(next.name), next.org, next.phone, next.amount, next.amount_text, next.issued_date, next.campaign_id, next.campaign_name, next.template_id, next.file_url, next.note, JSON.stringify(hist), id).run();
    await log(env, me, 'sửa giấy ' + cur.code);
    return json({ ok: true });
  }
  if (b.action === 'revoke' || b.action === 'restore') {
    const reason = clip(b.reason, 300);
    if (b.action === 'revoke' && !reason) return json({ error: 'Vui lòng nhập lý do thu hồi.' }, 400);
    await env.DB.prepare('UPDATE certificates SET status=?, revoke_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.action === 'revoke' ? 'revoked' : 'valid', b.action === 'revoke' ? reason : '', id).run();
    await log(env, me, (b.action === 'revoke' ? 'thu hồi giấy ' : 'khôi phục giấy ') + cur.code + (reason ? ': ' + reason : ''));
    return json({ ok: true });
  }
  if (b.action === 'delete') {
    if (!can(me, 'super')) return json({ error: 'Chỉ Quản trị cao nhất được xóa giấy. Hãy dùng "Thu hồi".' }, 403);
    await env.DB.prepare('DELETE FROM certificates WHERE id=?').bind(id).run();
    await log(env, me, 'xóa giấy ' + cur.code);
    return json({ ok: true });
  }
  return json({ error: 'Thao tác không hợp lệ' }, 400);
});
