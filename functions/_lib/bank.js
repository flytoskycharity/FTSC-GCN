// Đọc sao kê, nhận diện chuyển khoản theo cú pháp của từng dự án và cấp GCN tự động.
import { noMark, normPhone, vnToday, hmac, randomHex, nameKey } from './util.js';
import { getState, setState } from './db.js';
import { issueCertificate } from './certs.js';

const KEYS = {
  amount: ['creditAmount', 'credit', 'transferAmount', 'amount', 'transactionAmount', 'soTien', 'money', 'value'],
  desc: ['narrative', 'description', 'addDescription', 'transactionDesc', 'content', 'noiDung', 'remark', 'note', 'desc'],
  date: ['transactionDate', 'postingDate', 'when', 'transactionTime', 'date', 'createdAt', 'createdDate', 'time'],
  id: ['id', 'transactionId', 'transactionID', 'referenceCode', 'refNo', 'referenceNumber', 'reference', 'transactionCode', 'traceNo'],
};
const take = (o, ks) => {
  for (const k of ks) if (o[k] != null && o[k] !== '') return o[k];
  const all = Object.keys(o);
  for (const k of ks) { const f = all.find(x => x.toLowerCase() === k.toLowerCase()); if (f && o[f] != null && o[f] !== '') return o[f]; }
};
const toMoney = v => typeof v === 'number' ? v : Number(String(v).replace(/[^\d-]/g, '')) || 0;

// Dữ liệu sao kê có nhiều tên trường khác nhau, nên đọc linh hoạt.
export function parseStatement(data) {
  const out = [];
  const walk = v => {
    if (Array.isArray(v)) {
      if (v.length && v[0] && typeof v[0] === 'object' && take(v[0], KEYS.amount) !== undefined && take(v[0], KEYS.desc) !== undefined) {
        for (const r of v) {
          const amount = toMoney(take(r, KEYS.amount));
          if (amount > 0 && r.transferType !== 'out') out.push({ id: take(r, KEYS.id), date: String(take(r, KEYS.date) || ''), amount, desc: String(take(r, KEYS.desc) || '') });
        }
        return;
      }
      v.forEach(walk);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(data);
  return out;
}

const dmy = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
export function statementUrl(settings) {
  const s = settings.sync || {}, to = new Date(Date.now() + 7 * 36e5), from = new Date(to - (Number(s.lookbackDays) || 14) * 864e5);
  return String(s.url || '')
    .replaceAll('{account}', encodeURIComponent(settings.bank?.account || ''))
    .replaceAll('{from}', encodeURIComponent(dmy(from))).replaceAll('{to}', encodeURIComponent(dmy(to)))
    .replaceAll('{fromIso}', from.toISOString().slice(0, 10)).replaceAll('{toIso}', to.toISOString().slice(0, 10));
}

async function getJson(u) {
  const r = await fetch(u, { headers: { Accept: 'application/json, text/plain, */*', 'Accept-Language': 'vi-VN,vi;q=0.9', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Origin: 'https://thiennguyen.app', Referer: 'https://thiennguyen.app/' } });
  const t = await r.text();
  const short = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
  if (!r.ok) throw new Error('Nguồn sao kê trả lỗi ' + r.status + ': ' + short);
  try { return JSON.parse(t); } catch { throw new Error('Nguồn sao kê không trả dữ liệu JSON: ' + short); }
}

export async function fetchStatement(settings) {
  const u = statementUrl(settings);
  if (!/^https:\/\//.test(u)) throw new Error('Chưa cấu hình địa chỉ dữ liệu sao kê');
  return parseStatement(await getJson(u));
}

const letters = p => noMark(p).toUpperCase().replace(/[^A-Z0-9]/g, '');
const prefixRe = p => letters(p).split('').join('[\\s._-]*');

// Tìm dự án theo cú pháp trong nội dung chuyển khoản, rồi số điện thoại đứng sau cú pháp.
export function matchMemo(campaigns, text) {
  const s = noMark(text).toUpperCase();
  const list = campaigns.filter(c => letters(c.memo_prefix).length >= 2).sort((a, b) => letters(b.memo_prefix).length - letters(a.memo_prefix).length);
  for (const c of list) {
    const re = new RegExp('(?:^|[^A-Z0-9])' + prefixRe(c.memo_prefix) + '(?![A-Z])([^0-9A-Z+]*((?:\\+?84|0)?[\\s.\\-]*\\d(?:[\\s.\\-]*\\d){7,10}))?');
    const m = s.match(re);
    if (m) return { campaign: c, phone: m[2] ? normPhone(m[2]) : '' };
  }
  return null;
}

// Sao kê dán tay: mỗi dòng "ngày | số tiền | nội dung", hoặc chép nguyên trang sao kê.
export function parsePasted(campaigns, text) {
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean), out = [], seen = {};
  const push = t => { const k = [t.date, t.amount, t.desc].join('|'); seen[k] = (seen[k] || 0) + 1; t.n = seen[k]; out.push(t); };
  lines.forEach((l, i) => {
    const p = l.split(/\t|\|/).map(s => s.trim());
    if (p.length >= 3) {
      const amount = Number(p[1].replace(/\D/g, '')) || 0;
      if (amount > 0) push({ date: p[0], amount, desc: p.slice(2).join(' ') });
      return;
    }
    if (!matchMemo(campaigns, l)) return;
    const around = lines.slice(Math.max(0, i - 4), i + 5);
    const rest = [l.replace(/(?:\+?84|0)[\d\s.-]{8,13}/, ' '), ...around.filter(x => x !== l)];
    let amount = 0, date = '';
    for (const x of rest) {
      if (!amount) { const m = x.match(/(?:^|[\s+])(\d{1,3}(?:[.,]\d{3})+)(?![\d.,])/); if (m) amount = Number(m[1].replace(/\D/g, '')); }
      if (!date) { const m = x.match(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/); if (m) date = m[0]; }
    }
    if (amount) push({ date, amount, desc: l });
  });
  return out;
}

const isoOf = d => /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : (m => m ? `${m[3]}-${m[2]}-${m[1]}` : vnToday())(String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/));

// Ghi nhận đã nhận tiền cho một lượt ủng hộ và cấp GCN.
export async function payDonation(env, settings, donation, campaign, amount, txId, iso) {
  await env.DB.prepare("UPDATE donations SET status='paid', paid_amount=?, paid_at=?, tx_id=? WHERE id=?").bind(amount, iso, txId || '', donation.id).run();
  if (donation.cert_id) return donation.cert_id;
  const cert = await issueCertificate(env, settings, {
    campaign, name: donation.name, phone: donation.phone, org: [...new Set([donation.position, donation.org].map(v => String(v || '').trim()).filter(Boolean))].join(', '), amount, issued_date: iso,
    source: 'auto', donation_id: donation.id, created_by: 'hệ thống',
  });
  await env.DB.prepare('UPDATE donations SET cert_id=? WHERE id=?').bind(cert.id, donation.id).run();
  return cert.id;
}

export async function applyTx(env, settings, list, source = 'auto') {
  const { results: campaigns } = await env.DB.prepare("SELECT * FROM campaigns WHERE memo_prefix<>''").all();
  const start = settings.sync?.startDate || '';
  let added = 0, matched = 0, unmatched = 0;
  // Đọc trước các giao dịch đã ghi để chỉ xử lý giao dịch mới (tiết kiệm truy vấn D1).
  for (const t of list) t._id = String(t.id || await hmac('tx', [t.date, t.amount, t.desc, t.n || 1].join('|')));
  const seen = new Set();
  for (let i = 0; i < list.length; i += 90) {
    const ids = list.slice(i, i + 90).map(t => t._id);
    const res = await env.DB.prepare(`SELECT id FROM bank_tx WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    (res.results || []).forEach(r => seen.add(r.id));
  }
  const others = [];
  for (const t of list) {
    const id = t._id;
    if (seen.has(id)) continue;
    seen.add(id);
    added++;
    const iso = isoOf(t.date);
    const hit = matchMemo(campaigns || [], t.desc);
    let status = 'other', campaignId = 0, donationId = 0, certId = 0;
    if (hit && (!start || iso >= start)) {
      campaignId = hit.campaign.id;
      if (hit.phone) {
        let d = await env.DB.prepare("SELECT * FROM donations WHERE phone=? AND campaign_id=? AND status='pending' ORDER BY (amount=?) DESC, id DESC LIMIT 1")
          .bind(hit.phone, campaignId, t.amount).first();
        if (!d) {
          // Chuyển khoản đúng cú pháp nhưng chưa điền form: lấy họ tên đã dùng trước đó của SĐT này nếu có.
          const prev = await env.DB.prepare("SELECT name, org FROM certificates WHERE phone=? AND name<>'' ORDER BY id DESC LIMIT 1").bind(hit.phone).first()
            || await env.DB.prepare("SELECT name, org FROM donations WHERE phone=? AND name<>'' ORDER BY id DESC LIMIT 1").bind(hit.phone).first();
          const name = prev?.name || settings.donate.anonymousName;
          const r = await env.DB.prepare("INSERT INTO donations(token,campaign_id,name,phone,org,amount,memo) VALUES(?,?,?,?,?,?,?)")
            .bind(randomHex(16), campaignId, name, hit.phone, prev?.org || '', t.amount, String(t.desc).slice(0, 200)).run();
          d = await env.DB.prepare('SELECT * FROM donations WHERE id=?').bind(r.meta.last_row_id).first();
        }
        donationId = d.id;
        certId = await payDonation(env, settings, d, hit.campaign, t.amount, id, iso);
        status = 'matched'; matched++;
      } else { status = 'unmatched'; unmatched++; }
    }
    const stmt = env.DB.prepare('INSERT OR IGNORE INTO bank_tx(id,tx_date,amount,description,campaign_id,donation_id,cert_id,status,source) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(id, iso, t.amount, String(t.desc).slice(0, 500), campaignId, donationId, certId, status, source);
    if (status === 'other') others.push(stmt); else await stmt.run();
  }
  for (let i = 0; i < others.length; i += 100) await env.DB.batch(others.slice(i, i + 100));
  return { added, matched, unmatched };
}

// Đồng bộ sao kê, tối đa mỗi 30 giây một lần trừ khi bấm tay.
export async function syncBank(env, settings, { force } = {}) {
  if (!settings.sync?.enabled && !force) return { skipped: true };
  const st = await getState(env, 'bank_sync');
  if (!force && st.at && Date.now() - st.at < 30000) return { skipped: true };
  await setState(env, 'bank_sync', { ...st, at: Date.now() });
  try {
    const list = await fetchStatement(settings);
    const r = await applyTx(env, settings, list);
    const out = { at: Date.now(), ok: true, count: list.length, ...r };
    await setState(env, 'bank_sync', out);
    return out;
  } catch (e) {
    const out = { at: Date.now(), ok: false, error: e.message };
    await setState(env, 'bank_sync', out);
    if (force) throw e;
    return out;
  }
}

export { nameKey };
