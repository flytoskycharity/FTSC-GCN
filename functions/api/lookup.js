import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { limited } from '../_lib/auth.js';
import { json, normPhone, nameKey } from '../_lib/util.js';
import { searchLocal } from '../_lib/search.js';
import { searchRemote } from '../_lib/federation.js';
import { syncBank } from '../_lib/bank.js';

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  await initializeDatabase(env);
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ error: 'Vui lòng nhập ít nhất 2 ký tự.' }, 400);
  if (!normPhone(q) && nameKey(q).length < 3 && !/^[A-Z0-9_./-]{2,}$/i.test(q)) return json({ error: 'Vui lòng nhập số điện thoại, mã giấy hoặc họ tên (từ 3 ký tự).' }, 400);
  if (await limited(env, request, 'lookup', 120, 36e5)) return json({ error: 'Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau ít phút.' }, 429);
  const settings = await loadSettings(env);
  const sync = syncBank(env, settings).catch(() => {});
  if (waitUntil) waitUntil(sync);
  const [local, remote] = await Promise.all([searchLocal(env, settings, q), searchRemote(env, settings, q)]);
  const results = [...local, ...remote.results].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return json({ q, results, sources: [{ source: 'fts', label: settings.site.owner, ok: true }, ...remote.status] });
}
