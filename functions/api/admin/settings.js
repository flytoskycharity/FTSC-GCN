import { adminApi, log } from '../../_lib/auth.js';
import { loadSettings, saveSettings } from '../../_lib/db.js';
import { json, readJson } from '../../_lib/util.js';
import defaults from '../../_lib/defaults.js';

// Giữ đúng cấu trúc của bản mặc định; bỏ khóa lạ, ép kiểu đơn giản.
function shape(v, base) {
  if (Array.isArray(base)) return Array.isArray(v) ? v.slice(0, 50).map(x => base.length && typeof base[0] === 'object' ? shape(x, base[0]) : (typeof base[0] === 'number' ? Number(x) || 0 : String(x ?? '').slice(0, 2000))) : base;
  if (base && typeof base === 'object') { const o = {}; for (const k of Object.keys(base)) o[k] = shape(v?.[k], base[k]); return o; }
  if (typeof base === 'boolean') return v === undefined ? base : !!v;
  if (typeof base === 'number') return v === undefined || v === '' ? base : Number(v) || 0;
  return v === undefined || v === null ? base : String(v).slice(0, 4000);
}

export const onRequestGet = adminApi('view', async ({ env }) => json({
  settings: await loadSettings(env), defaults,
  env: { DB: !!env.DB, MEDIA: !!env.MEDIA, ADMIN_PASSWORD: !!env.ADMIN_PASSWORD, ADMIN_SESSION_SECRET: !!env.ADMIN_SESSION_SECRET, CERT_SECRET: !!env.CERT_SECRET, FEDERATION_KEY: !!env.FEDERATION_KEY, SYNC_KEY: !!env.SYNC_KEY },
}));

export const onRequestPost = adminApi('super', async ({ request, env, me }) => {
  const b = await readJson(request) || {};
  const next = shape(b.settings || {}, defaults);
  if (next.site.url && !/^https:\/\//.test(next.site.url)) return json({ error: 'Địa chỉ website phải bắt đầu bằng https://' }, 400);
  for (const k of Object.keys(next.sources)) if (next.sources[k].url && !/^https:\/\//.test(next.sources[k].url)) return json({ error: 'Địa chỉ hệ thống liên thông phải bắt đầu bằng https://' }, 400);
  for (const k of ['primary', 'primaryDark', 'accent', 'paper', 'tint', 'ink']) if (!/^#[0-9a-f]{6}$/i.test(next.theme[k])) next.theme[k] = defaults.theme[k];
  for (const k of ['signature', 'stamp']) if (next.cert[k] && !/^\/(media|brand)\/[a-z0-9/_.-]+$/i.test(next.cert[k])) next.cert[k] = '';
  await saveSettings(env, next);
  await log(env, me, 'cập nhật cài đặt');
  return json({ ok: true, settings: next });
});
