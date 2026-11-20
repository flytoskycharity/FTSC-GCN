// Tệp giấy đã cấp: chỉ mở được bằng mã giấy + mã xác thực (như đường dẫn trong QR).
import { initializeDatabase } from '../_lib/db.js';
import { equal, normCode } from '../_lib/util.js';
import { driveId, driveFile } from '../_lib/drive.js';

export async function onRequestGet({ request, env }) {
  const nf = () => new Response('Không tìm thấy', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!env.DB || !env.MEDIA) return nf();
  await initializeDatabase(env);
  const u = new URL(request.url), code = normCode(u.searchParams.get('code') || ''), s = (u.searchParams.get('s') || '').toUpperCase();
  const c = await env.DB.prepare('SELECT code,sig,status,doc_file,doc_mime,file_url FROM certificates WHERE code=?').bind(code).first();
  if (!c || c.status === 'revoked' || !equal(s, c.sig)) return nf();
  let body, mime;
  if (c.doc_file) {
    const f = await env.MEDIA.get(c.doc_file); if (!f) return nf();
    body = f.body; mime = c.doc_mime;
  } else {
    // Giấy cũ chỉ có link Google Drive: dùng bản sao máy chủ đã tải về.
    const id = driveId(c.file_url), f = id ? await driveFile(env, id) : null; if (!f) return nf();
    body = f.body; mime = f.mime;
  }
  const ext = mime === 'application/pdf' ? 'pdf' : (mime || '').split('/')[1] || 'bin';
  const h = new Headers({ 'Content-Type': mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex',
    'Content-Disposition': `${u.searchParams.get('dl') ? 'attachment' : 'inline'}; filename="${c.code.replace(/[^A-Za-z0-9_.-]+/g, '-')}.${ext}"` });
  return new Response(body, { headers: h });
}
