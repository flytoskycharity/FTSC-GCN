import { adminApi, hashPassword, randomHex, log, ROLES } from '../../_lib/auth.js';
import { json, readJson, clip } from '../../_lib/util.js';

const USER = /^[a-z0-9._-]{3,40}$/;
const otherSupers = async (env, id) => (await env.DB.prepare("SELECT COUNT(*) n FROM admins WHERE role='super' AND status='active' AND id<>?").bind(id).first()).n;

export const onRequest = adminApi('super', async ({ request, env, me }) => {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,username,name,role,status,must_change,last_login,created_at FROM admins ORDER BY id').all();
    const { results: audit } = await env.DB.prepare('SELECT actor,action,at FROM audit ORDER BY id DESC LIMIT 300').all();
    return json({ users: results, roles: ROLES, audit });
  }
  const b = await readJson(request) || {};
  const id = Number(b.id) || 0, role = ROLES[b.role] ? b.role : 'staff', pw = String(b.password || '');
  const t = id ? await env.DB.prepare('SELECT * FROM admins WHERE id=?').bind(id).first() : null;
  if (b.action !== 'create' && !t) return json({ error: 'Không tìm thấy tài khoản.' }, 404);
  switch (b.action) {
    case 'create': {
      const username = String(b.username || '').trim().toLowerCase();
      if (!USER.test(username)) return json({ error: 'Tên đăng nhập gồm 3–40 ký tự: chữ thường không dấu, số, dấu chấm, gạch.' }, 400);
      if (pw.length < 8) return json({ error: 'Mật khẩu tạm cần ít nhất 8 ký tự.' }, 400);
      if (await env.DB.prepare('SELECT 1 x FROM admins WHERE username=?').bind(username).first()) return json({ error: 'Tên đăng nhập đã tồn tại.' }, 409);
      const salt = randomHex(16);
      await env.DB.prepare('INSERT INTO admins(username,name,role,salt,hash,must_change) VALUES(?,?,?,?,?,1)').bind(username, clip(b.name, 120), role, salt, await hashPassword(pw, salt)).run();
      await log(env, me, 'tạo tài khoản ' + username);
      break;
    }
    case 'update':
      if (t.role === 'super' && role !== 'super' && !await otherSupers(env, id)) return json({ error: 'Phải còn ít nhất một Quản trị cao nhất.' }, 400);
      await env.DB.prepare('UPDATE admins SET name=?, role=?, session_rev=session_rev+? WHERE id=?').bind(clip(b.name, 120), role, role !== t.role ? 1 : 0, id).run();
      await log(env, me, 'sửa tài khoản ' + t.username);
      break;
    case 'reset': {
      if (pw.length < 8) return json({ error: 'Mật khẩu tạm cần ít nhất 8 ký tự.' }, 400);
      const salt = randomHex(16);
      await env.DB.prepare('UPDATE admins SET salt=?, hash=?, must_change=1, session_rev=session_rev+1 WHERE id=?').bind(salt, await hashPassword(pw, salt), id).run();
      await log(env, me, 'đặt lại mật khẩu ' + t.username);
      break;
    }
    case 'lock': case 'unlock':
      if (id === me.id) return json({ error: 'Không thể khóa chính tài khoản đang đăng nhập.' }, 400);
      if (b.action === 'lock' && t.role === 'super' && !await otherSupers(env, id)) return json({ error: 'Phải còn ít nhất một Quản trị cao nhất.' }, 400);
      await env.DB.prepare('UPDATE admins SET status=?, session_rev=session_rev+1 WHERE id=?').bind(b.action === 'lock' ? 'locked' : 'active', id).run();
      await log(env, me, (b.action === 'lock' ? 'khóa ' : 'mở khóa ') + t.username);
      break;
    case 'delete':
      if (id === me.id) return json({ error: 'Không thể xóa chính tài khoản đang đăng nhập.' }, 400);
      if (t.role === 'super' && !await otherSupers(env, id)) return json({ error: 'Phải còn ít nhất một Quản trị cao nhất.' }, 400);
      await env.DB.prepare('DELETE FROM admins WHERE id=?').bind(id).run();
      await log(env, me, 'xóa tài khoản ' + t.username);
      break;
    default: return json({ error: 'Thao tác không hợp lệ' }, 400);
  }
  return json({ ok: true });
});
