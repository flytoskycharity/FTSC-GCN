// Tệp giấy đã cấp: chỉ mở được bằng mã giấy + mã xác thực (như đường dẫn trong QR).
import { initializeDatabase } from '../_lib/db.js';
import { equal, normCode } from '../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const nf = () => new Response('Không tìm thấy', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!env.DB || !env.MEDIA) return nf();
  await initializeDatabase(env);
  const u = new URL(request.url), code = normCode(u.searchParams.get('code') || ''), s = (u.searchParams.get('s') || '').toUpperCase();
  const c = await env.DB.prepare('SELECT code,sig,status,doc_file,doc_mime FROM certificates WHERE code=?').bind(code).first();
  if (!c || !c.doc_file || c.status === 'revoked' || !equal(s, c.sig)) return nf();
  const f = await env.MEDIA.get(c.doc_file);
  if (!f) return nf();
  const ext = c.doc_mime === 'application/pdf' ? 'pdf' : c.doc_mime.split('/')[1] || 'bin';
  const h = new Headers({ 'Content-Type': c.doc_mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex',
    'Content-Disposition': `${u.searchParams.get('dl') ? 'attachment' : 'inline'}; filename="${c.code.replace(/[^A-Za-z0-9_.-]+/g, '-')}.${ext}"` });
  return new Response(f.body, { headers: h });
}
