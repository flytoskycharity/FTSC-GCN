// Tự gia hạn phiên quản trị khi đang dùng, để PWA / máy tính không phải đăng nhập lại liên tục.
import { renewSession } from '../_lib/auth.js';

export async function onRequest({ request, env, next }) {
  const res = await next();
  try { return await renewSession(request, env, res); } catch { return res; }
}
