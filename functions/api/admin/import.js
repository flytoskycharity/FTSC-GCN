// Nhập dữ liệu cũ từ Google Sheets (bảng GCN và KEUGOI của hệ thống Apps Script) hoặc từ CSV dán vào.
import { adminApi, log } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/db.js';
import { json, readJson, nameKey, normPhone, toIsoDate, amountOf, slugify, clip, money, randomInt } from '../../_lib/util.js';
import { certSig } from '../../_lib/certs.js';
import { parseCsv } from '../../_lib/csv.js';

const COLS = {
  code: ['ma gcn', 'ma giay', 'ma', 'code', 's', 'ma giay chung nhan', 'so gcn'],
  name: ['ho ten', 'ho va ten', 'ten', 'name', 'nha hao tam'],
  campaign: ['chien dich', 'du an', 'chuong trinh', 'campaign'],
  date: ['ngay ung ho', 'ngay cap', 'ngay', 'date'],
  amount: ['so tien', 'so tien ung ho', 'amount', 'noi dung ghi nhan'],
  phone: ['so dien thoai', 'sdt', 'dien thoai', 'phone'],
  link: ['link gcn', 'link', 'file', 'duong dan'],
  org: ['don vi', 'chuc vu', 'to chuc', 'chuc vu don vi'],
};
const CAMP_COLS = {
  status: ['hienthi', 'trangthai', 'hien thi', 'trang thai'], title: ['tenduan', 'ten du an'], start: ['thoigianbatdau', 'thoi gian bat dau', 'bat dau'],
  end: ['thoigianketthuc', 'thoi gian ket thuc', 'ket thuc'], memo: ['cuphapungho', 'cu phap ung ho', 'cu phap'], goal: ['sotienkeugoi', 'so tien keu goi', 'muc tieu'],
  raised: ['sotiendanhan', 'so tien da nhan', 'da nhan'], summary: ['mota', 'mo ta'], note: ['ghichu', 'ghi chu'],
};

function mapHeader(header, spec) {
  const keys = header.map(h => nameKey(h));
  const idx = {};
  for (const [k, names] of Object.entries(spec)) idx[k] = keys.findIndex(h => names.includes(h));
  return idx;
}

async function readSource(b) {
  if (b.csv) return parseCsv(b.csv);
  const url = String(b.sheetUrl || '');
  const id = (url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) || [])[1];
  if (!id) throw new Error('Đường dẫn Google Sheets chưa đúng.');
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
  const q = b.sheet ? 'sheet=' + encodeURIComponent(b.sheet) : (gid ? 'gid=' + gid : '');
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&${q}`, { redirect: 'follow' });
  const text = await r.text();
  if (!r.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error('Không đọc được trang tính. Hãy bật chia sẻ "Bất kỳ ai có đường liên kết đều xem được" và kiểm tra tên trang tính (tab).');
  return parseCsv(text);
}

const memoOf = v => clip(String(v || '').replace(/[+<[{(]?\s*(s[đd]t|so dien thoai|số điện thoại|phone)\b.*$/i, '').replace(/[<>[\]{}+]/g, ' ').replace(/\s+/g, ' '), 40).toUpperCase();
const dtOf = v => { const d = toIsoDate(v); if (!d) return ''; const t = String(v).match(/(\d{1,2}):(\d{2})/); return d + 'T' + (t ? t[1].padStart(2, '0') + ':' + t[2] : '00:00'); };
const HIDE = ['an', 'hide', 'ngung', 'dung', 'off', 'khong', 'false', '0'];

export const onRequest = adminApi('edit', async ({ request, env, me }) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const b = await readJson(request) || {};
  const commit = b.action === 'commit';
  let rows = [], header = [];
  if (!(commit && Array.isArray(b.items))) {
    try { rows = await readSource(b); } catch (e) { return json({ error: e.message }, 400); }
    if (rows.length < 2) return json({ error: 'Trang tính không có dữ liệu (cần hàng tiêu đề và ít nhất 1 dòng).' }, 400);
    header = rows.shift();
  }

  if (b.type === 'campaigns') {
    const ix = mapHeader(header, CAMP_COLS);
    if (ix.title < 0) return json({ error: 'Không thấy cột "Tên dự án" (TenDuAn).' }, 400);
    const items = rows.map(r => {
      const g = k => ix[k] >= 0 ? r[ix[k]] : '';
      return { title: clip(g('title'), 200), status: HIDE.includes(nameKey(g('status'))) ? 'hidden' : 'open', start_at: dtOf(g('start')), end_at: dtOf(g('end')), memo_prefix: memoOf(g('memo')), goal: money(g('goal')), raised_offset: money(g('raised')), summary: clip(g('summary') || g('note'), 400) };
    }).filter(x => x.title);
    if (!commit) return json({ preview: items.slice(0, 50), total: items.length });
    let added = 0, skipped = 0;
    for (const c of items) {
      if (await env.DB.prepare('SELECT 1 x FROM campaigns WHERE title=?').bind(c.title).first()) { skipped++; continue; }
      const dup = c.memo_prefix && await env.DB.prepare('SELECT 1 x FROM campaigns WHERE UPPER(memo_prefix)=?').bind(c.memo_prefix).first();
      await env.DB.prepare('INSERT INTO campaigns(slug,title,kind,status,start_at,end_at,memo_prefix,goal,raised_offset,summary) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(slugify(c.title) + '-' + Date.now().toString(36).slice(-4) + added, c.title, 'money', c.status, c.start_at, c.end_at, dup ? '' : c.memo_prefix, c.goal, c.raised_offset, c.summary).run();
      added++;
    }
    await log(env, me, `nhập ${added} dự án từ bảng tính`);
    return json({ ok: true, added, skipped });
  }

  // Bảng giấy chứng nhận. Không nhận ra tiêu đề thì đọc theo thứ tự cột của hệ thống cũ.
  const settings = await loadSettings(env);
  let ix = mapHeader(header, COLS);
  if (Array.isArray(b.items)) {
    // Bước ghi: trang quản trị gửi lại từng phần danh sách đã xem trước, ghép thành dạng bảng.
    ix = { code: 0, name: 1, campaign: 2, date: 3, amount: 4, phone: 5, link: 6, org: 7 };
    rows = b.items.slice(0, 400).map(x => [x.code, x.name, x.campaign, x.issued_date, x.amount ?? x.amount_text, x.phone, x.file_url, x.org]);
  } else if (ix.name < 0) {
    ix = { code: 0, name: 1, campaign: 2, date: 3, amount: 4, phone: 5, link: 6, org: -1 };
    rows.unshift(header);
  }
  const items = rows.map((r, i) => {
    const g = k => ix[k] >= 0 && ix[k] < r.length ? String(r[ix[k]] ?? '').trim() : '';
    const raw = ix.amount >= 0 && ix.amount < r.length ? r[ix.amount] : '';
    const amt = typeof raw === 'number' ? { amount: raw, text: '' } : amountOf(g('amount'));
    return { row: i + 2, code: g('code').toUpperCase().replace(/\s+/g, ''), name: clip(g('name'), 160), campaign: clip(g('campaign'), 200), issued_date: toIsoDate(g('date')),
      amount: amt.amount, amount_text: amt.text, phone: normPhone(g('phone')), file_url: /^https:\/\//.test(g('link')) ? clip(g('link'), 500) : '', org: clip(g('org'), 200) };
  }).filter(x => x.name);
  const bad = items.filter(x => x.code && !/^[A-Z0-9][A-Z0-9_./-]{1,40}$/.test(x.code));
  if (!commit) return json({ preview: items.slice(0, 50), items, total: items.length, invalidCodes: bad.map(x => `Dòng ${x.row}: ${x.code}`).slice(0, 20) });
  if (items.length > 400) return json({ error: 'Mỗi lần ghi tối đa 400 dòng; trang quản trị tự chia nhỏ.' }, 400);

  // Nạp sẵn dự án và mã đã có để hạn chế số truy vấn.
  const camps = (await env.DB.prepare('SELECT id,title,cert_prefix FROM campaigns').all()).results || [];
  const byName = new Map(camps.map(c => [nameKey(c.title), c]));
  const codes = items.map(x => x.code).filter(Boolean), have = new Set();
  for (let i = 0; i < codes.length; i += 90) {
    const part = codes.slice(i, i + 90);
    const res = await env.DB.prepare(`SELECT code FROM certificates WHERE code IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    (res.results || []).forEach(r => have.add(r.code));
  }
  const stmts = [], errors = [];
  let skipped = 0, newCamps = 0;
  const overwrite = !!b.overwrite;
  for (const x of items) {
    if (x.code && !/^[A-Z0-9][A-Z0-9_./-]{1,40}$/.test(x.code)) { errors.push(`Dòng ${x.row}: mã "${x.code}" không hợp lệ`); continue; }
    let camp = x.campaign ? byName.get(nameKey(x.campaign)) : null;
    if (x.campaign && !camp && b.createCampaigns !== false) {
      const r = await env.DB.prepare("INSERT INTO campaigns(slug,title,kind,status) VALUES(?,?,?,'closed')").bind(slugify(x.campaign) + '-' + Date.now().toString(36).slice(-5), x.campaign, x.amount ? 'money' : 'program').run();
      camp = { id: r.meta.last_row_id, title: x.campaign, cert_prefix: '' };
      byName.set(nameKey(x.campaign), camp); newCamps++;
    }
    let code = x.code;
    if (code && have.has(code)) {
      if (!overwrite) { skipped++; continue; }
      stmts.push(env.DB.prepare('UPDATE certificates SET name=?,name_key=?,phone=?,org=?,amount=?,amount_text=?,issued_date=?,campaign_id=?,campaign_name=?,file_url=?,updated_at=CURRENT_TIMESTAMP WHERE code=?')
        .bind(x.name, nameKey(x.name), x.phone, x.org, x.amount, x.amount_text, x.issued_date, camp?.id || 0, x.campaign, x.file_url, code));
      continue;
    }
    if (!code) {
      const year = (x.issued_date || new Date().toISOString()).slice(0, 4);
      do code = `${(camp?.cert_prefix || settings.cert.prefix || 'FTS').toUpperCase()}-${year}-${1000000 + randomInt(9000000)}`; while (have.has(code));
    }
    have.add(code);
    stmts.push(env.DB.prepare(`INSERT INTO certificates(code,sig,campaign_id,campaign_name,name,name_key,phone,org,amount,amount_text,issued_date,source,file_url,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(code, await certSig(env, code), camp?.id || 0, x.campaign, x.name, nameKey(x.name), x.phone, x.org, x.amount, x.amount_text, x.issued_date, 'import', x.file_url, me.username));
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await log(env, me, `nhập ${stmts.length} giấy chứng nhận từ bảng tính (bỏ qua ${skipped} mã trùng)`);
  return json({ ok: true, written: stmts.length, skipped, newCampaigns: newCamps, errors });
});
