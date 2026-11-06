import { hmac, randomInt, nameKey, normPhone, maskPhone, vnToday, fmtDate, vnd, toIsoDate } from './util.js';

// Các ô thông tin đặt được lên mẫu. x, y tính theo % chiều rộng/cao; size theo % chiều rộng; w (ảnh) theo % chiều rộng.
export const FIELD_KEYS = {
  name: 'Họ tên', org: 'Chức vụ, đơn vị', amount: 'Số tiền / nội dung ghi nhận', project: 'Dự án, chương trình',
  phone: 'Số điện thoại', code: 'Mã giấy chứng nhận', date: 'Ngày cấp', qr: 'Mã QR xác thực',
  signature: 'Chữ ký', stamp: 'Con dấu', signer: 'Người ký', text: 'Chữ tự nhập',
};
export const IMAGE_KEYS = ['qr', 'signature', 'stamp'];

export const DEFAULT_TEMPLATE = {
  id: 0, campaign_id: 0, name: 'Mẫu mặc định', background: '/brand/cert-default.svg', width: 1600, height: 1131, min_amount: 0, enabled: 1,
  fields: [
    { key: 'name', x: 50, y: 44, size: 4.2, color: '#006379', align: 'center', bold: true, font: 'serif' },
    { key: 'org', x: 50, y: 51.5, size: 1.8, color: '#14333c', align: 'center', bold: true },
    { key: 'amount', x: 50, y: 59.5, size: 2.4, color: '#d9661b', align: 'center', bold: true },
    { key: 'project', x: 50, y: 65.5, size: 1.7, color: '#14333c', align: 'center', bold: true },
    { key: 'code', x: 10, y: 81, size: 1.3, color: '#14333c', align: 'left', bold: true, prefix: 'Mã GCN: ' },
    { key: 'date', x: 10, y: 84.5, size: 1.3, color: '#14333c', align: 'left', bold: true, prefix: 'Ngày cấp: ' },
    { key: 'phone', x: 10, y: 88, size: 1.3, color: '#14333c', align: 'left', bold: true, prefix: 'SĐT: ' },
    { key: 'qr', x: 43, y: 76, w: 10 },
    { key: 'stamp', x: 66, y: 74, w: 11 },
    { key: 'signature', x: 74, y: 77, w: 13 },
    { key: 'signer', x: 76, y: 90, size: 1.5, color: '#006379', align: 'center', bold: true },
  ],
};

export const certSecret = env => env.CERT_SECRET || env.ADMIN_SESSION_SECRET || '';
export const certSig = async (env, code) => (await hmac(certSecret(env), 'gcn:' + String(code).toUpperCase())).slice(0, 12).toUpperCase();

export const verifyPath = c => `/xac-thuc/${encodeURIComponent(c.code)}?s=${c.sig}`;
export const verifyUrl = (settings, c) => String(settings.site.url || '').replace(/\/$/, '') + verifyPath(c);

const cleanPrefix = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'FTS';

// Mã gồm tiền tố, năm và 7 số ngẫu nhiên (không theo thứ tự, khó đoán), không trùng.
export async function newCode(env, prefix, isoDate) {
  const year = (isoDate || vnToday()).slice(0, 4);
  for (let i = 0; i < 25; i++) {
    const code = `${cleanPrefix(prefix)}-${year}-${1000000 + randomInt(9000000)}`;
    if (!await env.DB.prepare('SELECT 1 x FROM certificates WHERE code=?').bind(code).first()) return code;
  }
  throw new Error('Không tạo được mã giấy chứng nhận, vui lòng thử lại.');
}

export function parseTemplate(row) {
  if (!row) return { ...DEFAULT_TEMPLATE };
  let fields = [];
  try { fields = JSON.parse(row.fields || '[]'); } catch { fields = []; }
  return { ...row, fields: Array.isArray(fields) && fields.length ? fields : DEFAULT_TEMPLATE.fields };
}

// Một dự án có nhiều mẫu: lấy mẫu đang bật có mức tiền tối thiểu cao nhất mà số tiền đạt tới;
// nhiều mẫu cùng mức thì chọn ngẫu nhiên. Không có mẫu của dự án thì dùng mẫu chung, cuối cùng là mẫu mặc định.
export async function pickTemplate(env, campaignId, amount) {
  for (const cid of [Number(campaignId) || 0, 0]) {
    const { results } = await env.DB.prepare('SELECT * FROM templates WHERE campaign_id=? AND enabled=1').bind(cid).all();
    const list = (results || []).filter(t => !amount || !t.min_amount || amount >= t.min_amount);
    const fallback = (results || []).filter(t => !t.min_amount);
    const pool = list.length ? list : fallback;
    if (pool.length) {
      const top = Math.max(...pool.map(t => t.min_amount || 0));
      const tier = pool.filter(t => (t.min_amount || 0) === top);
      return tier[randomInt(tier.length)].id;
    }
    if (!cid) break;
  }
  return 0;
}

export async function templateOf(env, cert) {
  if (cert.template_id) {
    const row = await env.DB.prepare('SELECT * FROM templates WHERE id=?').bind(cert.template_id).first();
    if (row) return parseTemplate(row);
  }
  return { ...DEFAULT_TEMPLATE };
}

// Cấp giấy mới. data: {campaign, name, phone, org, amount, amount_text, issued_date, template_id, source, file_url, code, donation_id, note, created_by}
export async function issueCertificate(env, settings, data) {
  const campaign = data.campaign || null;
  const issued = toIsoDate(data.issued_date) || vnToday();
  let code = String(data.code || '').trim().toUpperCase();
  if (code) {
    if (!/^[A-Z0-9][A-Z0-9_./-]{1,40}$/.test(code)) throw new Error('Mã giấy chỉ gồm chữ không dấu, số và các ký tự - _ . /');
    if (await env.DB.prepare('SELECT 1 x FROM certificates WHERE code=?').bind(code).first()) throw new Error('Mã giấy ' + code + ' đã tồn tại.');
  } else {
    code = await newCode(env, campaign?.cert_prefix || settings.cert.prefix, issued);
  }
  const amount = data.amount === null || data.amount === undefined || data.amount === '' ? null : Math.max(0, Math.round(Number(data.amount) || 0));
  const templateId = data.template_id !== undefined && data.template_id !== '' && data.template_id !== null && Number(data.template_id) >= 0 && data.template_id !== 'auto'
    ? Number(data.template_id) : await pickTemplate(env, campaign?.id || 0, amount || 0);
  const name = String(data.name || '').trim().slice(0, 160) || settings.donate.anonymousName;
  const sig = await certSig(env, code);
  const r = await env.DB.prepare(`INSERT INTO certificates(code,sig,campaign_id,campaign_name,name,name_key,phone,org,amount,amount_text,issued_date,template_id,source,file_url,donation_id,note,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    code, sig, campaign?.id || 0, String(data.campaign_name || campaign?.title || '').slice(0, 200), name, nameKey(name),
    normPhone(data.phone) || '', String(data.org || '').trim().slice(0, 200), amount, String(data.amount_text || '').slice(0, 200), issued,
    templateId, data.source || 'manual', String(data.file_url || '').slice(0, 500), Number(data.donation_id) || 0, String(data.note || '').slice(0, 500), data.created_by || '',
  ).run();
  return await env.DB.prepare('SELECT * FROM certificates WHERE id=?').bind(r.meta.last_row_id).first();
}

// Giá trị hiển thị trên giấy / trang xác thực.
export function certValues(settings, c) {
  const up = v => String(v || '').toLocaleUpperCase('vi');
  const amountLine = c.amount !== null && c.amount !== undefined && c.amount !== '' && Number(c.amount) > 0
    ? vnd(c.amount) : (c.amount_text || settings.cert.programText);
  return {
    name: up(c.name), org: c.org || '', amount: amountLine, project: c.campaign_name || '',
    phone: settings.cert.maskPhone === false ? (c.phone || '') : maskPhone(c.phone || ''),
    code: c.code, date: fmtDate(c.issued_date), signer: settings.cert.signerName || '',
  };
}
