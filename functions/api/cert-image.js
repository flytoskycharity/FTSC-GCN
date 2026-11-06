// Ảnh Giấy chứng nhận đã ghép sẵn (nền + chữ + chữ ký + QR thành một ảnh JPEG duy nhất).
// Chỉ trả cho đường dẫn có mã xác thực đúng; nền trống, chữ ký, con dấu không bao giờ gửi riêng ra ngoài.
import { initializeDatabase } from '../_lib/db.js';
import { findCert } from '../_lib/verify.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const nf = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!env.DB || !env.MEDIA) return nf();
  await initializeDatabase(env);
  const { c, state } = await findCert(env, u.searchParams.get('code') || '', u.searchParams.get('s') || '');
  if (state !== 'valid' || !c.img_ok || !c.cert_image) return nf();
  const f = await env.MEDIA.get(c.cert_image);
  if (!f) return nf();
  const h = new Headers({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' });
  if (u.searchParams.get('dl')) h.set('Content-Disposition', `attachment; filename="GCN-${c.code.replace(/[^\p{L}\p{N}_-]+/gu, '-')}.jpg"; filename*=UTF-8''${encodeURIComponent('GCN-' + c.code.replace(/\//g, '-'))}.jpg`);
  return new Response(f.body, { headers: h });
}
