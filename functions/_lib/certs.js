import { unitsOf, normCode, validCode, codePath, hmac, randomInt, nameKey, normPhone, maskPhone, vnToday, fmtDate, vnd, toIsoDate } from './util.js';

// Các ô thông tin đặt được lên mẫu. x, y tính theo % chiều rộng/cao; size theo % chiều rộng; w (ảnh) theo % chiều rộng.
import { DEFAULT_BG, LEGACY_BG } from './default-bg.js';
export const FIELD_KEYS = {
  name: 'Họ tên', org: 'Chức vụ, đơn vị', amount: 'Số tiền / nội dung ghi nhận', units: 'Số lượng quy đổi (chỉ số, VD: 10)', project: 'Dự án, chương trình',
  address: 'Địa chỉ', items: 'Danh sách hiện vật', phone: 'Số điện thoại', code: 'Mã giấy chứng nhận', date: 'Ngày cấp', qr: 'Mã QR xác thực',
  signature: 'Chữ ký', stamp: 'Con dấu', signer: 'Người ký', text: 'Chữ tự nhập',
};
export const IMAGE_KEYS = ['qr', 'signature', 'stamp'];

export const DEFAULT_TEMPLATE = {
  id: 0, campaign_id: 0, name: 'Mẫu mặc định', background: DEFAULT_BG, width: 1600, height: 1131, min_amount: 0, enabled: 1,
  fields: [
    { key: 'name', x: 50, y: 44, size: 4.2, color: '#05228b', align: 'center', bold: true, font: 'serif' },
    { key: 'org', x: 50, y: 51.5, size: 1.8, color: '#0e1b3d', align: 'center', bold: true },
    { key: 'amount', x: 50, y: 59.5, size: 2.4, color: '#05228b', align: 'center', bold: true },
    { key: 'project', x: 50, y: 65.5, size: 1.7, color: '#0e1b3d', align: 'center', bold: true },
    { key: 'code', x: 10, y: 81, size: 1.3, color: '#0e1b3d', align: 'left', bold: true, prefix: 'Mã GCN: ' },
    { key: 'date', x: 10, y: 84.5, size: 1.3, color: '#0e1b3d', align: 'left', bold: true, prefix: 'Ngày cấp: ' },
    { key: 'phone', x: 10, y: 88, size: 1.3, color: '#0e1b3d', align: 'left', bold: true, prefix: 'SĐT: ' },
    { key: 'qr', x: 43, y: 76, w: 10 },
    { key: 'stamp', x: 66, y: 74, w: 11 },
    { key: 'signature', x: 74, y: 77, w: 13 },
    { key: 'signer', x: 76, y: 90, size: 1.5, color: '#05228b', align: 'center', bold: true },
  ],
};

export const certSecret = env => env.CERT_SECRET || env.ADMIN_SESSION_SECRET || '';
export const certSig = async (env, code) => (await hmac(certSecret(env), 'gcn:' + normCode(code))).slice(0, 12).toUpperCase();

export const verifyPath = c => `/xac-thuc/${codePath(c.code)}?s=${c.sig}`;
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
  return { ...row, background: !row.background || row.background === LEGACY_BG ? DEFAULT_BG : row.background, fields: Array.isArray(fields) && fields.length ? fields : DEFAULT_TEMPLATE.fields };
}

// Một dự án có nhiều mẫu: lấy mẫu đang bật có mức tiền tối thiểu cao nhất mà số tiền đạt tới;
// nhiều mẫu cùng mức thì chọn ngẫu nhiên. Không có mẫu của dự án thì dùng mẫu chung, cuối cùng là mẫu mặc định.
// Mẫu quy đổi hay mẫu ghi tiền. amount_rule: 'units' | 'money' | '' (tự động: mẫu có ô "Số lượng quy đổi" là mẫu quy đổi).
export const tplRule = t => t?.amount_rule || (/"key"\s*:\s*"units"/.test(t?.fields || '') ? 'units' : 'money');
// Dự án có quy đổi (VD 50.000đ = 1 cây): số tiền chia hết → mẫu quy đổi ra cây; số tiền lẻ → mẫu ghi bằng tiền.
export const wantRule = (amount, campaign) => {
  const up = Number(campaign?.unit_price) || 0;
  return up > 0 && Number(amount) > 0 ? (Number(amount) % up === 0 ? 'units' : 'money') : '';
};

// gift: 'money' | 'items' – mẫu dành riêng cho loại đóng góp được ưu tiên, mẫu "mọi loại" (gift_kind rỗng) dùng chung.
export async function pickTemplate(env, campaignId, amount, gift = 'money') {
  const camp = Number(campaignId) ? await env.DB.prepare('SELECT unit_price,ext_ref FROM campaigns WHERE id=?').bind(Number(campaignId)).first() : null;
  const want = gift === 'money' ? wantRule(amount, camp) : '';
  const linked = camp?.ext_ref?.startsWith('khuyendoc:');
  for (const cid of linked ? [-1] : [Number(campaignId) || 0, 0]) {
    const { results: all } = await env.DB.prepare('SELECT * FROM templates WHERE campaign_id=? AND enabled=1').bind(cid).all();
    const own = (all || []).filter(t => t.gift_kind === gift);
    let results = own.length ? own : (all || []).filter(t => !t.gift_kind);
    // Có cả mẫu quy đổi lẫn mẫu ghi tiền thì chọn đúng loại theo số tiền chia hết hay lẻ.
    if (want) { const fit = results.filter(t => tplRule(t) === want); if (fit.length) results = fit; }
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
  if (linked) throw new Error('Chưa có phôi Tủ sách phù hợp. Hãy kiểm tra loại phôi và đồng bộ lại.');
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
  let code = normCode(data.code);
  if (code) {
    if (!validCode(code)) throw new Error('Mã giấy tối đa 80 ký tự, gồm chữ, số, khoảng trắng và các ký tự - _ . / ( ) &');
    if (await env.DB.prepare('SELECT 1 x FROM certificates WHERE code=?').bind(code).first()) throw new Error('Mã giấy ' + code + ' đã tồn tại.');
  } else {
    code = await newCode(env, campaign?.cert_prefix || settings.cert.prefix, issued);
  }
  const amount = data.amount === null || data.amount === undefined || data.amount === '' ? null : Math.max(0, Math.round(Number(data.amount) || 0));
  const templateId = data.template_id !== undefined && data.template_id !== '' && data.template_id !== null && Number(data.template_id) >= 0 && data.template_id !== 'auto'
    ? Number(data.template_id) : await pickTemplate(env, campaign?.id || 0, amount || 0, data.gift === 'items' ? 'items' : 'money');
  if (campaign?.ext_ref?.startsWith('khuyendoc:') || templateId) {
    const t = await env.DB.prepare('SELECT campaign_id,enabled,gift_kind FROM templates WHERE id=?').bind(templateId).first();
    const linked = campaign?.ext_ref?.startsWith('khuyendoc:');
    if (!t || !t.enabled || (linked ? t.campaign_id !== -1 : t.campaign_id && t.campaign_id !== campaign?.id) || (t.gift_kind && t.gift_kind !== (data.gift || 'money'))) throw new Error('Mẫu giấy không phù hợp với dự án hoặc hình thức ủng hộ.');
  }
  const name = String(data.name || '').trim().slice(0, 160) || settings.donate.anonymousName;
  const sig = await certSig(env, code);
  let units = data.units !== undefined ? String(data.units || '').slice(0, 80) : unitsOf(amount, campaign);
  // Số tiền lẻ (không chia hết đơn giá) in bằng mẫu ghi tiền thì không quy đổi ra cây.
  if (data.units === undefined && wantRule(amount, campaign) === 'money' && templateId) {
    const t = await env.DB.prepare('SELECT fields, amount_rule FROM templates WHERE id=?').bind(templateId).first();
    if (t && tplRule(t) === 'money') units = '';
  }
  const insert = env.DB.prepare(`INSERT INTO certificates(code,sig,campaign_id,campaign_name,name,name_key,phone,org,amount,amount_text,issued_date,template_id,source,file_url,donation_id,note,created_by,units,gift,address,receipt_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    code, sig, campaign?.id || 0, String(data.campaign_name || campaign?.title || '').slice(0, 200), name, nameKey(name),
    normPhone(data.phone) || '', String(data.org || '').trim().slice(0, 200), amount, String(data.amount_text || '').slice(0, data.gift === 'items' ? 4000 : 200), issued,
    templateId, data.source || 'manual', String(data.file_url || '').slice(0, 500), Number(data.donation_id) || 0, String(data.note || '').slice(0, 500), data.created_by || '', units, data.gift === 'items' ? 'items' : '', String(data.address || '').slice(0,250), data.finalizeReceipt ? data.donation_id : null,
  );
  const r = data.finalizeReceipt ? (await env.DB.batch([insert,data.finalizeReceipt(code)]))[0] : await insert.run();
  return await env.DB.prepare('SELECT * FROM certificates WHERE id=?').bind(r.meta.last_row_id).first();
}

// Giá trị hiển thị trên giấy / trang xác thực.
export function certValues(settings, c) {
  const up = v => String(v || '').toLocaleUpperCase('vi');
  const amountLine = c.amount !== null && c.amount !== undefined && c.amount !== '' && Number(c.amount) > 0
    ? vnd(c.amount) : (c.amount_text || settings.cert.programText);
  // Trên giấy chỉ in con số (VD: 10), chữ đơn vị đã có sẵn trên phôi; trang xác thực ghi đầy đủ "(10 cây)".
  const unitNum = String(c.units || '').match(/^[\d.,]+/)?.[0] || '';
  return {
    address: c.address || '', items: c.gift === 'items' ? c.amount_text : '', name: up(c.name), org: c.org || '', amount: amountLine, project: c.campaign_name || '',
    phone: settings.cert.maskPhone === false ? (c.phone || '') : maskPhone(c.phone || ''),
    code: c.code, date: fmtDate(c.issued_date), signer: settings.cert.signerName || '', units: unitNum,
    amountFull: amountLine + (c.units && amountLine !== (c.amount_text || settings.cert.programText) ? ` (${c.units})` : ''),
  };
}

// Giấy có ảnh ghép (nền + chữ thành một ảnh duy nhất) hay không: giấy có tệp gốc riêng thì không cần.
export const needsImage = c => c && !c.doc_file && (!c.file_url || c.template_id);
// Đánh dấu cần ghép lại ảnh giấy (sau khi sửa thông tin, đổi mẫu, đổi chữ ký…). where: điều kiện SQL.
export const staleImages = (env, where = '1=1', args = []) => env.DB.prepare(`UPDATE certificates SET img_ok=0 WHERE ${where}`).bind(...args).run();
export const certImagePath = c => `/api/cert-image?code=${encodeURIComponent(c.code)}&s=${c.sig}`;

// Lịch sử điều chỉnh thông tin, dạng dễ đọc: [{at, by, reason, changes: [{label, from, to}]}].
// Mỗi mục lưu thông tin CŨ; thông tin MỚI là bản cũ của lần sửa kế tiếp hoặc thông tin hiện tại.
const HIST_LABELS = { name: 'Họ tên', org: 'Chức vụ, đơn vị', address: 'Địa chỉ', items: 'Danh sách hiện vật', phone: 'Số điện thoại', amount: 'Số tiền', amount_text: 'Nội dung ghi nhận', units: 'Số quy đổi', issued_date: 'Ngày cấp', campaign_name: 'Dự án, chương trình' };
export function historyOf(c) {
  let list = [];
  try { list = JSON.parse(c?.history || '[]'); } catch { list = []; }
  if (!Array.isArray(list)) return [];
  const show = (k, v) => k === 'amount' ? (Number(v) > 0 ? vnd(v) : '—') : k === 'issued_date' ? fmtDate(v) : k === 'phone' ? (v ? maskPhone(v) : '—') : (String(v ?? '').trim() || '—');
  return list.map((h, i) => {
    const old = h.old || {}, next = list[i + 1]?.old || c;
    const changes = Object.keys(HIST_LABELS).filter(k => k in old && String(old[k] ?? '') !== String(next[k] ?? ''))
      .map(k => ({ label: HIST_LABELS[k], from: show(k, old[k]), to: show(k, next[k]) }));
    return { at: h.at || '', by: h.by || '', reason: h.reason || '', changes };
  }).filter(h => h.changes.length);
}

// Xóa hẳn một giấy: dọn ảnh đã ghép, đề xuất điều chỉnh, liên kết với lượt ủng hộ/giao dịch.
export async function deleteCertificate(env, cert) {
  if (cert.cert_image && env.MEDIA) await env.MEDIA.delete(cert.cert_image).catch(() => {});
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cert_requests WHERE cert_id=?').bind(cert.id),
    env.DB.prepare('UPDATE donations SET cert_id=0 WHERE cert_id=?').bind(cert.id),
    env.DB.prepare('UPDATE bank_tx SET cert_id=0 WHERE cert_id=?').bind(cert.id),
    env.DB.prepare('DELETE FROM certificates WHERE id=?').bind(cert.id),
  ]);
}
