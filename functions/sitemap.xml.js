// Sơ đồ trang cho Google/Bing: các trang công khai + từng dự án kêu gọi (đang mở hoặc đã kết thúc).
// Không đưa /xac-thuc/, /admin/, /api/ (riêng tư, đã chặn trong robots.txt).
import { initializeDatabase, FUND_SLUG } from './_lib/db.js';

const SITE = 'https://certificates.flytoskycharity.vn';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export async function onRequestGet({ env }) {
  const urls = [['/', ''], ['/tra-cuu', ''], ['/du-an', ''], ['/ung-ho', ''], ['/ung-ho/hien-vat', ''], ['/sao-ke', '']];
  if (env.DB) {
    try {
      await initializeDatabase(env);
      const { results } = await env.DB.prepare("SELECT slug, updated_at FROM campaigns WHERE status IN ('open','closed') AND slug<>? ORDER BY sort DESC, id DESC").bind(FUND_SLUG).all();
      for (const c of results || []) urls.push(['/du-an/' + encodeURIComponent(c.slug), c.updated_at]);
    } catch { /* lỗi dữ liệu vẫn trả về các trang cố định */ }
  }
  const body = urls.map(([u, t]) => `<url><loc>${esc(SITE + u)}</loc>${/^\d{4}-\d{2}-\d{2}/.test(t || '') ? `<lastmod>${String(t).slice(0, 10)}</lastmod>` : ''}</url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
