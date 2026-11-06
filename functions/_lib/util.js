// Hàm dùng chung cho toàn bộ cổng tra cứu.
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), n => n.toString(16).padStart(2, '0')).join('');

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });

export const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}

export const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
export const randomInt = max => crypto.getRandomValues(new Uint32Array(1))[0] % max;

// Bỏ dấu tiếng Việt để tìm kiếm.
export const noMark = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
export const nameKey = s => noMark(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Chuẩn hóa SĐT: 0935.939.446, 935939446, +84 935 939 446, 84935939446 đều về 0935939446.
export function normPhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('0084')) d = d.slice(4);
  else if (d.startsWith('84') && d.length >= 11) d = d.slice(2);
  if (d.length === 9 && !d.startsWith('0')) d = '0' + d;
  return /^0\d{9}$/.test(d) ? d : '';
}
export const maskPhone = p => (p && p.length >= 7 ? p.slice(0, 3) + '****' + p.slice(-3) : '');

export const slugify = s => nameKey(s).replace(/ /g, '-').slice(0, 80) || 'du-an';

// Ngày giờ theo múi giờ Việt Nam.
export const vnNow = () => new Date(Date.now() + 7 * 36e5);
export const vnToday = () => vnNow().toISOString().slice(0, 10);

// Nhận ngày ở nhiều dạng (dd/mm/yyyy, yyyy-mm-dd, ddmmyyyy, số serial của Google Sheets) và trả về yyyy-mm-dd.
export function toIsoDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}
export function fmtDate(v) {
  const iso = toIsoDate(v);
  if (!iso) return String(v || '');
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
// "2026-05-10T08:00" → "08:00 10/05/2026"
export function fmtDateTime(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return String(v);
  return (m[4] ? `${m[4]}:${m[5]} ` : '') + `${m[3]}/${m[2]}/${m[1]}`;
}

export const money = v => {
  if (typeof v === 'number') return Math.round(v);
  const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const vnd = n => (Number(n) || 0).toLocaleString('vi-VN') + ' VNĐ';

// Đọc chuỗi tiền ở ô bảng tính: trả về số nếu là tiền, ngược lại giữ chữ (chương trình không quy ra tiền).
export function amountOf(v) {
  if (v === null || v === undefined || String(v).trim() === '') return { amount: null, text: '' };
  if (typeof v === 'number') return { amount: Math.round(v), text: '' };
  const t = String(v).trim();
  if (/^[\d\s.,]+(?:\s*(?:đ|vnđ|vnd|₫|dong|đồng))?$/i.test(t)) return { amount: money(t), text: '' };
  return { amount: null, text: t };
}

// Mã giấy: giữ nguyên chữ có dấu (Đ, Ấ…), số, khoảng trắng và - _ . / ( ) &; viết hoa, gộp khoảng trắng.
export const normCode = s => String(s ?? '').normalize('NFC').trim().toLocaleUpperCase('vi').replace(/\s+/g, ' ').replace(/\s*([/()-])\s*/g, '$1');
export const validCode = c => /^[\p{L}\p{N}][\p{L}\p{N} _.\/()&-]{0,79}$/u.test(c);
// Đường dẫn xác thực: mã có thể chứa "/", mã hóa từng đoạn.
export const codePath = c => String(c).split('/').map(encodeURIComponent).join('/');

// Quy đổi số tiền thành số đơn vị của dự án (VD: 500.000đ ÷ 50.000đ = 10 cây).
export const unitsOf = (amount, c) => c && Number(c.unit_price) > 0 && c.unit_name && Number(amount) >= Number(c.unit_price)
  ? `${Math.floor(Number(amount) / Number(c.unit_price)).toLocaleString('vi-VN')} ${c.unit_name}` : '';
export const unitNote = c => c && Number(c.unit_price) > 0 && c.unit_name ? `${Number(c.unit_price).toLocaleString('vi-VN')}đ = 1 ${c.unit_name}` : '';

export const clip = (v, n) => String(v ?? '').trim().slice(0, n);
