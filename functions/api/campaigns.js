import { initializeDatabase } from '../_lib/db.js';
import { publicCampaigns } from '../_lib/campaigns.js';
import { json } from '../_lib/util.js';

// Danh sách dự án công khai (dùng cho website khác nhúng nếu cần).
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ campaigns: [] });
  await initializeDatabase(env);
  const list = await publicCampaigns(env);
  return json({ campaigns: list.map(c => ({ slug: c.slug, title: c.title, kind: c.kind, status: c.status, start: c.start_at, end: c.end_at, memo: c.memo_prefix, goal: c.goal, raised: c.raised, summary: c.summary, cover: c.cover })) }, 200, { 'Access-Control-Allow-Origin': '*' });
}
