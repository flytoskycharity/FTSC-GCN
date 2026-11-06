import { pageRoute } from '../_lib/pages.js';
import { renderVerify, renderVerifyForm } from '../_lib/render.js';
import { templateOf } from '../_lib/certs.js';
import { equal, html, normCode, codePath } from '../_lib/util.js';
import { limited } from '../_lib/auth.js';

// /xac-thuc                → ô nhập mã
// /xac-thuc?code=…&s=…     → chuyển sang /xac-thuc/<mã>?s=…
// /xac-thuc/<mã>?s=…       → mã có thể chứa "/" (VD: 48QĐ/ĐTN), nên nhận nhiều đoạn đường dẫn.
// Trạng thái: valid (đúng mã + đúng chữ ký), unsigned (đúng mã, không kèm chữ ký), invalid, revoked.
const segs = p => (Array.isArray(p.code) ? p.code : p.code ? [p.code] : []).map(s => { try { return decodeURIComponent(s); } catch { return s; } });

export const onRequestGet = pageRoute(p => '/xac-thuc' + (segs(p).length ? '/' + codePath(segs(p).join('/')) : ''), async ({ request, env, params, x }) => {
  const u = new URL(request.url);
  const code = normCode(segs(params).join('/')).slice(0, 80);
  if (!code) {
    const q = normCode(u.searchParams.get('code') || '').slice(0, 80);
    if (q) {
      const s = (u.searchParams.get('s') || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
      return Response.redirect(`${u.origin}/xac-thuc/${codePath(q)}${s ? '?s=' + s : ''}`, 302);
    }
    return renderVerifyForm(x);
  }
  const s = (u.searchParams.get('s') || '').trim().toUpperCase();
  if (env.DB && await limited(env, request, 'verify', 300, 36e5)) return html('<p>Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau.</p>', 429);
  const c = env.DB ? await env.DB.prepare('SELECT * FROM certificates WHERE code=?').bind(code).first() : null;
  let state = 'invalid';
  if (c) state = c.status === 'revoked' ? 'revoked' : !s ? 'unsigned' : equal(s, c.sig) ? 'valid' : 'invalid';
  const tpl = c && (state === 'valid' || state === 'unsigned') && (!c.file_url || c.template_id) ? await templateOf(env, c) : null;
  return html(renderVerify(x, state === 'invalid' ? null : c, state, tpl), state === 'invalid' ? 404 : 200, { 'X-Robots-Tag': 'noindex' });
});
