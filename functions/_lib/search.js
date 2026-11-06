import { normPhone, nameKey, maskPhone } from './util.js';
import { verifyPath } from './certs.js';

// Tìm trong dữ liệu của cổng: theo mã giấy, số điện thoại, hoặc họ tên (không dấu, khớp một phần).
export async function searchLocal(env, settings, q) {
  const code = q.toUpperCase().replace(/\s+/g, ''), phone = normPhone(q), key = nameKey(q);
  const base = 'SELECT * FROM certificates WHERE ';
  const seen = new Map();
  const add = rows => (rows.results || []).forEach(r => seen.set(r.id, r));
  if (/^[A-Z0-9][A-Z0-9_./-]{1,40}$/.test(code)) add(await env.DB.prepare(base + 'code=?').bind(code).all());
  if (phone) add(await env.DB.prepare(base + 'phone=? ORDER BY id DESC LIMIT 100').bind(phone).all());
  else if (key.length >= 3 && !/\d{5}/.test(key)) add(await env.DB.prepare(base + "name_key LIKE ? ORDER BY id DESC LIMIT 100").bind('%' + key + '%').all());
  return [...seen.values()].map(c => ({
    source: 'fts', sourceLabel: settings.site.owner, type: c.amount > 0 ? 'Giấy chứng nhận ủng hộ' : 'Giấy chứng nhận',
    code: c.code, name: c.name, org: c.org, phone: maskPhone(c.phone), project: c.campaign_name,
    amount: c.amount > 0 ? c.amount : null, amountText: c.amount > 0 ? '' : (c.amount_text || settings.cert.programText),
    date: c.issued_date, status: c.status === 'revoked' ? 'revoked' : 'valid', url: verifyPath(c),
    documents: c.file_url ? [{ label: 'Bản gốc', url: c.file_url }] : [],
  }));
}
