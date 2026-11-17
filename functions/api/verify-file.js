// Đối chiếu bản scan ảnh giấy ký tay với tệp gốc do quản trị viên tải lên.
// Chỉ xác nhận khi hai tệp trùng từng byte SHA-256; ảnh chụp lại/scan lại cần đối chiếu thủ công.
import { initializeDatabase } from '../_lib/db.js';
import { limited, sameOrigin } from '../_lib/auth.js';
import { json } from '../_lib/util.js';
import { sha256Hex } from '../_lib/pdfsig.js';
import { verifyPath } from '../_lib/certs.js';
import { docKindLabel } from '../_lib/docs.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  await initializeDatabase(env);
  if (await limited(env, request, 'scancheck', 40, 36e5)) return json({ error: 'Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau.' }, 429);
  const mime = request.headers.get('Content-Type') || '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return json({ error: 'Chỉ đối chiếu ảnh scan JPG, PNG hoặc WEBP.' }, 400);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > 15e6) return json({ error: 'Tệp ảnh tối đa 15 MB.' }, 413);
  const hash = await sha256Hex(bytes);
  const c = await env.DB.prepare("SELECT code,sig,name,campaign_name,status,doc_kind FROM certificates WHERE doc_hash=? AND doc_type='scan' AND doc_mime LIKE 'image/%'")
    .bind(hash).first();
  const match = c ? { code: c.code, name: c.name, project: c.campaign_name, kind: docKindLabel(c),
    revoked: c.status === 'revoked', url: verifyPath(c) } : null;
  return json({ match });
}