// Phục vụ ảnh, tệp tải lên kho R2 (ảnh bìa dự án, nền mẫu giấy, chữ ký, con dấu).
export async function onRequestGet({ env, params }) {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!env.MEDIA || !/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..') || key.startsWith('private/')) return new Response('Not found', { status: 404 });
  const f = await env.MEDIA.get(key);
  if (!f) return new Response('Not found', { status: 404 });
  const h = new Headers({ 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  if (f.writeHttpMetadata) f.writeHttpMetadata(h);
  if (!h.get('Content-Type')) h.set('Content-Type', 'application/octet-stream');
  return new Response(f.body, { headers: h });
}
