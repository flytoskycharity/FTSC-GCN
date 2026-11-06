// Bản tin Bền vững 360°: đọc RSS của benvung360.com.vn, lưu đệm 30 phút trong D1 để trang chủ luôn nhanh.
import { getState, setState } from './db.js';

const TTL = 30 * 60e3;
const dec = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').trim();
const tag = (x, t) => dec((x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);

export function parseRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const x = m[1];
    return {
      title: tag(x, 'title'), link: tag(x, 'link'), date: tag(x, 'pubDate'), category: tag(x, 'category'),
      desc: tag(x, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 220),
      image: (x.match(/<enclosure[^>]*url="([^"]+)"/) || [])[1] || '',
    };
  }).filter(i => i.title && /^https:\/\//.test(i.link));
}

async function refresh(env, url) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' }, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = parseRss(await r.text()).slice(0, 12);
    await setState(env, 'news_cache', { at: Date.now(), url, items });
    return items;
  } finally { clearTimeout(t); }
}

export async function getNews(env, settings, waitUntil) {
  const n = settings.news || {};
  if (!n.enabled || !/^https:\/\//.test(n.rss || '') || !env.DB) return [];
  const st = await getState(env, 'news_cache');
  const fresh = st.url === n.rss && st.at && Date.now() - st.at < TTL;
  if (st.url === n.rss && st.items?.length) {
    if (!fresh) { const p = refresh(env, n.rss).catch(() => {}); if (waitUntil) waitUntil(p); }
    return st.items.slice(0, n.count || 6);
  }
  try { return (await refresh(env, n.rss)).slice(0, n.count || 6); } catch { return []; }
}

// Gắn mã theo dõi để Bền vững 360° thấy lượt đọc đến từ cổng này.
export const tracked = link => link + (link.includes('?') ? '&' : '?') + 'utm_source=certificates.flytoskycharity.vn&utm_medium=referral&utm_campaign=ban-tin-trang-chu';
