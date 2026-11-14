// Thông báo đẩy cho cán bộ quản trị: khoá VAPID, đăng ký/huỷ thiết bị, gửi thử, chặn khi chưa đăng nhập.
// Chạy khi tests/dev-server.mjs đang chạy: node tests/push.test.mjs
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
const B = 'http://localhost:' + (process.env.PORT || 8788);
let cookie = '';
async function call(path, body, auth = true) {
  const h = { Origin: B }; if (auth && cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(B + path, { method: body !== undefined ? 'POST' : 'GET', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && auth) cookie = sc.split(';')[0];
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const ok = (m) => console.log('✓', m);
assert.equal((await call('/api/admin/push/key', undefined, false)).status, 401); ok('chưa đăng nhập không lấy được khoá');
assert.equal((await call('/api/auth', { username: 'admin', password: 'test-pass' })).status, 200);
const k1 = (await call('/api/admin/push/key')).data.publicKey, k2 = (await call('/api/admin/push/key')).data.publicKey;
assert.equal(Buffer.from(k1, 'base64url').length, 65); assert.equal(k1, k2); ok('khoá VAPID tự sinh, ổn định');
const ua = createECDH('prime256v1'); ua.generateKeys();
const subscription = { endpoint: 'https://push.invalid/send/' + randomBytes(6).toString('hex'), keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
assert.equal((await call('/api/admin/push/subscribe', { subscription: { endpoint: 'http://x', keys: {} } })).status, 400); ok('chặn đăng ký sai');
const n = (r) => r.sent + r.failed + r.removed;
const t0 = (await call('/api/admin/push/test', {})).data;
assert.equal((await call('/api/admin/push/subscribe', { subscription })).data.ok, true); ok('đăng ký thiết bị');
const t = (await call('/api/admin/push/test', {})).data;
assert.equal(t.ok, true); assert.equal(n(t), n(t0) + 1, 'phải gửi thêm tới đúng thiết bị vừa đăng ký'); ok('gửi thử tới thiết bị đã đăng ký');
assert.equal((await call('/api/admin/push/unsubscribe', { endpoint: subscription.endpoint })).data.ok, true);
const t2 = (await call('/api/admin/push/test', {})).data; assert.equal(n(t2), n(t0)); ok('huỷ đăng ký thì không gửi nữa');
console.log('OK thông báo đẩy');
