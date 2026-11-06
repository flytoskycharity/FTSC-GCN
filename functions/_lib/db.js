import defaults from './defaults.js';

let ready = false;
const TABLES = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, payload TEXT NOT NULL, modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (client TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'staff', status TEXT NOT NULL DEFAULT 'active', salt TEXT NOT NULL, hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, session_rev INTEGER NOT NULL DEFAULT 0, last_login TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS media (key TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'money', status TEXT NOT NULL DEFAULT 'open', start_at TEXT NOT NULL DEFAULT '', end_at TEXT NOT NULL DEFAULT '', memo_prefix TEXT NOT NULL DEFAULT '', goal INTEGER NOT NULL DEFAULT 0, raised_offset INTEGER NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', cert_prefix TEXT NOT NULL DEFAULT '', accept_donations INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', width INTEGER NOT NULL DEFAULT 1600, height INTEGER NOT NULL DEFAULT 1131, fields TEXT NOT NULL DEFAULT '[]', min_amount INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS certificates (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, sig TEXT NOT NULL, campaign_id INTEGER NOT NULL DEFAULT 0, campaign_name TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', name_key TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', org TEXT NOT NULL DEFAULT '', amount INTEGER, amount_text TEXT NOT NULL DEFAULT '', issued_date TEXT NOT NULL DEFAULT '', template_id INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', file_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'valid', revoke_reason TEXT NOT NULL DEFAULT '', donation_id INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', history TEXT NOT NULL DEFAULT '[]', created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS certificates_phone ON certificates(phone)`,
  `CREATE INDEX IF NOT EXISTS certificates_name ON certificates(name_key)`,
  `CREATE INDEX IF NOT EXISTS certificates_campaign ON certificates(campaign_id)`,
  `CREATE TABLE IF NOT EXISTS donations (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, campaign_id INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', org TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, memo TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', paid_amount INTEGER NOT NULL DEFAULT 0, paid_at TEXT NOT NULL DEFAULT '', tx_id TEXT NOT NULL DEFAULT '', cert_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS donations_phone ON donations(phone, status)`,
  `CREATE TABLE IF NOT EXISTS bank_tx (id TEXT PRIMARY KEY, tx_date TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '', campaign_id INTEGER NOT NULL DEFAULT 0, donation_id INTEGER NOT NULL DEFAULT 0, cert_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'other', source TEXT NOT NULL DEFAULT 'auto', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS bank_tx_campaign ON bank_tx(campaign_id, status)`,
  `CREATE TABLE IF NOT EXISTS verify_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT '', code TEXT NOT NULL DEFAULT '', qr TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', ua TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', checked_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS verify_logs_status ON verify_logs(status, id)`,
  // Đề xuất điều chỉnh thông tin Giấy chứng nhận do người nhận gửi từ trang tra cứu.
  `CREATE TABLE IF NOT EXISTS cert_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, cert_id INTEGER NOT NULL, code TEXT NOT NULL DEFAULT '', changes TEXT NOT NULL DEFAULT '{}', reason TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', reply TEXT NOT NULL DEFAULT '', handled_by TEXT NOT NULL DEFAULT '', handled_at TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS cert_requests_status ON cert_requests(status, id)`,
];
// Cột bổ sung cho bảng đã tạo ở bản trước (D1 không có ADD COLUMN IF NOT EXISTS nên bỏ qua lỗi cột đã có).
const COLUMNS = [
  ['campaigns', "benefits TEXT NOT NULL DEFAULT ''"],
  ['campaigns', "external_url TEXT NOT NULL DEFAULT ''"], ['campaigns', "external_memo TEXT NOT NULL DEFAULT ''"],
  ['campaigns', "ext_ref TEXT NOT NULL DEFAULT ''"], ['campaigns', "ext_data TEXT NOT NULL DEFAULT ''"],
  // Quy đổi đóng góp: VD 50.000đ = 1 cây; unit_strict = chỉ nhận bội số.
  ['campaigns', "unit_price INTEGER NOT NULL DEFAULT 0"], ['campaigns', "unit_name TEXT NOT NULL DEFAULT ''"], ['campaigns', "unit_strict INTEGER NOT NULL DEFAULT 0"],
  ['certificates', "units TEXT NOT NULL DEFAULT ''"],
  ['certificates', "cert_image TEXT NOT NULL DEFAULT ''"], ['certificates', "img_ok INTEGER NOT NULL DEFAULT 0"],
  // Tệp giấy đã cấp ở nơi khác: bản scan ký tay hoặc PDF ký số.
  ['certificates', "doc_kind TEXT NOT NULL DEFAULT ''"], ['certificates', "doc_type TEXT NOT NULL DEFAULT ''"],
  ['certificates', "doc_file TEXT NOT NULL DEFAULT ''"], ['certificates', "doc_mime TEXT NOT NULL DEFAULT ''"],
  ['certificates', "doc_hash TEXT NOT NULL DEFAULT ''"], ['certificates', "doc_sig TEXT NOT NULL DEFAULT ''"],
  ['donations', "donor_type TEXT NOT NULL DEFAULT ''"], ['donations', "position TEXT NOT NULL DEFAULT ''"],
  ['donations', "tax_code TEXT NOT NULL DEFAULT ''"], ['donations', "address TEXT NOT NULL DEFAULT ''"],
  ['donations', "wants_confirm INTEGER NOT NULL DEFAULT 0"], ['donations', "confirm_file TEXT NOT NULL DEFAULT ''"],
  ['donations', "message TEXT NOT NULL DEFAULT ''"], ['donations', "reported_at TEXT NOT NULL DEFAULT ''"],
];
export const FUND_SLUG = 'quy-chung';

export async function initializeDatabase(env) {
  if (!env.DB) throw new Error('Chưa gắn cơ sở dữ liệu D1 (binding DB)');
  if (ready) return env.DB;
  await env.DB.batch(TABLES.map(sql => env.DB.prepare(sql)));
  for (const [t, c] of COLUMNS) { try { await env.DB.prepare(`ALTER TABLE ${t} ADD COLUMN ${c}`).run(); } catch { /* đã có */ } }
  // Quỹ chung các dự án: một "dự án" đặc biệt để nhận ủng hộ không chỉ định; sửa được trong admin.
  await env.DB.prepare(`INSERT OR IGNORE INTO campaigns(slug,title,kind,status,memo_prefix,summary,sort,accept_donations) VALUES(?,?,?,?,?,?,?,1)`)
    .bind(FUND_SLUG, 'Quỹ chung các dự án Fly To Sky', 'money', 'open', 'DONGHANH', 'Ủng hộ không chỉ định dự án. Fly To Sky phân bổ cho các dự án, hoàn cảnh cần hỗ trợ nhất và công khai qua sao kê.', -1000).run();
  await env.DB.prepare("UPDATE campaigns SET memo_prefix='DONGHANH' WHERE slug=? AND memo_prefix='FTSQUY'").bind(FUND_SLUG).run();
  ready = true;
  return env.DB;
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function fill(saved, base) {
  if (!isObj(base)) return saved === undefined ? base : saved;
  if (!isObj(saved)) return base;
  const out = { ...saved };
  for (const k of Object.keys(base)) out[k] = fill(saved[k], base[k]);
  return out;
}

export async function loadSettings(env) {
  let saved = null;
  if (env.DB) {
    try {
      await initializeDatabase(env);
      const row = await env.DB.prepare('SELECT payload FROM settings WHERE key=?').bind('site').first();
      if (row) saved = JSON.parse(row.payload);
    } catch { /* dùng mặc định */ }
  }
  return upgrade(fill(saved, JSON.parse(JSON.stringify(defaults))), !!saved);
}

// Nâng cấp cài đặt đã lưu từ bản trước, không đè nội dung admin tự sửa.
function upgrade(s, wasSaved) {
  if (!wasSaved) return s;
  // Bản đầu dùng màu cam của Khuyendoc: chuyển về màu xanh Fly To Sky nếu admin chưa đổi màu.
  if (String(s.theme.accent).toLowerCase() === '#f38234') s.theme = { ...defaults.theme, fontHeading: s.theme.fontHeading, fontBody: s.theme.fontBody };
  for (const l of defaults.contact.links) if (/info\.flytoskycharity|benvung360/.test(l.href) && Array.isArray(s.contact.links) && !s.contact.links.some(x => x.href && x.href.replace(/\/$/, '') === l.href.replace(/\/$/, ''))) s.contact.links.splice(1, 0, { ...l });
  // Bản trước ghi chú dưới QR là "hệ thống tự đối soát…": đổi sang lời nhắn giữ nội dung + nút đã chuyển tiền.
  if (/tự đối soát sao kê và cấp Giấy chứng nhận điện tử/.test(s.donate.note || '')) s.donate.note = defaults.donate.note;
  if (/được cấp tự động khi tiền về/.test(s.donate.lead || '')) s.donate.lead = defaults.donate.lead;
  const hcm = defaults.contact.offices.find(o => o.label.includes('TP.HCM'));
  if (hcm && Array.isArray(s.contact.offices) && !s.contact.offices.some(o => /H[ồo] Ch[íi] Minh|TP\.?HCM/i.test(o.label + o.value))) s.contact.offices.push({ ...hcm });
  return s;
}

export async function saveSettings(env, value) {
  await env.DB.prepare("INSERT INTO settings(key,payload) VALUES('site',?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, modified_at=CURRENT_TIMESTAMP")
    .bind(JSON.stringify(value)).run();
}

export async function getState(env, key) {
  const row = await env.DB.prepare('SELECT payload FROM settings WHERE key=?').bind(key).first();
  try { return row ? JSON.parse(row.payload) : {}; } catch { return {}; }
}
export async function setState(env, key, value) {
  await env.DB.prepare('INSERT INTO settings(key,payload) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, modified_at=CURRENT_TIMESTAMP')
    .bind(key, JSON.stringify(value)).run();
}

// Số tiền đã nhận của dự án: giao dịch sao kê đã gán dự án + phần nhập tay.
export async function raisedOf(env, campaign) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) s FROM bank_tx WHERE campaign_id=? AND status IN ('matched','unmatched')").bind(campaign.id).first();
  // Lượt ủng hộ admin duyệt tay (không qua sao kê) cũng tính vào số đã nhận.
  const m = await env.DB.prepare("SELECT COALESCE(SUM(paid_amount),0) s FROM donations WHERE campaign_id=? AND status='paid' AND tx_id=''").bind(campaign.id).first();
  return (r?.s || 0) + (m?.s || 0) + (Number(campaign.raised_offset) || 0);
}
