import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { limited } from '../_lib/auth.js';
import { json, normPhone } from '../_lib/util.js';
import { searchLocal, nameQueryOk } from '../_lib/search.js';
import { searchRemote } from '../_lib/federation.js';
import { syncBank } from '../_lib/bank.js';

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  await initializeDatabase(env);
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ error: 'Vui lòng nhập ít nhất 2 ký tự.' }, 400);
  if (!normPhone(q) && !nameQueryOk(q) && !/^[A-Z0-9_./-]{2,}$/i.test(q)) return json({ error: 'Vui lòng nhập số điện thoại, mã giấy hoặc họ và tên đầy đủ (ít nhất 2 từ, ví dụ: Nguyễn An).' }, 400);
  // Chống vét dữ liệu: tối đa 15 lượt/10 phút và 60 lượt/giờ cho mỗi địa chỉ IP.
  if (await limited(env, request, 'lookup10m', 15, 6e5) || await limited(env, request, 'lookup', 60, 36e5)) return json({ error: 'Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau ít phút.' }, 429);
  const settings = await loadSettings(env);
  const sync = syncBank(env, settings).catch(() => {});
  if (waitUntil) waitUntil(sync);
  // Chỉ hỏi các hệ thống liên thông khi là SĐT, họ tên đầy đủ hoặc mã có chữ số – không chuyển chuỗi ngắn có thể bị dùng để vét dữ liệu.
  const remoteOk = !!normPhone(q) || nameQueryOk(q) || /\d/.test(q);
  const [local, remote] = await Promise.all([searchLocal(env, settings, q), remoteOk ? searchRemote(env, settings, q) : { results: [], status: [] }]);
  const results = [...local, ...remote.results].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return json({ q, results, sources: [{ source: 'fts', label: settings.site.owner, ok: true }, ...remote.status] });
}
