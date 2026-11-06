import { raisedOf, FUND_SLUG } from './db.js';

const now = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 16);
export const isFund = c => c && c.slug === FUND_SLUG;
export const isOpen = c => c.status === 'open' && (!c.end_at || c.end_at >= now()) && (!c.start_at || c.start_at <= now());

// Dự án công khai (không gồm bản nháp, dự án ẩn và Quỹ chung), kèm số tiền đã nhận.
export async function publicCampaigns(env) {
  const { results } = await env.DB.prepare("SELECT * FROM campaigns WHERE status IN ('open','closed') AND slug<>? ORDER BY sort DESC, id DESC").bind(FUND_SLUG).all();
  return Promise.all((results || []).map(async c => ({ ...c, raised: await raisedOf(env, c) })));
}

// Nơi nhận ủng hộ trực tuyến: Quỹ chung trước, rồi các dự án quyên góp tiền đang mở.
export async function donationTargets(env) {
  const { results } = await env.DB.prepare("SELECT * FROM campaigns WHERE status='open' AND kind='money' AND accept_donations=1 AND memo_prefix<>'' ORDER BY (slug=?) DESC, sort DESC, id DESC").bind(FUND_SLUG).all();
  return (results || []).filter(isOpen);
}

export async function campaignBySlug(env, slug) {
  const c = await env.DB.prepare("SELECT * FROM campaigns WHERE slug=? AND status IN ('open','closed')").bind(String(slug).toLowerCase()).first();
  return c ? { ...c, raised: await raisedOf(env, c) } : null;
}

export const campaignById = (env, id) => env.DB.prepare('SELECT * FROM campaigns WHERE id=?').bind(Number(id) || 0).first();

// Quyền lợi: mỗi dòng "mức tối thiểu | nội dung". Gộp quyền lợi chung (Cài đặt) và quyền lợi riêng của dự án.
export function benefitsOf(settings, c) {
  const parse = t => String(t || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^([\d.,\s]+)\s*\|\s*(.+)$/);
    return m ? { min: Number(m[1].replace(/\D/g, '')) || 0, text: m[2].trim() } : { min: 0, text: l };
  });
  return [...parse((settings.donate.benefits || []).join('\n')), ...parse(c?.benefits)].sort((a, b) => a.min - b.min);
}
