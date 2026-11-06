// Đề xuất điều chỉnh thông tin Giấy chứng nhận: xem, duyệt (cập nhật giấy + ghi lịch sử), từ chối.
import { adminApi, log } from '../../_lib/auth.js';
import { json, readJson, clip, nameKey, vnToday } from '../../_lib/util.js';
import { verifyPath } from '../../_lib/certs.js';

export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  if (request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status') || 'pending';
    const { results } = await env.DB.prepare(`SELECT r.*, c.name cur_name, c.org cur_org, c.phone cur_phone, c.sig, c.campaign_name, c.status cert_status FROM cert_requests r LEFT JOIN certificates c ON c.id=r.cert_id
      ${status === 'all' ? '' : 'WHERE r.status=?'} ORDER BY r.id DESC LIMIT 200`).bind(...(status === 'all' ? [] : [status])).all();
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM cert_requests WHERE status='pending'").first();
    return json({ pending: n?.n || 0, items: (results || []).map(r => ({ ...r, ip: undefined, changes: JSON.parse(r.changes || '{}'), url: r.sig ? verifyPath({ code: r.code, sig: r.sig }) : '' })) });
  }
  const b = await readJson(request) || {};
  const r = await env.DB.prepare('SELECT * FROM cert_requests WHERE id=?').bind(Number(b.id) || 0).first();
  if (!r) return json({ error: 'Không tìm thấy đề xuất.' }, 404);
  if (r.status !== 'pending') return json({ error: 'Đề xuất này đã được xử lý.' }, 400);
  const reply = clip(b.reply, 300);
  if (b.action === 'reject') {
    await env.DB.prepare("UPDATE cert_requests SET status='rejected', reply=?, handled_by=?, handled_at=? WHERE id=?").bind(reply, me.username, vnToday(), r.id).run();
    await log(env, me, 'từ chối đề xuất điều chỉnh giấy ' + r.code);
    return json({ ok: true });
  }
  if (b.action !== 'approve') return json({ error: 'Thao tác không hợp lệ' }, 400);
  const c = await env.DB.prepare('SELECT * FROM certificates WHERE id=?').bind(r.cert_id).first();
  if (!c) return json({ error: 'Giấy chứng nhận không còn trên hệ thống.' }, 404);
  const name = clip(b.name ?? c.name, 160), org = clip(b.org ?? c.org, 200);
  if (!name) return json({ error: 'Họ tên không được để trống.' }, 400);
  const changed = name !== c.name || org !== (c.org || '');
  if (changed) {
    const hist = JSON.parse(c.history || '[]');
    hist.push({ at: vnToday(), by: me.username, old: { name: c.name, org: c.org || '' }, reason: 'Theo đề xuất của người nhận' });
    await env.DB.prepare('UPDATE certificates SET name=?, name_key=?, org=?, history=?, img_ok=0, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(name, nameKey(name), org, JSON.stringify(hist), c.id).run();
  }
  await env.DB.prepare("UPDATE cert_requests SET status='approved', reply=?, handled_by=?, handled_at=? WHERE id=?").bind(reply, me.username, vnToday(), r.id).run();
  await log(env, me, `duyệt đề xuất điều chỉnh giấy ${r.code}` + (changed ? '' : ' (không thay đổi thông tin)'));
  return json({ ok: true, changed });
});
