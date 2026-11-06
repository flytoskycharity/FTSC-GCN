import { adminApi, log } from '../../_lib/auth.js';
import { raisedOf, FUND_SLUG } from '../../_lib/db.js';
import { json, readJson, slugify, clip, money } from '../../_lib/util.js';

const STATUS = ['draft', 'open', 'closed', 'hidden'];
const dt = v => { const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/); return m ? m[1] + 'T' + (m[2] || '00:00') : ''; };
const mediaUrl = v => { const s = String(v || '').trim(); return /^\/media\/[a-z0-9/_.-]+$/i.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s) ? s : ''; };

export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT c.*, (SELECT COUNT(*) FROM certificates x WHERE x.campaign_id=c.id) certs,
      (SELECT COUNT(*) FROM templates t WHERE t.campaign_id=c.id) templates FROM campaigns c ORDER BY c.sort DESC, c.id DESC`).all();
    return json({ campaigns: await Promise.all((results || []).map(async c => ({ ...c, raised: await raisedOf(env, c) }))) });
  }
  const b = await readJson(request) || {};
  if (b.action === 'delete') {
    const id = Number(b.id) || 0;
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM certificates WHERE campaign_id=?').bind(id).first();
    if (n.n) return json({ error: `Dự án đã có ${n.n} giấy chứng nhận, không xóa được. Hãy chuyển sang "Ẩn".` }, 400);
    const f = await env.DB.prepare('SELECT slug FROM campaigns WHERE id=?').bind(id).first();
    if (f?.slug === FUND_SLUG) return json({ error: 'Không xóa Quỹ chung. Muốn tạm dừng nhận ủng hộ, hãy bỏ chọn "Nhận ủng hộ trực tuyến".' }, 400);
    await env.DB.batch([env.DB.prepare('DELETE FROM templates WHERE campaign_id=?').bind(id), env.DB.prepare('DELETE FROM campaigns WHERE id=?').bind(id)]);
    await log(env, me, 'xóa dự án #' + id);
    return json({ ok: true });
  }
  if (b.action !== 'save') return json({ error: 'Thao tác không hợp lệ' }, 400);
  const r = b.record || {};
  const title = clip(r.title, 200);
  if (!title) return json({ error: 'Vui lòng nhập tên dự án.' }, 400);
  const id = Number(r.id) || 0;
  const cur = id ? await env.DB.prepare('SELECT slug FROM campaigns WHERE id=?').bind(id).first() : null;
  let slug = cur?.slug === FUND_SLUG ? FUND_SLUG : slugify(r.slug || title);
  const clash = await env.DB.prepare('SELECT id FROM campaigns WHERE slug=? AND id<>?').bind(slug, id).first();
  if (clash) slug = slug.slice(0, 70) + '-' + Date.now().toString(36).slice(-4);
  const memo = clip(r.memo_prefix, 40).toUpperCase();
  if (memo) {
    const dup = await env.DB.prepare('SELECT title FROM campaigns WHERE UPPER(memo_prefix)=? AND id<>?').bind(memo, id).first();
    if (dup) return json({ error: `Cú pháp "${memo}" đang dùng cho dự án "${dup.title}". Mỗi dự án cần cú pháp riêng.` }, 400);
  }
  const v = [slug, title, r.kind === 'program' ? 'program' : 'money', STATUS.includes(r.status) ? r.status : 'draft', dt(r.start_at), dt(r.end_at), memo,
    money(r.goal), Number(String(r.raised_offset ?? 0).replace(/[^\d-]/g, '')) || 0, clip(r.summary, 400), clip(r.description, 20000), mediaUrl(r.cover),
    clip(r.cert_prefix, 10).toUpperCase().replace(/[^A-Z0-9]/g, ''), r.accept_donations === false || r.accept_donations === 0 ? 0 : 1, Number(r.sort) || 0, clip(r.benefits, 3000)];
  if (id) {
    await env.DB.prepare(`UPDATE campaigns SET slug=?,title=?,kind=?,status=?,start_at=?,end_at=?,memo_prefix=?,goal=?,raised_offset=?,summary=?,description=?,cover=?,cert_prefix=?,accept_donations=?,sort=?,benefits=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...v, id).run();
    await log(env, me, 'sửa dự án ' + title);
    return json({ ok: true, id });
  }
  const res = await env.DB.prepare(`INSERT INTO campaigns(slug,title,kind,status,start_at,end_at,memo_prefix,goal,raised_offset,summary,description,cover,cert_prefix,accept_donations,sort,benefits) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...v).run();
  await log(env, me, 'tạo dự án ' + title);
  return json({ ok: true, id: res.meta.last_row_id });
});
