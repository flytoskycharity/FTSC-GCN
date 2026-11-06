import { pageRoute } from '../_lib/pages.js';
import { renderVerifyForm } from '../_lib/render.js';

// /xac-thuc?code=...&s=... chuyển sang /xac-thuc/<mã>?s=...
export const onRequestGet = pageRoute('/xac-thuc', ({ request, x }) => {
  const u = new URL(request.url), code = (u.searchParams.get('code') || '').trim().toUpperCase().slice(0, 60);
  if (code) {
    const s = (u.searchParams.get('s') || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
    return Response.redirect(`${u.origin}/xac-thuc/${encodeURIComponent(code)}${s ? '?s=' + s : ''}`, 302);
  }
  return renderVerifyForm(x);
});
