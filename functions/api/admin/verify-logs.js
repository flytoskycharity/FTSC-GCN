// Nhật ký xác thực sai/lỗi: giấy tải lên không khớp, mã sai, giấy thu hồi, mã QR lạ… kèm ảnh để điều tra.
import { adminApi, log } from '../../_lib/auth.js';
import { json, readJson, clip } from '../../_lib/util.js';

const PAGE = 40;
export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  const u = new URL(request.url);
  if (request.method === 'GET') {
    const img = Number(u.searchParams.get('image')) || 0;
    if (img) {
      const r = await env.DB.prepare('SELECT image FROM verify_logs WHERE id=?').bind(img).first();
      const f = r?.image && env.MEDIA ? await env.MEDIA.get(r.image) : null;
      if (!f) return new Response('Không có ảnh', { status: 404 });
      return new Response(f.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const status = u.searchParams.get('status') || 'new', kind = u.searchParams.get('kind') || '', page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    const where = [], args = [];
    if (status !== 'all') { where.push('status=?'); args.push(status); }
    if (kind) { where.push('kind=?'); args.push(kind); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = (await env.DB.prepare('SELECT COUNT(*) n FROM verify_logs' + w).bind(...args).first()).n;
    const { results } = await env.DB.prepare('SELECT * FROM verify_logs' + w + ' ORDER BY id DESC LIMIT ? OFFSET ?').bind(...args, PAGE, (page - 1) * PAGE).all();
    return json({ items: results || [], total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
  }
  const b = await readJson(request) || {};
  const id = Number(b.id) || 0;
  if (b.action === 'check' || b.action === 'reopen') {
    await env.DB.prepare('UPDATE verify_logs SET status=?, note=?, checked_by=? WHERE id=?').bind(b.action === 'check' ? 'checked' : 'new', clip(b.note, 1000), me.username, id).run();
    await log(env, me, (b.action === 'check' ? 'đã xử lý' : 'mở lại') + ' nhật ký xác thực #' + id);
    return json({ ok: true });
  }
  return json({ error: 'Thao tác không hợp lệ' }, 400);
});
