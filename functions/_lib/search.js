import { normPhone, nameKey, maskPhone, normCode, validCode } from './util.js';
import { verifyPath } from './certs.js';

// Tìm trong dữ liệu của cổng: theo mã giấy, số điện thoại, hoặc họ tên (không dấu, khớp một phần).
export async function searchLocal(env, settings, q) {
  const code = normCode(q), phone = normPhone(q), key = nameKey(q);
  const base = 'SELECT c.*, d.wants_confirm, d.confirm_file FROM certificates c LEFT JOIN donations d ON d.id=c.donation_id AND c.donation_id>0 WHERE ';
  const seen = new Map();
  const add = rows => (rows.results || []).forEach(r => seen.set(r.id, r));
  // Mã trùng ở hệ thống cũ được tách thành MÃ, MÃ-2, MÃ-3…: tìm cả nhóm.
  if (validCode(code) && code.length >= 2) add(await env.DB.prepare(base + "(c.code=? OR c.code LIKE ? ESCAPE '\\') LIMIT 50").bind(code, code.replace(/[%_\\]/g, '\\$&') + '-%').all());
  if (phone) add(await env.DB.prepare(base + 'c.phone=? ORDER BY c.id DESC LIMIT 100').bind(phone).all());
  else if (key.length >= 3 && !/\d{5}/.test(key)) add(await env.DB.prepare(base + "c.name_key LIKE ? ORDER BY c.id DESC LIMIT 100").bind('%' + key + '%').all());
  return [...seen.values()].map(c => ({
    source: 'fts', sourceLabel: settings.site.owner, type: c.amount > 0 ? 'Giấy chứng nhận ủng hộ' : 'Giấy chứng nhận',
    code: c.code, name: c.name, org: c.org, phone: maskPhone(c.phone), project: c.campaign_name,
    amount: c.amount > 0 ? c.amount : null, amountText: c.amount > 0 ? '' : (c.amount_text || settings.cert.programText),
    date: c.issued_date, status: c.status === 'revoked' ? 'revoked' : 'valid', url: verifyPath(c),
    documents: [
      ...(c.file_url ? [{ label: 'Bản gốc', url: c.file_url }] : []),
      ...(c.wants_confirm ? [{ label: 'Giấy xác nhận tài trợ', url: c.confirm_file || '', status: c.confirm_file ? '' : 'đang xử lý (7–10 ngày)' }] : []),
    ],
  }));
}
