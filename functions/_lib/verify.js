// Xác thực giấy: dùng chung cho trang /xac-thuc, kiểm tra giấy tải lên và nhật ký sai phạm.
import { equal, normCode, codePath, randomHex, clip } from './util.js';
import { certValues, templateOf, FIELD_KEYS, IMAGE_KEYS } from './certs.js';
import { qrSvg } from './qr.js';

export async function findCert(env, code, s) {
  const c = await env.DB.prepare('SELECT * FROM certificates WHERE code=?').bind(normCode(code)).first();
  let state = 'invalid';
  if (c) state = c.status === 'revoked' ? 'revoked' : !s ? 'unsigned' : equal(String(s).toUpperCase(), c.sig) ? 'valid' : 'invalid';
  return { c, state };
}

// Dữ liệu để trình duyệt dựng lại giấy gốc (canvas) và so với giấy tải lên.
export async function renderData(env, settings, origin, c) {
  const tpl = await templateOf(env, c), v = certValues(settings, c);
  const fields = (tpl.fields || []).filter(f => f.visible !== false);
  return {
    tpl: { background: tpl.background, width: tpl.width, height: tpl.height, fields },
    values: v,
    images: { qr: 'data:image/svg+xml;utf8,' + encodeURIComponent(qrSvg(`${origin}/xac-thuc/${codePath(c.code)}?s=${c.sig}`, { dark: '#000', level: 'M', border: 2 })), signature: settings.cert.signature || '', stamp: settings.cert.stamp || '' },
    fonts: [settings.theme.fontHeading, settings.theme.fontBody], file: c.code,
    // Các dòng chữ để so từng dòng (bỏ ảnh QR, chữ ký, con dấu).
    rows: fields.filter(f => !IMAGE_KEYS.includes(f.key)).map(f => {
      const text = f.key === 'text' ? (f.text || '') : ((f.prefix || '') + (v[f.key] || ''));
      return { key: f.key, label: FIELD_KEYS[f.key], text, len: text.length, x: f.x, y: f.y, size: f.size, align: f.align || 'center' };
    }).filter(r => r.text),
  };
}

// Ghi nhật ký xác thực sai/lỗi. Ảnh (nếu có) lưu ở vùng riêng tư của R2, chỉ admin xem được.
export async function logVerify(env, request, { kind, verdict, code = '', qr = '', detail = '', image = null, file = null }) {
  let key = '';
  if ((image || file) && env.MEDIA) {
    key = `private/verify/${new Date().toISOString().slice(0, 10)}-${randomHex(8)}.${file ? 'pdf' : 'jpg'}`;
    await env.MEDIA.put(key, file || image, { httpMetadata: { contentType: file ? 'application/pdf' : 'image/jpeg' } }).catch(() => { key = ''; });
  }
  await env.DB.prepare('INSERT INTO verify_logs(kind,verdict,code,qr,detail,image,ip,ua) VALUES(?,?,?,?,?,?,?,?)')
    .bind(kind, verdict, clip(code, 80), clip(qr, 500), clip(detail, 2000), key, request.headers.get('cf-connecting-ip') || '', clip(request.headers.get('user-agent'), 300)).run();
}
