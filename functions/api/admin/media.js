// Tải ảnh lên kho R2: ảnh bìa dự án, nền mẫu giấy, chữ ký, con dấu.
import { adminApi, log, randomHex } from '../../_lib/auth.js';
import { json } from '../../_lib/util.js';

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };

export const onRequestPost = adminApi('edit', async ({ request, env, me }) => {
  if (!env.MEDIA) return json({ error: 'Chưa gắn kho ảnh R2 (binding MEDIA).' }, 503);
  const form = await request.formData().catch(() => null);
  const f = form && form.get('file');
  if (!f || typeof f === 'string') return json({ error: 'Chưa chọn tệp.' }, 400);
  const ext = TYPES[f.type];
  const folder0 = String(form.get('folder') || '');
  if (!ext || (ext === 'pdf' && folder0 !== 'confirm')) return json({ error: 'Chỉ nhận ảnh PNG, JPG, WEBP, SVG (PDF chỉ dùng cho Giấy xác nhận tài trợ).' }, 400);
  if (f.size > 10e6) return json({ error: 'Tệp tối đa 10 MB.' }, 413);
  let body = await f.arrayBuffer();
  if (ext === 'svg') {
    const t = new TextDecoder().decode(body);
    if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(t)) return json({ error: 'Tệp SVG chứa mã không an toàn.' }, 400);
  }
  const folder = /^(covers|templates|signs|confirm)$/.test(String(form.get('folder'))) ? form.get('folder') : 'uploads';
  const key = `${folder}/${new Date().toISOString().slice(0, 10)}-${randomHex(6)}.${ext}`;
  await env.MEDIA.put(key, body, { httpMetadata: { contentType: f.type } });
  await env.DB.prepare('INSERT INTO media(key,filename,mime,size) VALUES(?,?,?,?)').bind(key, String(f.name || '').slice(0, 200), f.type, f.size).run();
  await log(env, me, 'tải ảnh ' + key);
  return json({ ok: true, url: '/media/' + key });
});
