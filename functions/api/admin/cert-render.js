// Hàng đợi ghép ảnh Giấy chứng nhận. Trình duyệt quản trị (có quyền xem phôi) ghép nền + chữ thành một ảnh JPEG
// rồi gửi lên đây; trang công khai chỉ hiện ảnh đã ghép, không bao giờ gửi nền trống, chữ ký, con dấu riêng.
import { adminApi, randomHex } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/db.js';
import { json, codePath } from '../../_lib/util.js';
import { certValues, templateOf } from '../../_lib/certs.js';
import { qrSvg } from '../../_lib/qr.js';

const PENDING = "status='valid' AND img_ok=0 AND doc_file='' AND (file_url='' OR template_id>0)";

export const onRequest = adminApi('edit', async ({ request, env }) => {
  const u = new URL(request.url);
  if (request.method === 'GET') {
    const settings = await loadSettings(env), origin = String(settings.site.url || u.origin).replace(/\/$/, '');
    const left = (await env.DB.prepare(`SELECT COUNT(*) n FROM certificates WHERE ${PENDING}`).first())?.n || 0;
    const { results } = await env.DB.prepare(`SELECT * FROM certificates WHERE ${PENDING} ORDER BY id DESC LIMIT 8`).all();
    const items = [];
    for (const c of results || []) {
      const tpl = await templateOf(env, c);
      items.push({
        id: c.id, code: c.code, ver: c.updated_at || '',
        tpl: { background: tpl.background, width: tpl.width, height: tpl.height, fields: (tpl.fields || []).filter(f => f.visible !== false) },
        values: certValues(settings, c),
        images: { qr: 'data:image/svg+xml;utf8,' + encodeURIComponent(qrSvg(`${origin}/xac-thuc/${codePath(c.code)}?s=${c.sig}`, { dark: '#000', level: 'M', border: 2 })), signature: settings.cert.signature || '', stamp: settings.cert.stamp || '' },
        fonts: [settings.theme.fontHeading, settings.theme.fontBody], watermark: c.code,
      });
    }
    return json({ left, items });
  }
  if (!env.MEDIA) return json({ error: 'Chưa gắn kho R2 (MEDIA).' }, 503);
  const id = Number(u.searchParams.get('id')) || 0;
  const c = await env.DB.prepare('SELECT id, cert_image, updated_at FROM certificates WHERE id=?').bind(id).first();
  if (!c) return json({ error: 'Không tìm thấy giấy.' }, 404);
  const buf = await request.arrayBuffer();
  const b = new Uint8Array(buf.slice(0, 3));
  if (!buf.byteLength || buf.byteLength > 10e6 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return json({ error: 'Ảnh không hợp lệ.' }, 400);
  // Giấy bị sửa trong lúc đang ghép thì bỏ ảnh này, lượt sau ghép lại.
  if ((u.searchParams.get('ver') || '') !== (c.updated_at || '')) return json({ ok: true, skipped: true });
  const key = `private/certs/${id}-${randomHex(6)}.jpg`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: 'image/jpeg' } });
  await env.DB.prepare('UPDATE certificates SET cert_image=?, img_ok=1 WHERE id=?').bind(key, id).run();
  if (c.cert_image && c.cert_image !== key) await env.MEDIA.delete(c.cert_image).catch(() => {});
  return json({ ok: true });
});
