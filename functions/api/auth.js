import { initializeDatabase } from '../_lib/db.js';
import { currentAdmin, makeSession, sameOrigin, hashPassword, verifyPassword, randomHex, limited, log } from '../_lib/auth.js';
import { json, readJson, equal } from '../_lib/util.js';

const pub = u => u && { id: u.id, username: u.username, name: u.name, role: u.role, mustChange: !!u.must_change };

export async function onRequest({ request, env }) {
  if (request.method === 'GET') {
    const u = await currentAdmin(request, env);
    return json({ loggedIn: !!u, user: pub(u), configured: !!(env.ADMIN_PASSWORD && env.ADMIN_SESSION_SECRET && env.DB) });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  if (!env.ADMIN_SESSION_SECRET) return json({ error: 'Chưa cấu hình ADMIN_SESSION_SECRET trên Cloudflare.' }, 503);
  try { await initializeDatabase(env); } catch (e) { return json({ error: 'Không khởi tạo được D1: ' + e.message }, 503); }
  const b = await readJson(request) || {};
  if (b.action === 'change') {
    const u = await currentAdmin(request, env);
    if (!u) return json({ error: 'Phiên đăng nhập đã hết.' }, 401);
    const full = await env.DB.prepare('SELECT * FROM admins WHERE id=?').bind(u.id).first();
    if (!await verifyPassword(String(b.current || ''), full)) return json({ error: 'Mật khẩu hiện tại không đúng.' }, 400);
    if (String(b.next || '').length < 8) return json({ error: 'Mật khẩu mới cần ít nhất 8 ký tự.' }, 400);
    const salt = randomHex(16), rev = full.session_rev + 1;
    await env.DB.prepare('UPDATE admins SET salt=?, hash=?, must_change=0, session_rev=? WHERE id=?').bind(salt, await hashPassword(b.next, salt), rev, u.id).run();
    await log(env, u, 'đổi mật khẩu');
    return json({ ok: true }, 200, { 'Set-Cookie': await makeSession(env, { id: u.id, session_rev: rev }) });
  }
  if (await limited(env, request, 'login', 8, 15 * 60e3)) return json({ error: 'Bạn nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' }, 429);
  const username = String(b.username || 'admin').trim().toLowerCase(), password = String(b.password || '');
  if (password.length > 256) return json({ error: 'Sai tài khoản hoặc mật khẩu.' }, 401);
  let u = await env.DB.prepare('SELECT * FROM admins WHERE username=?').bind(username).first();
  // ADMIN_PASSWORD trên Cloudflare luôn đăng nhập được tài khoản "admin": dùng để khởi tạo và khôi phục.
  const master = username === 'admin' && !!env.ADMIN_PASSWORD && equal(password, env.ADMIN_PASSWORD);
  if (!u && master) {
    const salt = randomHex(16);
    await env.DB.prepare("INSERT INTO admins(username,name,role,salt,hash,must_change) VALUES('admin','Quản trị viên','super',?,?,0)").bind(salt, await hashPassword(password, salt)).run();
    u = await env.DB.prepare('SELECT * FROM admins WHERE username=?').bind('admin').first();
  }
  if (!u || !(master || await verifyPassword(password, u))) return json({ error: 'Sai tài khoản hoặc mật khẩu.' }, 401);
  if (u.status !== 'active') return json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' }, 403);
  if (master && u.status === 'active') await env.DB.prepare('UPDATE admins SET role=? WHERE id=?').bind('super', u.id).run();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE client=?').bind('login:' + (request.headers.get('cf-connecting-ip') || 'local')),
    env.DB.prepare('UPDATE admins SET last_login=CURRENT_TIMESTAMP WHERE id=?').bind(u.id),
  ]);
  await log(env, u, 'đăng nhập');
  return json({ ok: true, user: pub(u) }, 200, { 'Set-Cookie': await makeSession(env, u) });
}
