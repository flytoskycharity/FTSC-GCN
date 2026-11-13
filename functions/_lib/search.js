import { normPhone, nameKey, maskPhone, normCode, validCode } from './util.js';
import { verifyPath, historyOf } from './certs.js';
import { docKindLabel, DOC_TYPES } from './docs.js';

// Tra cứu theo tên phải có ít nhất 2 từ (họ + tên) để không thể "vét" toàn bộ dữ liệu bằng vài chữ cái.
export const NAME_LIMIT = 20;
export function nameQueryOk(q) {
  const key = nameKey(q);
  return key.length >= 5 && key.split(' ').filter(Boolean).length >= 2 && !/\d{5}/.test(key);
}

// Tìm trong dữ liệu của cổng: theo mã giấy, số điện thoại, hoặc họ tên đầy đủ (không dấu, tối thiểu 2 từ).
export async function searchLocal(env, settings, q) {
  const code = normCode(q), phone = normPhone(q), key = nameKey(q);
  const base = 'SELECT c.*, d.wants_confirm, d.confirm_file FROM certificates c LEFT JOIN donations d ON d.id=c.donation_id AND c.donation_id>0 WHERE ';
  const seen = new Map();
  const add = rows => (rows.results || []).forEach(r => seen.set(r.id, r));
  // Mã trùng ở hệ thống cũ được tách thành MÃ, MÃ-2, MÃ-3…: tìm cả nhóm.
  if (validCode(code) && code.length >= 2) add(await env.DB.prepare(base + "(c.code=? OR c.code LIKE ? ESCAPE '\\') LIMIT 50").bind(code, code.replace(/[%_\\]/g, '\\$&') + '-%').all());
  if (phone) add(await env.DB.prepare(base + 'c.phone=? ORDER BY c.id DESC LIMIT 100').bind(phone).all());
  // name_key chỉ gồm a-z, 0-9 và khoảng trắng nên không cần thoát ký tự LIKE. Khớp cả tên đầy đủ hoặc từ đầu một từ.
  else if (nameQueryOk(q)) add(await env.DB.prepare(base + "(c.name_key = ? OR c.name_key LIKE ? OR c.name_key LIKE ?) ORDER BY c.id DESC LIMIT " + NAME_LIMIT)
    .bind(key, key + '%', '% ' + key + '%').all());
  return [...seen.values()].map(c => ({
    source: 'fts', sourceLabel: settings.site.owner, type: c.doc_file ? docKindLabel(c) : c.amount > 0 ? 'Giấy chứng nhận ủng hộ' : 'Giấy chứng nhận',
    code: c.code, name: c.name, org: c.org, phone: maskPhone(c.phone), project: c.campaign_name,
    amount: c.amount > 0 ? c.amount : null, amountText: c.amount > 0 ? '' : (c.amount_text || settings.cert.programText),
    date: c.issued_date, status: c.status === 'revoked' ? 'revoked' : 'valid', url: verifyPath(c),
    adjusted: historyOf(c).map(h => ({ at: h.at, changes: h.changes })),
    documents: [
      ...(c.file_url ? [{ label: 'Bản gốc', url: c.file_url }] : []),
      ...(c.doc_file ? [{ label: docKindLabel(c) + ' (' + (c.doc_type === 'digital' ? 'PDF ký số' : 'bản scan ký tay') + ')', url: verifyPath(c) }] : []),
      ...(c.wants_confirm ? [{ label: 'Giấy xác nhận tài trợ', url: c.confirm_file || '', status: c.confirm_file ? '' : 'đang xử lý (7–10 ngày)' }] : []),
    ],
  }));
}
