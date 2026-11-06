// Phục vụ ảnh, tệp tải lên kho R2 (ảnh bìa dự án, Giấy xác nhận tài trợ…).
// Phôi giấy, chữ ký, con dấu và vùng riêng tư chỉ quản trị viên xem được: không để lộ nền trống cho kẻ làm giả.
import { currentAdmin } from '../_lib/auth.js';
import { DEFAULT_BG_SVG } from '../_lib/default-bg.js';

const PROTECTED = /^(private|templates|signs|_default)\//;

export async function onRequestGet({ request, env, params }) {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  const nf = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) return nf();
  const guarded = PROTECTED.test(key);
  if (guarded && (key.startsWith('private/') || !(await currentAdmin(request, env)))) return nf();
  const h = new Headers({ 'Cache-Control': guarded ? 'private, no-store' : 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  if (key === '_default/cert.svg') { h.set('Content-Type', 'image/svg+xml'); return new Response(DEFAULT_BG_SVG, { headers: h }); }
  if (!env.MEDIA) return nf();
  const f = await env.MEDIA.get(key);
  if (!f) return nf();
  if (f.writeHttpMetadata) f.writeHttpMetadata(h);
  if (guarded) h.set('Cache-Control', 'private, no-store');
  if (!h.get('Content-Type')) h.set('Content-Type', 'application/octet-stream');
  return new Response(f.body, { headers: h });
}
