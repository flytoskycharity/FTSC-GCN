// Kiểm tra tệp PDF người dùng tải lên ở thẻ "Kiểm tra giấy": chữ ký số + đối chiếu với tệp gốc đã lưu.
import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { limited, sameOrigin } from '../_lib/auth.js';
import { json } from '../_lib/util.js';
import { verifyPdf, sha256Hex } from '../_lib/pdfsig.js';
import { verifyPath } from '../_lib/certs.js';
import { logVerify } from '../_lib/verify.js';
import { docKindLabel } from '../_lib/docs.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  await initializeDatabase(env);
  if (await limited(env, request, 'pdfcheck', 40, 36e5)) return json({ error: 'Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau.' }, 429);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length || buf.length > 15e6) return json({ error: 'Tệp PDF tối đa 15 MB.' }, 413);
  const settings = await loadSettings(env);
  const r = await verifyPdf(buf, settings.cert.signerMatch);
  const hash = await sha256Hex(buf);
  const c = await env.DB.prepare('SELECT code,sig,name,campaign_name,status,doc_kind FROM certificates WHERE doc_hash=?').bind(hash).first();
  const match = c ? { code: c.code, name: c.name, project: c.campaign_name, kind: docKindLabel(c), revoked: c.status === 'revoked', url: verifyPath(c) } : null;
  // Có chữ ký nhưng sai, hoặc chữ ký đúng nhưng không phải người ký của Fly To Sky và không phải tệp gốc → ghi nhật ký kèm tệp.
  const suspicious = r.signatures.length && (!r.ok || (!match && r.signerMatch === false));
  if (suspicious) await logVerify(env, request, { kind: 'upload', verdict: r.ok ? 'foreign' : 'invalid', detail: 'PDF ký số: ' + r.summary + (r.signatures[0]?.signer?.name ? ' Người ký: ' + r.signatures[0].signer.name : ''), image: null, file: buf }).catch(() => {});
  return json({ ...r, match });
}
