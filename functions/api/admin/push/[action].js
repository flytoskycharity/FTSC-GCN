// /api/admin/push/<key|subscribe|unsubscribe|test> – bật/tắt thông báo đẩy trên thiết bị của cán bộ quản trị.
import { adminApi } from '../../../_lib/auth.js';
import { json, readJson } from '../../../_lib/util.js';
import { vapidPublicKey, saveSubscription, removeSubscription, sendPush } from '../../../_lib/fts-push.js';
import { PUSH_SUBJECT, PUSH_ICON } from '../../../_lib/push-notify.js';

export const onRequestGet = adminApi('view', async ({ env, params }) => {
  if (params.action !== 'key') return json({ error: 'Không tìm thấy' }, 404);
  return json({ publicKey: await vapidPublicKey(env.DB) });
});

export const onRequestPost = adminApi('view', async ({ env, request, params, me }) => {
  const b = await readJson(request) || {};
  if (params.action === 'subscribe') {
    if (!String(b.subscription?.endpoint || '').startsWith('https://')) return json({ error: 'Thiết bị đăng ký không hợp lệ.' }, 400);
    try { await saveSubscription(env.DB, b.subscription, { audience: 'admin', userRef: String(me.id), ua: request.headers.get('user-agent') }); }
    catch { return json({ error: 'Thiết bị đăng ký không hợp lệ.' }, 400); }
    return json({ ok: true });
  }
  if (params.action === 'unsubscribe') { await removeSubscription(env.DB, b.endpoint); return json({ ok: true }); }
  if (params.action === 'test') {
    const r = await sendPush(env.DB, { audience: 'admin', userRef: String(me.id) }, { title: 'Thông báo thử – Tra cứu Giấy chứng nhận', body: 'Thiết bị này đã nhận được thông báo của Cổng tra cứu Giấy chứng nhận.', url: '/admin/', ...PUSH_ICON }, { subject: PUSH_SUBJECT });
    return json({ ok: true, ...r });
  }
  return json({ error: 'Không tìm thấy' }, 404);
});
