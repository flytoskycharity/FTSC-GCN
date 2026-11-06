import { pageRoute } from '../_lib/pages.js';
import { renderVerify } from '../_lib/render.js';
import { templateOf } from '../_lib/certs.js';
import { equal, html } from '../_lib/util.js';
import { limited } from '../_lib/auth.js';

// Trạng thái: valid (đúng mã + đúng chữ ký), unsigned (đúng mã, không kèm chữ ký), invalid, revoked.
export const onRequestGet = pageRoute(p => '/xac-thuc/' + encodeURIComponent(p.code), async ({ request, env, params, x }) => {
  const code = decodeURIComponent(String(params.code)).trim().toUpperCase().slice(0, 60);
  const s = (new URL(request.url).searchParams.get('s') || '').trim().toUpperCase();
  if (env.DB && await limited(env, request, 'verify', 300, 36e5)) return html('<p>Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau.</p>', 429);
  const c = env.DB ? await env.DB.prepare('SELECT * FROM certificates WHERE code=?').bind(code).first() : null;
  let state = 'invalid';
  if (c) state = c.status === 'revoked' ? 'revoked' : !s ? 'unsigned' : equal(s, c.sig) ? 'valid' : 'invalid';
  const tpl = c && (state === 'valid' || state === 'unsigned') && (!c.file_url || c.template_id) ? await templateOf(env, c) : null;
  const out = renderVerify(x, state === 'invalid' ? null : c, state, tpl);
  return html(out, state === 'invalid' ? 404 : 200, { 'X-Robots-Tag': 'noindex' });
});
