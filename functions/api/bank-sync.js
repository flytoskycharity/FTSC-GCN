// Dịch vụ hẹn giờ (cron) gọi /api/bank-sync?key=SYNC_KEY để đối soát sao kê định kỳ.
import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { syncBank } from '../_lib/bank.js';
import { syncKhuyendoc } from '../_lib/external.js';
import { json, equal } from '../_lib/util.js';

export async function onRequest({ request, env }) {
  const key = new URL(request.url).searchParams.get('key') || request.headers.get('x-sync-key') || '';
  if (!env.SYNC_KEY || !equal(key, env.SYNC_KEY)) return json({ error: 'Unauthorized' }, 401);
  await initializeDatabase(env);
  const settings = await loadSettings(env);
  await syncKhuyendoc(env, settings).catch(() => {});
  try { return json(await syncBank(env, settings, { force: true })); }
  catch (e) { return json({ ok: false, error: e.message }, 502); }
}
