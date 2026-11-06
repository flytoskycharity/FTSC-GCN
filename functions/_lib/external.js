// Dự án liên kết từ Tủ sách Bồ Câu Trắng (Khuyendoc): hiện trên cổng này với đầy đủ thông tin, dự toán, quyền lợi,
// nhưng nhận ủng hộ và cấp GCN tại Khuyendoc (cú pháp TUSACH) để không cấp trùng giấy. GCN vẫn tra cứu được ở đây qua liên thông.
import { getState, setState } from './db.js';
import { slugify } from './util.js';

const TTL = 30 * 60e3;
const STATUS = { open: 'open', funded: 'closed', in_progress: 'closed', completed: 'closed', paused: 'closed' };
const vnd = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';

function describe(p) {
  const parts = [];
  if (p.need) parts.push('## Nhu cầu', p.need);
  if (p.story) parts.push('## Câu chuyện dự án', p.story);
  if (p.location || p.school) parts.push('## Trường thụ hưởng', [p.school, p.location].filter(Boolean).join(' – '));
  return parts.filter(Boolean).join('\n\n').slice(0, 20000);
}

// Mỗi hạng tài trợ thành một dòng quyền lợi "mức tối thiểu | Hạng: quyền lợi…" để form và trang dự án dùng chung.
function benefitLines(p) {
  return (p.tiers || []).map((t, i) => {
    const got = (p.matrix || []).map(r => [r.label, (r.values || [])[i] || '']).filter(([, v]) => v && v !== '—')
      .map(([l, v]) => v === '✓' ? l : `${l} (${v})`);
    return got.length ? `${t.minimum} | ${t.name}: ${got.join('; ')}` : '';
  }).filter(Boolean).reverse().join('\n');
}

async function upsert(env, ref, v) {
  const cur = await env.DB.prepare('SELECT id,status,slug FROM campaigns WHERE ext_ref=?').bind(ref).first();
  if (cur) {
    // Giữ trạng thái "Ẩn" nếu admin cổng này đã chủ động ẩn.
    const status = cur.status === 'hidden' ? 'hidden' : v.status;
    await env.DB.prepare(`UPDATE campaigns SET title=?,kind='money',status=?,end_at=?,goal=?,raised_offset=?,summary=?,description=?,cover=?,benefits=?,external_url=?,external_memo=?,ext_data=?,memo_prefix='',accept_donations=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(v.title, status, v.end_at, v.goal, v.raised, v.summary, v.description, v.cover, v.benefits, v.external_url, v.external_memo, v.ext_data, cur.id).run();
    return 'updated';
  }
  let slug = slugify(v.slug || v.title);
  if (await env.DB.prepare('SELECT 1 x FROM campaigns WHERE slug=?').bind(slug).first()) slug = slug.slice(0, 70) + '-tsbct';
  await env.DB.prepare(`INSERT INTO campaigns(slug,title,kind,status,end_at,goal,raised_offset,summary,description,cover,benefits,external_url,external_memo,ext_ref,ext_data,memo_prefix,accept_donations,sort) VALUES(?,?,'money',?,?,?,?,?,?,?,?,?,?,?,?,'',0,?)`)
    .bind(slug, v.title, v.status, v.end_at, v.goal, v.raised, v.summary, v.description, v.cover, v.benefits, v.external_url, v.external_memo, ref, v.ext_data, v.sort || 0).run();
  return 'added';
}

export async function syncKhuyendoc(env, settings, { force } = {}) {
  const src = settings.sources?.khuyendoc || {}, base = String(src.url || '').replace(/\/$/, '');
  if (!env.FEDERATION_KEY || !/^https?:\/\//.test(base) || src.enabled === false) return { skipped: true, reason: 'Chưa có FEDERATION_KEY hoặc địa chỉ Khuyendoc' };
  if (!/^https:\/\//.test(base) && !env.FEDERATION_ALLOW_HTTP) return { skipped: true, reason: 'Địa chỉ Khuyendoc phải là https' };
  const st = await getState(env, 'khuyendoc_sync');
  if (!force && st.at && Date.now() - st.at < TTL) return { skipped: true };
  await setState(env, 'khuyendoc_sync', { ...st, at: Date.now() });
  const r = await fetch(base + '/api/federation/projects', { headers: { Accept: 'application/json', 'x-fts-federation-key': env.FEDERATION_KEY } });
  if (!r.ok) { const out = { at: Date.now(), ok: false, error: 'Khuyendoc trả lỗi ' + r.status }; await setState(env, 'khuyendoc_sync', out); if (force) throw new Error(out.error); return out; }
  const d = await r.json(), memo = d.memo || 'TUSACH';
  let added = 0, updated = 0;
  const count = x => x === 'added' ? added++ : updated++;
  count(await upsert(env, 'khuyendoc:fund', {
    title: d.fund?.name || 'Quỹ chung Tủ sách Bồ Câu Trắng', slug: 'quy-chung-tu-sach-bo-cau-trang', status: 'open', end_at: '', goal: 0, raised: 0,
    summary: 'Ủng hộ chung cho dự án Tủ sách Bồ Câu Trắng – xây thư viện, tủ sách và lan tỏa văn hóa đọc tại trường học khó khăn.',
    description: d.fund?.lead || '', cover: '', benefits: '', external_url: d.fund?.donateUrl || base + '/quyen-gop', external_memo: memo,
    ext_data: JSON.stringify({ source: 'Tủ sách Bồ Câu Trắng', url: d.fund?.url || base }), sort: -500,
  }));
  const seen = ['khuyendoc:fund'];
  for (const p of d.projects || []) {
    const ref = 'khuyendoc:' + p.id;
    seen.push(ref);
    count(await upsert(env, ref, {
      title: p.name, slug: p.slug, status: STATUS[p.status] || 'closed', end_at: (p.deadline || '').slice(0, 16), goal: p.targetAmount, raised: p.raisedAmount,
      summary: String(p.summary || '').slice(0, 400), description: describe(p), cover: /^https:\/\//.test(p.cover) || env.FEDERATION_ALLOW_HTTP ? p.cover : '',
      benefits: benefitLines(p), external_url: p.donateUrl, external_memo: memo,
      ext_data: JSON.stringify({ source: 'Tủ sách Bồ Câu Trắng', url: p.url, tiers: p.tiers, matrix: p.matrix, matrixNote: p.matrixNote, budget: p.budget, plan: p.plan, facts: p.facts, ceremonyDate: p.ceremonyDate, province: p.province }),
    }));
  }
  // Dự án đã gỡ khỏi Khuyendoc: chuyển sang "Đã kết thúc" trên cổng này.
  const { results } = await env.DB.prepare("SELECT id, ext_ref FROM campaigns WHERE ext_ref LIKE 'khuyendoc:%' AND status='open'").all();
  for (const c of results || []) if (!seen.includes(c.ext_ref)) await env.DB.prepare("UPDATE campaigns SET status='closed' WHERE id=?").bind(c.id).run();
  const out = { at: Date.now(), ok: true, added, updated };
  await setState(env, 'khuyendoc_sync', out);
  return out;
}

export { vnd };
