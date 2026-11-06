import { adminApi, log } from '../../_lib/auth.js';
import { json, readJson, clip, money } from '../../_lib/util.js';
import { DEFAULT_TEMPLATE, FIELD_KEYS, IMAGE_KEYS, parseTemplate } from '../../_lib/certs.js';

const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : d; };
const color = v => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : '#14333c';
const bg = v => { const s = String(v || '').trim(); return /^\/(media|brand)\/[a-z0-9/_.-]+$/i.test(s) ? s : DEFAULT_TEMPLATE.background; };

function cleanFields(list) {
  return (Array.isArray(list) ? list : []).filter(f => f && FIELD_KEYS[f.key]).slice(0, 30).map(f => {
    const img = IMAGE_KEYS.includes(f.key);
    const o = { key: f.key, x: num(f.x, -10, 110, 50), y: num(f.y, -10, 110, 50) };
    if (f.visible === false) o.visible = false;
    if (img) { o.w = num(f.w, 1, 60, 10); return o; }
    Object.assign(o, { size: num(f.size, 0.3, 12, 2), color: color(f.color), align: ['left', 'center', 'right'].includes(f.align) ? f.align : 'center', bold: !!f.bold });
    if (f.font === 'serif') o.font = 'serif';
    if (f.upper) o.upper = true;
    if (f.maxw) o.maxw = num(f.maxw, 5, 100, 0);
    if (f.prefix) o.prefix = clip(f.prefix, 60);
    if (f.key === 'text') o.text = clip(f.text, 300);
    return o;
  });
}

export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM templates ORDER BY campaign_id, min_amount, id').all();
    return json({ templates: (results || []).map(parseTemplate), defaults: DEFAULT_TEMPLATE, fieldKeys: FIELD_KEYS, imageKeys: IMAGE_KEYS });
  }
  const b = await readJson(request) || {};
  const id = Number(b.id || b.record?.id) || 0;
  if (b.action === 'delete') {
    const used = await env.DB.prepare('SELECT COUNT(*) n FROM certificates WHERE template_id=?').bind(id).first();
    if (used.n) return json({ error: `Mẫu đang dùng cho ${used.n} giấy. Hãy tắt mẫu thay vì xóa để giấy đã cấp vẫn hiển thị đúng.` }, 400);
    await env.DB.prepare('DELETE FROM templates WHERE id=?').bind(id).run();
    await log(env, me, 'xóa mẫu #' + id);
    return json({ ok: true });
  }
  if (b.action !== 'save') return json({ error: 'Thao tác không hợp lệ' }, 400);
  const r = b.record || {};
  const v = [Number(r.campaign_id) || 0, clip(r.name, 120) || 'Mẫu mới', bg(r.background), num(r.width, 200, 8000, 1600) | 0, num(r.height, 200, 8000, 1131) | 0,
    JSON.stringify(cleanFields(r.fields)), money(r.min_amount), r.enabled === false || r.enabled === 0 ? 0 : 1];
  if (id) {
    await env.DB.prepare('UPDATE templates SET campaign_id=?,name=?,background=?,width=?,height=?,fields=?,min_amount=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...v, id).run();
    await log(env, me, 'sửa mẫu ' + v[1]);
    return json({ ok: true, id });
  }
  const res = await env.DB.prepare('INSERT INTO templates(campaign_id,name,background,width,height,fields,min_amount,enabled) VALUES(?,?,?,?,?,?,?,?)').bind(...v).run();
  await log(env, me, 'tạo mẫu ' + v[1]);
  return json({ ok: true, id: res.meta.last_row_id });
});
