import { initializeDatabase } from './db.js';
import { hmac, equal, randomHex, json } from './util.js';

const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), n => n.toString(16).padStart(2, '0')).join('');

export const ROLES = {
  super: 'Quản trị cao nhất',
  staff: 'Cán bộ cấp GCN & dự án',
  viewer: 'Chỉ xem',
};

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
export const verifyPassword = async (password, user) => equal(await hashPassword(password, user.salt), user.hash);

const COOKIE = 'fts_gcn_admin';
// Cookie: id.rev.hạn.chữ-ký. Đổi mật khẩu, khóa hoặc xóa tài khoản làm phiên cũ hết hiệu lực ngay.
export async function currentAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET || !env.DB) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const p = m[1].split('.');
  if (p.length !== 4) return null;
  const [id, rev, exp, sig] = p;
  if (!/^\d+$/.test(id) || !/^\d{13}$/.test(exp) || Date.now() > Number(exp)) return null;
  if (!equal(sig, await hmac(env.ADMIN_SESSION_SECRET, [id, rev, exp].join('.')))) return null;
  try {
    await initializeDatabase(env);
    const u = await env.DB.prepare('SELECT id,username,name,role,status,must_change,session_rev FROM admins WHERE id=?').bind(Number(id)).first();
    return u && u.status === 'active' && String(u.session_rev) === rev ? u : null;
  } catch { return null; }
}

export async function makeSession(env, u) {
  const exp = String(Date.now() + 8 * 3600e3), v = [u.id, u.session_rev || 0, exp].join('.');
  return `${COOKIE}=${v}.${await hmac(env.ADMIN_SESSION_SECRET, v)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}
export const clearSession = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function sameOrigin(request) {
  try {
    const o = request.headers.get('origin');
    return !!o && new URL(o).origin === new URL(request.url).origin;
  } catch { return false; }
}

// Quyền: super làm được mọi việc; staff quản lý dự án, mẫu, GCN, giao dịch; viewer chỉ xem.
export const can = (u, level) => {
  if (!u) return false;
  if (u.role === 'super') return true;
  if (level === 'view') return true;
  if (level === 'edit') return u.role === 'staff';
  return false;
};

export const log = (env, u, action) =>
  env.DB.prepare('INSERT INTO audit(actor,action) VALUES(?,?)').bind(u ? u.username : 'hệ thống', String(action).slice(0, 500)).run().catch(() => {});

// Giới hạn số lần gọi theo địa chỉ IP.
export async function limited(env, request, key, max, windowMs) {
  const c = key + ':' + (request.headers.get('cf-connecting-ip') || 'local'), now = Date.now();
  const r = await env.DB.prepare('SELECT count,window_start FROM login_attempts WHERE client=?').bind(c).first();
  const fresh = r && now - r.window_start < windowMs;
  if (fresh && r.count >= max) return true;
  await env.DB.prepare('INSERT INTO login_attempts(client,count,window_start) VALUES(?,?,?) ON CONFLICT(client) DO UPDATE SET count=excluded.count, window_start=excluded.window_start')
    .bind(c, fresh ? r.count + 1 : 1, fresh ? r.window_start : now).run();
  return false;
}

// Bọc API quản trị: kiểm tra đăng nhập, quyền, nguồn gọi.
export function adminApi(level, handler) {
  return async ctx => {
    const { request, env } = ctx;
    try {
      await initializeDatabase(env);
      const me = await currentAdmin(request, env);
      if (!me) return json({ error: 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.' }, 401);
      if (me.must_change) return json({ error: 'Bạn cần đổi mật khẩu trước khi tiếp tục.', mustChange: true }, 403);
      const write = request.method !== 'GET';
      if (write && !sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ (khác nguồn).' }, 403);
      if (!can(me, write || level === 'super' ? level : 'view')) return json({ error: 'Tài khoản của bạn không có quyền thực hiện thao tác này.' }, 403);
      return await handler({ ...ctx, me });
    } catch (e) {
      return json({ error: e.message || 'Lỗi hệ thống' }, 500);
    }
  };
}

export { randomHex };
