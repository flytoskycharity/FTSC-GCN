// AI nhận xét thêm (tham khảo) khi thuật toán so ảnh thấy chỗ khác hoặc chưa so chắc được.
// Ảnh gửi lên là một ảnh ghép: phía trên là ảnh người dùng chụp (đã trải phẳng), phía dưới là bản gốc.
import { initializeDatabase } from '../_lib/db.js';
import { sameOrigin } from '../_lib/auth.js';
import { json, readJson, clip } from '../_lib/util.js';
import { aiReady, aiLimited, askVision, imageOk } from '../_lib/ai.js';

const PROMPT = `Ảnh này ghép hai tờ giấy: NỬA TRÊN là ảnh người dùng chụp, NỬA DƯỚI là bản gốc lưu trên hệ thống.
Chỉ so CHỮ IN trên hai tờ: họ tên, nội dung, ngày tháng, mã giấy, tên người ký. Không nhận xét chữ ký tay và con dấu.
Bỏ qua khác biệt do ánh sáng, độ nghiêng, độ mờ của ảnh chụp. Chỉ nêu khác biệt bạn đọc rõ được ở CẢ HAI tờ; chữ nào đọc không chắc thì bỏ qua, không đoán.
Trả lời bằng MỘT đối tượng JSON, viết tiếng Việt, không thêm chữ nào khác:
{"same": true nếu nội dung hai tờ giống nhau, false nếu có chỗ khác,
 "differences": ["mỗi khác biệt một câu ngắn, ví dụ: Họ tên trên ảnh chụp là X, bản gốc là Y"]}`;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  if (!aiReady(env)) return json({ off: true });
  await initializeDatabase(env);
  const b = await readJson(request) || {};
  if (!imageOk(b.image)) return json({ error: 'Ảnh không hợp lệ.' }, 400);
  const lim = await aiLimited(env, request);
  if (lim) return json({ off: true, error: lim });
  try {
    const r = await askVision(env, PROMPT, b.image, 400);
    if (!r) return json({ off: true, error: 'AI chưa đưa ra nhận xét rõ ràng.' });
    const differences = (Array.isArray(r.differences) ? r.differences : []).map(d => clip(d, 300)).filter(Boolean).slice(0, 8);
    return json({ same: r.same === true && !differences.length, differences });
  } catch { return json({ off: true, error: 'AI tạm thời không phản hồi.' }); }
}
