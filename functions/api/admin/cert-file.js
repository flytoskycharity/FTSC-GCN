// Tải lên tệp giấy đã cấp ở nơi khác. Chỉ nhận 2 loại:
//  1. Bản scan (ảnh hoặc PDF) của giấy có chữ ký tay;
//  2. PDF có chữ ký số – hệ thống kiểm tra chữ ký ngay khi tải, chữ ký không hợp lệ thì từ chối.
import { adminApi, log, randomHex } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/db.js';
import { json, clip } from '../../_lib/util.js';
import { verifyPdf, sha256Hex } from '../../_lib/pdfsig.js';
import { DOC_KINDS, DOC_TYPES } from '../../_lib/docs.js';

const SCAN = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export const onRequestPost = adminApi('edit', async ({ request, env, me }) => {
  if (!env.MEDIA) return json({ error: 'Chưa gắn kho ảnh R2 (binding MEDIA).' }, 503);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: 'Dữ liệu không hợp lệ.' }, 400);
  const id = Number(form.get('id')) || 0, type = String(form.get('type') || ''), f = form.get('file');
  let kind = String(form.get('kind') || '');
  const c = await env.DB.prepare('SELECT * FROM certificates WHERE id=?').bind(id).first();
  if (!c) return json({ error: 'Không tìm thấy giấy chứng nhận.' }, 404);
  if (!DOC_TYPES[type]) return json({ error: 'Chọn hình thức: bản scan có chữ ký tay, hoặc PDF có chữ ký số.' }, 400);
  if (!DOC_KINDS[kind]) return json({ error: 'Chọn loại giấy.' }, 400);
  if (kind === 'khac') { const t = clip(form.get('kindLabel'), 80); if (!t) return json({ error: 'Nhập tên loại giấy.' }, 400); kind = 'khac:' + t; }
  if (!f || typeof f === 'string') return json({ error: 'Chưa chọn tệp.' }, 400);
  if (f.size > 15e6) return json({ error: 'Tệp tối đa 15 MB.' }, 413);
  const bytes = new Uint8Array(await f.arrayBuffer());
  const isPdf = String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
  const mime = isPdf ? 'application/pdf' : f.type;
  let sig = null;
  if (type === 'digital') {
    if (!isPdf) return json({ error: 'PDF có chữ ký số phải là tệp .pdf.' }, 400);
    sig = await verifyPdf(bytes, (await loadSettings(env)).cert.signerMatch);
    if (!sig.signatures.length) return json({ error: 'Tệp PDF này không có chữ ký số. Nếu là bản scan giấy ký tay, hãy chọn hình thức "Bản scan có chữ ký tay".' }, 400);
    if (!sig.ok) return json({ error: 'Chữ ký số không hợp lệ: ' + sig.summary, sig }, 400);
    if (!sig.signatures.every(s => s.trustedRoot)) return json({ error: 'Chứng thư số không thuộc chuỗi tin cậy của Trung tâm Chứng thực điện tử quốc gia (Root CA). Vui lòng kiểm tra tại neac.gov.vn.', sig }, 400);
  } else {
    if (!SCAN[mime]) return json({ error: 'Bản scan nhận ảnh JPG, PNG, WEBP hoặc tệp PDF.' }, 400);
    if (!isPdf && !/^image\//.test(f.type)) return json({ error: 'Tệp không hợp lệ.' }, 400);
  }
  const ext = SCAN[mime] || 'bin', key = `private/docs/${new Date().toISOString().slice(0, 10)}-${randomHex(8)}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
  if (c.doc_file) await env.MEDIA.delete(c.doc_file).catch(() => {});
  const hash = await sha256Hex(bytes);
  await env.DB.prepare('UPDATE certificates SET doc_kind=?, doc_type=?, doc_file=?, doc_mime=?, doc_hash=?, doc_sig=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(kind, type, key, mime, hash, sig ? JSON.stringify({ ...sig, checkedAt: new Date().toISOString() }) : '', id).run();
  await log(env, me, `tải ${DOC_TYPES[type].toLowerCase()} cho giấy ${c.code}`);
  return json({ ok: true, sig, warn: sig && sig.signerMatch === false ? 'Lưu ý: người ký không phải đơn vị đã cấu hình trong Cài đặt (Fly To Sky). Hãy kiểm tra lại.' : '' });
});

export const onRequestDelete = adminApi('edit', async ({ request, env, me }) => {
  const id = Number(new URL(request.url).searchParams.get('id')) || 0;
  const c = await env.DB.prepare('SELECT code, doc_file FROM certificates WHERE id=?').bind(id).first();
  if (!c) return json({ error: 'Không tìm thấy giấy chứng nhận.' }, 404);
  if (c.doc_file && env.MEDIA) await env.MEDIA.delete(c.doc_file).catch(() => {});
  await env.DB.prepare("UPDATE certificates SET doc_kind='', doc_type='', doc_file='', doc_mime='', doc_hash='', doc_sig='', img_ok=0 WHERE id=?").bind(id).run();
  await log(env, me, 'gỡ tệp giấy của ' + c.code);
  return json({ ok: true });
});
