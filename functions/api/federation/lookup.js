// Cho các hệ thống khác trong Fly To Sky (Khuyendoc, Workspace…) tra cứu giấy của cổng này. Cần khóa FEDERATION_KEY.
import { initializeDatabase, loadSettings } from '../../_lib/db.js';
import { json, equal } from '../../_lib/util.js';
import { searchLocal } from '../../_lib/search.js';

export async function onRequestGet({ request, env }) {
  const key = request.headers.get('x-fts-federation-key') || '';
  if (!env.FEDERATION_KEY || !equal(key, env.FEDERATION_KEY)) return json({ error: 'Unauthorized' }, 401);
  await initializeDatabase(env);
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const settings = await loadSettings(env);
  const origin = String(settings.site.url || new URL(request.url).origin).replace(/\/$/, '');
  const results = (await searchLocal(env, settings, q)).map(r => ({ ...r, url: origin + r.url }));
  return json({ source: 'fts', results });
}
