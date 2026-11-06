// Người nhận đề xuất điều chỉnh thông tin Giấy chứng nhận (cần đúng mã xác thực và 4 số cuối điện thoại).
import { initializeDatabase } from '../_lib/db.js';
import { limited, sameOrigin } from '../_lib/auth.js';
import { json, readJson, clip } from '../_lib/util.js';
import { findCert } from '../_lib/verify.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  await initializeDatabase(env);
  if (await limited(env, request, 'certfix', 8, 36e5)) return json({ error: 'Bạn gửi quá nhiều lần. Vui lòng thử lại sau.' }, 429);
  const b = await readJson(request) || {};
  const { c, state } = await findCert(env, String(b.code || ''), String(b.s || ''));
  if (state !== 'valid') return json({ error: 'Không tìm thấy Giấy chứng nhận hợp lệ.' }, 404);
  if (c.phone && String(b.last4 || '').trim() !== c.phone.slice(-4)) return json({ error: '4 số cuối điện thoại chưa đúng với số đã đăng ký.' }, 400);
  const name = clip(b.name, 160), org = clip(b.org, 200), reason = clip(b.reason, 500);
  if (!name) return json({ error: 'Vui lòng nhập họ tên.' }, 400);
  if (!reason) return json({ error: 'Vui lòng ghi nội dung cần điều chỉnh.' }, 400);
  const changes = {};
  if (name !== c.name) changes.name = name;
  if (org !== (c.org || '')) changes.org = org;
  // Đề xuất mới thay cho đề xuất cũ còn đang chờ của cùng giấy.
  await env.DB.prepare("UPDATE cert_requests SET status='replaced' WHERE cert_id=? AND status='pending'").bind(c.id).run();
  await env.DB.prepare('INSERT INTO cert_requests(cert_id,code,changes,reason,contact,ip) VALUES(?,?,?,?,?,?)')
    .bind(c.id, c.code, JSON.stringify(changes), reason, clip(b.contact, 160), request.headers.get('cf-connecting-ip') || '').run();
  return json({ ok: true });
}
