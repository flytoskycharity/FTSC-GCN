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
];

export async function initializeDatabase(env) {
  if (!env.DB) throw new Error('Chưa gắn cơ sở dữ liệu D1 (binding DB)');
  if (ready) return env.DB;
  await env.DB.batch(TABLES.map(sql => env.DB.prepare(sql)));
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
  return fill(saved, JSON.parse(JSON.stringify(defaults)));
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
  return (r?.s || 0) + (Number(campaign.raised_offset) || 0);
}
