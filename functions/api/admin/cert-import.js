// Nhập trực tiếp giấy đã ký ngoài hệ thống: chỉ quản trị viên có quyền chỉnh sửa.
// Kiểm tra tệp trước, lưu R2 và hồ sơ D1 cùng một quy trình; thất bại thì dọn dữ liệu mới.
import { adminApi, log, randomHex } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/db.js';
import { json, clip, toIsoDate, vnToday, amountOf, unitsInput } from '../../_lib/util.js';
import { campaignById } from '../../_lib/campaigns.js';
import { issueCertificate, verifyPath } from '../../_lib/certs.js';
import { verifyPdf, sha256Hex } from '../../_lib/pdfsig.js';
import { DOC_KINDS, DOC_TYPES } from '../../_lib/docs.js';

const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const LIMIT = 15e6;

export const onRequestPost = adminApi('edit', async ({ request, env, me }) => {
  if (!env.MEDIA) return json({ error: 'Chưa gắn kho lưu trữ R2 (binding MEDIA).' }, 503);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: 'Dữ liệu không hợp lệ.' }, 400);

  const type = String(form.get('type') || '');
  let kind = String(form.get('kind') || '');
  if (!DOC_TYPES[type]) return json({ error: 'Chọn bản scan ký tay hoặc PDF có chữ ký số.' }, 400);
  if (!DOC_KINDS[kind]) return json({ error: 'Chọn loại giấy.' }, 400);
  if (kind === 'khac') {
    const label = clip(form.get('kindLabel'), 80);
    if (!label) return json({ error: 'Vui lòng nhập tên loại giấy.' }, 400);
    kind = 'khac:' + label;
  }

  const rawRecord = String(form.get('record') || '');
  if (!rawRecord || rawRecord.length > 10000) return json({ error: 'Thông tin giấy không hợp lệ.' }, 400);
  let record;
  try { record = JSON.parse(rawRecord); } catch { return json({ error: 'Không đọc được thông tin giấy.' }, 400); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return json({ error: 'Thông tin giấy không hợp lệ.' }, 400);
  if (!clip(record.name, 160)) return json({ error: 'Vui lòng nhập họ tên người nhận.' }, 400);
  if (record.issued_date && !toIsoDate(record.issued_date)) return json({ error: 'Ngày cấp không hợp lệ.' }, 400);

  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) return json({ error: 'Vui lòng chọn tệp giấy đã ký.' }, 400);
  if (file.size > LIMIT) return json({ error: 'Tệp tối đa 15 MB.' }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
  const mime = isPdf ? 'application/pdf' : file.type;
  if (!MIME[mime] || (!isPdf && !/^image\//.test(file.type))) return json({ error: 'Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc PDF.' }, 400);

  const settings = await loadSettings(env);
  let sig = null;
  if (type === 'digital') {
    if (!isPdf) return json({ error: 'Giấy ký số phải là tệp PDF.' }, 400);
    sig = await verifyPdf(bytes, settings.cert.signerMatch);
    if (!sig.signatures.length) return json({ error: 'PDF không có chữ ký số; nếu ký tay, hãy chọn bản scan.', sig }, 400);
    if (!sig.ok) return json({ error: 'Chữ ký số không hợp lệ: ' + sig.summary, sig }, 400);
    if (!sig.signatures.every(s => s.trustedRoot)) return json({ error: 'Chứng thư không thuộc chuỗi tin cậy quốc gia đã biết. Hãy đối chiếu tại NEAC.', sig }, 400);
  }

  const campaign = record.campaign_id ? await campaignById(env, record.campaign_id) : null;
  if (Number(record.campaign_id) > 0 && !campaign) return json({ error: 'Không tìm thấy dự án đã chọn.' }, 400);
  const amt = amountOf(record.amount);
  const hash = await sha256Hex(bytes);
  const key = 'private/docs/' + new Date().toISOString().slice(0, 10) + '-' + randomHex(8) + '.' + MIME[mime];
  let cert = null;
  let stored = false;
  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
    stored = true;
    cert = await issueCertificate(env, settings, {
      campaign, name: record.name, org: record.org, phone: record.phone,
      amount: amt.amount, amount_text: clip(record.amount_text, 200) || amt.text,
      issued_date: record.issued_date || vnToday(), code: record.code,
      units: unitsInput(record.units, campaign), note: record.note,
      source: 'signed', created_by: me.username,
    });
    await env.DB.prepare('UPDATE certificates SET doc_kind=?,doc_type=?,doc_file=?,doc_mime=?,doc_hash=?,doc_sig=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(kind, type, key, mime, hash, sig ? JSON.stringify({ ...sig, checkedAt: new Date().toISOString() }) : '', cert.id).run();
  } catch (error) {
    // Không để giấy trống khi lưu R2/D1 bị lỗi; giấy cũ không bị đụng tới.
    if (cert?.id) await env.DB.prepare('DELETE FROM certificates WHERE id=? AND doc_file=?').bind(cert.id, '').run().catch(() => {});
    if (stored) await env.MEDIA.delete(key).catch(() => {});
    throw error;
  }
  await log(env, me, 'nhập giấy đã ký ' + cert.code + ' (' + DOC_TYPES[type] + ')').catch(() => {});
  return json({
    ok: true,
    created: { id: cert.id, code: cert.code, url: verifyPath(cert) },
    sig,
    warn: sig && sig.signerMatch === false ? 'Lưu ý: người ký không khớp đơn vị đã cấu hình. Hãy kiểm tra lại tại NEAC.' : '',
  });
});