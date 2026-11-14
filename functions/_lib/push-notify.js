// Thông báo đẩy cho cán bộ quản trị Cổng tra cứu Giấy chứng nhận – chạy nền, không làm chậm người dùng.
import { sendPush } from './fts-push.js';

export const PUSH_SUBJECT = 'https://certificates.flytoskycharity.vn';
export const PUSH_ICON = { icon: '/brand/app/icon-192.png', badge: '/brand/app/favicon-96.png' };

/** Gửi tới mọi thiết bị admin đã bật thông báo. Có waitUntil thì chạy nền, không thì trả về promise. */
export function pushStaff(env, waitUntil, { title, body = '', url = '/admin/', tag = '' }) {
  if (!env?.DB) return;
  const job = sendPush(env.DB, { audience: 'admin' }, { title, body, url, tag, ...PUSH_ICON }, { subject: PUSH_SUBJECT });
  if (waitUntil) waitUntil(job); else return job;
}
