import { raisedOf } from './db.js';

// Dự án công khai (không gồm bản nháp và dự án ẩn), kèm số tiền đã nhận.
export async function publicCampaigns(env) {
  const { results } = await env.DB.prepare("SELECT * FROM campaigns WHERE status IN ('open','closed') ORDER BY sort DESC, id DESC").all();
  return Promise.all((results || []).map(async c => ({ ...c, raised: await raisedOf(env, c) })));
}

export async function campaignBySlug(env, slug) {
  const c = await env.DB.prepare("SELECT * FROM campaigns WHERE slug=? AND status IN ('open','closed')").bind(String(slug).toLowerCase()).first();
  return c ? { ...c, raised: await raisedOf(env, c) } : null;
}

export const campaignById = (env, id) => env.DB.prepare('SELECT * FROM campaigns WHERE id=?').bind(Number(id) || 0).first();
