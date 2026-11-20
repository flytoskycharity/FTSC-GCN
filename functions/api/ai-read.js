// AI đọc mã giấy và họ tên in trên ảnh chụp giấy không có mã QR, rồi tìm giấy tương ứng trên cổng này.
// Kết quả chỉ để tìm bản gốc; việc so sánh thật/giả làm ở trình duyệt bằng thuật toán so ảnh.
import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { sameOrigin } from '../_lib/auth.js';
import { json, readJson, clip, normCode, validCode, nameKey } from '../_lib/util.js';
import { searchLocal, nameQueryOk } from '../_lib/search.js';
import { aiReady, aiLimited, askVision, imageOk } from '../_lib/ai.js';

const PROMPT = `Đây là ảnh chụp một giấy khen hoặc giấy chứng nhận tiếng Việt.
Chỉ chép lại đúng chữ in trên giấy, không đoán. Trả lời bằng MỘT đối tượng JSON, không thêm chữ nào khác:
{"code": "mã giấy in trên giấy, thường đứng sau 'Mã GCN', 'Mã giấy' hoặc 'Số'; để trống nếu không thấy",
 "name": "họ và tên người được tặng/cấp giấy, bỏ danh xưng Anh/Chị/Ông/Bà/Em; để trống nếu không thấy",
 "title": "tên loại giấy, ví dụ GIẤY KHEN, GIẤY CHỨNG NHẬN",
 "date": "ngày cấp in trên giấy, dạng YYYY-MM-DD, để trống nếu không thấy"}`;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  if (!aiReady(env)) return json({ off: true });
  await initializeDatabase(env);
  const b = await readJson(request) || {};
  if (!imageOk(b.image)) return json({ error: 'Ảnh không hợp lệ.' }, 400);
  const lim = await aiLimited(env, request);
  if (lim) return json({ off: true, error: lim });
  let read;
  try { read = await askVision(env, PROMPT, b.image); } catch { return json({ off: true, error: 'AI tạm thời không phản hồi.' }); }
  const ai = { code: normCode(clip(read?.code, 80)), name: clip(read?.name, 120).replace(/^(anh|chị|chi|ông|ong|bà|ba|em)\s+/i, ''), title: clip(read?.title, 80), date: clip(read?.date, 10) };
  const settings = await loadSettings(env);
  let results = [], by = '';
  if (ai.code && validCode(ai.code)) {
    // Chỉ nhận kết quả trùng đúng mã, không lấy các mã "gần giống" để tránh so nhầm giấy.
    results = (await searchLocal(env, settings, ai.code)).filter(r => normCode(r.code) === ai.code || normCode(r.code).startsWith(ai.code + '-'));
    if (results.length) by = 'code';
  }
  if (!results.length && ai.name && nameQueryOk(ai.name)) {
    results = (await searchLocal(env, settings, ai.name)).filter(r => nameKey(r.name) === nameKey(ai.name));
    if (results.length) by = 'name';
  }
  return json({ ai, by, results });
}
