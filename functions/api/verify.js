// GET  /api/verify?qr=<nội dung QR>  → kiểm tra mã QR đọc được từ giấy tải lên.
// POST /api/verify                    → ghi nhật ký khi giấy tải lên sai/không xác nhận được (kèm ảnh).
import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { limited, sameOrigin } from '../_lib/auth.js';
import { json, readJson, clip } from '../_lib/util.js';
import { findCert, renderData, logVerify } from '../_lib/verify.js';
import { searchRemote } from '../_lib/federation.js';

const host = u => { try { return new URL(u).host; } catch { return ''; } };

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  await initializeDatabase(env);
  if (await limited(env, request, 'check', 120, 36e5)) return json({ error: 'Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau.' }, 429);
  const settings = await loadSettings(env), origin = new URL(request.url).origin;
  const qr = (new URL(request.url).searchParams.get('qr') || '').trim().slice(0, 500);
  let u;
  try { u = new URL(qr); } catch { return json({ state: 'foreign', reason: 'Mã QR không phải đường dẫn xác thực của Fly To Sky.' }); }
  const own = [host(settings.site.url), new URL(request.url).host, 'certificates.flytoskycharity.vn'];
  const kd = host(settings.sources?.khuyendoc?.url), ws = host(settings.sources?.workspace?.url);
  const m = u.pathname.match(/^\/xac-thuc\/(.+)$/);

  if (own.includes(u.host) && m) {
    const code = decodeURIComponent(m[1]), s = u.searchParams.get('s') || '';
    const { c, state } = await findCert(env, code, s);
    if (!c || state === 'invalid') return json({ state: 'invalid', code });
    if (state === 'revoked') return json({ state: 'revoked', code: c.code, reason: c.revoke_reason });
    return json({ state: state === 'valid' ? 'valid' : 'unsigned', source: 'fts', code: c.code, url: u.pathname + u.search, render: c.doc_file ? null : await renderData(env, settings, c, state === 'valid') });
  }
  // Giấy của Khuyendoc: hỏi qua kênh liên thông, đối chiếu mã xác thực trong đường dẫn.
  if (kd && u.host === kd && m) {
    const code = decodeURIComponent(m[1]), s = (u.searchParams.get('s') || '').toUpperCase();
    const r = await searchRemote(env, { ...settings, sources: { khuyendoc: settings.sources.khuyendoc } }, code);
    const hit = r.results.find(x => x.code.toUpperCase() === code.toUpperCase());
    if (!r.status[0]?.ok) return json({ state: 'remote', source: 'khuyendoc', url: u.href, label: settings.sources.khuyendoc.label });
    if (!hit || (s && !hit.url.toUpperCase().includes('S=' + s))) return json({ state: 'invalid', code });
    return json({ state: hit.status === 'revoked' ? 'revoked' : 'remote-valid', source: 'khuyendoc', label: settings.sources.khuyendoc.label, info: hit, url: hit.url });
  }
  // Giấy của FTS Workspace: dùng trang xác minh công khai sẵn có.
  if (ws && u.host === ws && /^\/xac-minh\/[a-f0-9]{32}\/?$/.test(u.pathname)) {
    const token = u.pathname.split('/')[2];
    try {
      const r = await fetch(`${u.origin}/api/public/certificate?token=${token}`, { headers: { Accept: 'application/json' } });
      if (r.status === 404) return json({ state: 'invalid', code: token });
      const d = await r.json();
      if (!r.ok) throw new Error();
      return json({ state: d.status === 'revoked' ? 'revoked' : 'remote-valid', source: 'workspace', label: settings.sources.workspace.label, url: u.href,
        info: { code: d.number, name: d.name, project: d.title, type: d.kind, date: d.date, amountText: d.reason }, reason: d.revokedReason || '' });
    } catch { return json({ state: 'remote', source: 'workspace', url: u.href, label: settings.sources.workspace.label }); }
  }
  return json({ state: 'foreign', reason: `Mã QR trỏ tới ${u.host}, không phải hệ thống của Fly To Sky.` });
}

const VERDICTS = ['no_qr', 'invalid', 'revoked', 'foreign', 'mismatch', 'unsure', 'reported'];
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  await initializeDatabase(env);
  if (await limited(env, request, 'checklog', 30, 36e5)) return json({ ok: true });
  const b = await readJson(request) || {};
  if (!VERDICTS.includes(b.verdict)) return json({ error: 'Dữ liệu không hợp lệ' }, 400);
  let image = null;
  const m = String(b.image || '').match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (m && m[1].length < 4.2e6) image = Uint8Array.from(atob(m[1]), ch => ch.charCodeAt(0));
  await logVerify(env, request, { kind: 'upload', verdict: b.verdict, code: clip(b.code, 80), qr: clip(b.qr, 500), detail: clip(b.detail, 2000), image });
  return json({ ok: true });
}
