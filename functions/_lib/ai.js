// Cloudflare Workers AI (gói miễn phí 10.000 neuron/ngày, dùng chung cả tài khoản Cloudflare).
// Chỉ dùng để HỖ TRỢ: đọc mã/họ tên in trên giấy và ghi chú khác biệt. Kết luận thật/giả không dựa vào AI.
// Cần gắn binding Workers AI tên `AI` cho project Pages; chưa gắn thì các tính năng AI tự tắt.
import { limited } from './auth.js';

export const AI_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

export const aiReady = env => !!(env.AI && typeof env.AI.run === 'function');
export const imageOk = s => typeof s === 'string' && s.length < 2.8e6 && DATA_URL.test(s);

// Giới hạn: mỗi IP 20 lượt/giờ; toàn hệ thống AI_DAILY_LIMIT lượt/ngày (mặc định 120) để không vượt gói miễn phí.
export async function aiLimited(env, request) {
  if (await limited(env, request, 'ai', 20, 36e5)) return 'Bạn dùng AI quá nhiều lần. Vui lòng thử lại sau.';
  const all = { headers: { get: () => 'all' } };
  if (await limited(env, all, 'aiday', Number(env.AI_DAILY_LIMIT) || 120, 864e5)) return 'AI đã hết lượt miễn phí hôm nay.';
  return '';
}

// Gọi mô hình đọc ảnh, trả về đối tượng JSON nằm trong câu trả lời (hoặc null).
export async function askVision(env, prompt, image, max = 300) {
  const r = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] }],
    max_tokens: max, temperature: 0,
  });
  const out = r?.response;
  if (out && typeof out === 'object') return out;
  const m = String(out || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
