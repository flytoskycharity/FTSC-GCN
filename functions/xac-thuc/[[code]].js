import { pageRoute } from '../_lib/pages.js';
import { renderVerify } from '../_lib/render.js';
import { templateOf } from '../_lib/certs.js';
import { html, normCode, codePath } from '../_lib/util.js';
import { limited } from '../_lib/auth.js';
import { findCert, logVerify } from '../_lib/verify.js';

// /xac-thuc                → chuyển sang thẻ "Kiểm tra giấy" ở trang Tra cứu
// /xac-thuc?code=…&s=…     → chuyển sang /xac-thuc/<mã>?s=…
// /xac-thuc/<mã>?s=…       → mã có thể chứa "/" (VD: 48QĐ/ĐTN), nên nhận nhiều đoạn đường dẫn.
// Trạng thái: valid (đúng mã + đúng chữ ký), unsigned (đúng mã, không kèm chữ ký), invalid, revoked. Sai/thu hồi được ghi nhật ký.
const segs = p => (Array.isArray(p.code) ? p.code : p.code ? [p.code] : []).map(s => { try { return decodeURIComponent(s); } catch { return s; } });

export const onRequestGet = pageRoute(p => '/xac-thuc' + (segs(p).length ? '/' + codePath(segs(p).join('/')) : ''), async ({ request, env, params, x, settings }) => {
  const u = new URL(request.url);
  const code = normCode(segs(params).join('/')).slice(0, 80);
  if (!code) {
    const q = normCode(u.searchParams.get('code') || '').slice(0, 80);
    if (!q) return Response.redirect(`${u.origin}/tra-cuu?tab=kiem-tra`, 302);
    const s = (u.searchParams.get('s') || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
    return Response.redirect(`${u.origin}/xac-thuc/${codePath(q)}${s ? '?s=' + s : ''}`, 302);
  }
  const s = (u.searchParams.get('s') || '').trim().toUpperCase();
  if (env.DB && await limited(env, request, 'verify', 300, 36e5)) return html('<p>Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau.</p>', 429);
  const { c, state } = env.DB ? await findCert(env, code, s) : { c: null, state: 'invalid' };
  if (env.DB && (state === 'invalid' || state === 'revoked')) {
    await logVerify(env, request, { kind: 'url', verdict: state, code, qr: u.pathname + u.search, detail: c ? (state === 'revoked' ? 'Mở giấy đã thu hồi' : 'Mã có thật nhưng mã xác thực sai') : 'Mã không có trong hệ thống' }).catch(() => {});
  }
  const tpl = c && !c.doc_file && (state === 'valid' || state === 'unsigned') && (!c.file_url || c.template_id) ? await templateOf(env, c) : null;
  return html(renderVerify(x, state === 'invalid' ? null : c, state, tpl), state === 'invalid' ? 404 : 200, { 'X-Robots-Tag': 'noindex' });
});
