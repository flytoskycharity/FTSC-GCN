// Thông báo đẩy (Web Push) dùng chung cho các website Fly To Sky chạy trên Cloudflare (Workers / Pages Functions + D1).
// Không cần thư viện ngoài, không cần cài khoá trên Cloudflare: khoá VAPID tự sinh lần đầu và lưu trong D1.
// Chuẩn: RFC 8291 (mã hoá aes128gcm), RFC 8292 (VAPID). Tệp giống hệt nhau ở mọi repo — sửa một nơi rồi chép sang.
//
//   await vapidPublicKey(db)                         → khoá công khai (base64url) cho trình duyệt đăng ký
//   await saveSubscription(db, sub, {audience, userRef, ua})
//   await removeSubscription(db, endpoint)
//   await sendPush(db, {audience, userRef}, {title, body, url, tag}, {subject})  → {sent, removed, failed}
//
// audience: nhóm người nhận (VD 'admin'); userRef: mã người cụ thể (tuỳ chọn).
// subject: trang web của hệ thống (chuẩn VAPID cho phép URL thay cho email).

const DEFAULT_SUBJECT = 'https://flytoskycharity.vn';
const te = new TextEncoder();
const b64u = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (str) => { const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const concat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const now = () => new Date().toISOString();

let schemaReady = null;
export function ensurePushSchema(db) {
  schemaReady = schemaReady || db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS push_vapid (id INTEGER PRIMARY KEY CHECK (id = 1), public_key TEXT NOT NULL, private_jwk TEXT NOT NULL, created_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, audience TEXT NOT NULL DEFAULT 'admin', user_ref TEXT, ua TEXT, created_at TEXT NOT NULL, last_ok_at TEXT, fail_count INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_aud ON push_subscriptions(audience, user_ref)`),
  ]).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

let keyCache = null;
async function vapidKeys(db) {
  if (keyCache) return keyCache;
  await ensurePushSchema(db);
  let row = await db.prepare('SELECT public_key, private_jwk FROM push_vapid WHERE id = 1').first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
    await db.prepare('INSERT OR IGNORE INTO push_vapid (id, public_key, private_jwk, created_at) VALUES (1, ?, ?, ?)').bind(pub, jwk, now()).run();
    row = await db.prepare('SELECT public_key, private_jwk FROM push_vapid WHERE id = 1').first();
  }
  const privateKey = await crypto.subtle.importKey('jwk', JSON.parse(row.private_jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  keyCache = { publicKey: row.public_key, privateKey };
  return keyCache;
}

export async function vapidPublicKey(db) { return (await vapidKeys(db)).publicKey; }

const validSub = (s) => {
  try {
    return !!(s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 2048
      && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string' && unb64u(s.keys.p256dh).length === 65 && unb64u(s.keys.auth).length >= 16);
  } catch { return false; }
};

export async function saveSubscription(db, sub, { audience = 'admin', userRef = null, ua = '' } = {}) {
  if (!validSub(sub)) throw new Error('INVALID_SUBSCRIPTION');
  await ensurePushSchema(db);
  await db.prepare(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, audience, user_ref, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, audience = excluded.audience, user_ref = excluded.user_ref, ua = excluded.ua, fail_count = 0`)
    .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, audience, userRef, String(ua || '').slice(0, 200), now()).run();
}

export async function removeSubscription(db, endpoint) {
  await ensurePushSchema(db);
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(String(endpoint || '')).run();
}

export async function countSubscriptions(db, { audience = 'admin', userRef = null } = {}) {
  await ensurePushSchema(db);
  const r = userRef
    ? await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE audience = ? AND user_ref = ?').bind(audience, userRef).first()
    : await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE audience = ?').bind(audience).first();
  return r?.n || 0;
}

// RFC 8291: mã hoá nội dung cho một trình duyệt. (salt/asKeys chỉ truyền vào khi kiểm thử.)
export async function encryptPayload(p256dhB64, authB64, plaintext, { salt, asKeys } = {}) {
  const uaPublic = unb64u(p256dhB64), authSecret = unb64u(authB64);
  const as = asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const hkdf = async (saltB, ikm, info, bytes) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: saltB, info }, k, bytes * 8));
  };
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(s, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(s, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = typeof plaintext === 'string' ? te.encode(plaintext) : plaintext;
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(data, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(s, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// RFC 8292: thẻ xác thực VAPID cho máy chủ đẩy (Google / Mozilla / Apple).
export async function vapidAuthorization(db, endpoint, subject) {
  const { publicKey, privateKey } = await vapidKeys(db);
  const aud = new URL(endpoint).origin;
  const header = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject || DEFAULT_SUBJECT })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${publicKey}`;
}

async function pushOne(db, sub, message, subject, urgency) {
  const body = await encryptPayload(sub.p256dh, sub.auth, message);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidAuthorization(db, sub.endpoint, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: urgency },
    body,
  });
  return res.status;
}

/** Gửi tới mọi thiết bị của nhóm (và người) chỉ định. Thiết bị đã gỡ (404/410) tự xoá. Không ném lỗi. */
export async function sendPush(db, { audience = 'admin', userRef = null } = {}, { title, body = '', url = '/', tag = '', icon = '', badge = '' } = {}, { subject, urgency = 'high' } = {}) {
  const result = { sent: 0, removed: 0, failed: 0 };
  try {
    await ensurePushSchema(db);
    const q = userRef
      ? db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE audience = ? AND user_ref = ? AND fail_count < 20').bind(audience, userRef)
      : db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE audience = ? AND fail_count < 20').bind(audience);
    const { results = [] } = await q.all();
    const message = JSON.stringify({ title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 300), url, tag, icon, badge, ts: Date.now() });
    await Promise.all(results.slice(0, 200).map(async (sub) => {
      try {
        const status = await pushOne(db, sub, message, subject, urgency);
        if (status === 404 || status === 410) { await removeSubscription(db, sub.endpoint); result.removed++; }
        else if (status >= 200 && status < 300) { await db.prepare('UPDATE push_subscriptions SET last_ok_at = ?, fail_count = 0 WHERE endpoint = ?').bind(now(), sub.endpoint).run(); result.sent++; }
        else { await db.prepare('UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE endpoint = ?').bind(sub.endpoint).run(); result.failed++; }
      } catch { result.failed++; }
    }));
  } catch (e) { console.error('PUSH_SEND', String(e?.stack || e)); }
  return result;
}
