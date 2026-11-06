// Tra cứu liên thông: hỏi song song Khuyendoc (GCN ủng hộ, Giấy xác nhận tài trợ) và FTS Workspace (GCN tình nguyện viên).
// Các hệ thống trả về cùng một định dạng (xem README, mục "Liên thông"), xác thực bằng khóa FEDERATION_KEY.
import { clip } from './util.js';

const PATHS = { khuyendoc: '/api/federation/lookup', workspace: '/api/public/federation-certificates' };
// Chỉ nhận địa chỉ https; FEDERATION_ALLOW_HTTP chỉ dùng khi chạy thử trên máy.
const httpsUrl = (u, http) => (http ? /^https?:\/\/[^\s/]+/ : /^https:\/\/[^\s/]+/).test(String(u || '')) ? String(u).replace(/\/$/, '') : '';

function clean(r, src, base, http) {
  const abs = u => {
    const s = String(u || '');
    if ((http ? /^https?:\/\// : /^https:\/\//).test(s)) return s;
    return s.startsWith('/') && base ? base + s : '';
  };
  return {
    source: src.key, sourceLabel: src.label,
    type: clip(r.type, 120) || 'Giấy chứng nhận',
    code: clip(r.code, 60), name: clip(r.name, 160), org: clip(r.org, 200), phone: clip(r.phone, 20),
    project: clip(r.project, 200),
    amount: Number.isFinite(Number(r.amount)) && Number(r.amount) > 0 ? Math.round(Number(r.amount)) : null,
    amountText: clip(r.amountText, 200), date: clip(r.date, 20),
    status: r.status === 'revoked' ? 'revoked' : 'valid',
    url: abs(r.url),
    documents: (Array.isArray(r.documents) ? r.documents : []).slice(0, 4).map(d => ({ label: clip(d.label, 80), url: abs(d.url), status: clip(d.status, 20) })).filter(d => d.label),
  };
}

async function ask(src, q, key, http) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(src.base + PATHS[src.key] + '?q=' + encodeURIComponent(q), {
      headers: { Accept: 'application/json', 'x-fts-federation-key': key, 'User-Agent': 'FTS-Certificates-Portal' },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    return { ok: true, results: (Array.isArray(data.results) ? data.results : []).slice(0, 50).map(x => clean(x, src, src.base, http)) };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'quá thời gian' : e.message, results: [] };
  } finally { clearTimeout(timer); }
}

export async function searchRemote(env, settings, q) {
  const key = env.FEDERATION_KEY || '', http = !!env.FEDERATION_ALLOW_HTTP;
  const list = Object.entries(settings.sources || {})
    .map(([k, v]) => ({ key: k, label: v.label || k, base: httpsUrl(v.url, http), enabled: v.enabled !== false }))
    .filter(s => s.enabled && s.base && PATHS[s.key]);
  if (!key || !list.length) return { results: [], status: [] };
  const answers = await Promise.all(list.map(s => ask(s, q, key, http)));
  return {
    results: answers.flatMap(a => a.results),
    status: list.map((s, i) => ({ source: s.key, label: s.label, ok: answers[i].ok, error: answers[i].error || '' })),
  };
}
