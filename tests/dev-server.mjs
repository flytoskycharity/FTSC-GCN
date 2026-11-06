// Máy chủ thử: mô phỏng Cloudflare Pages (Functions theo thư mục) + D1 + R2 bằng Node, không cần tài khoản Cloudflare.
// Chạy: node --no-warnings tests/dev-server.mjs   (mật khẩu admin thử: test-pass)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..'), pub = path.join(root, 'public'), fnDir = path.join(root, 'functions');
const port = Number(process.env.PORT || 8788);
const db = new DatabaseSync(process.env.DB_FILE || ':memory:');
const norm = a => a.map(v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...norm(args)) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...norm(args)) }),
  run: async () => { const r = db.prepare(sql).run(...norm(args)); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
});
const r2 = new Map();
const env = {
  ADMIN_PASSWORD: 'test-pass', ADMIN_SESSION_SECRET: 'test-secret', FEDERATION_KEY: process.env.FEDERATION_KEY || 'fed-test', SYNC_KEY: 'sync-test', FEDERATION_ALLOW_HTTP: process.env.FEDERATION_ALLOW_HTTP || '',
  DB: { prepare: s => stmt(s), batch: async l => { db.exec('BEGIN'); try { for (const q of l) await q.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } },
  MEDIA: {
    put: async (k, b, o) => r2.set(k, { b: Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b), o }),
    get: async k => { const f = r2.get(k); return f ? { body: f.b, writeHttpMetadata: h => h.set('Content-Type', f.o.httpMetadata.contentType) } : null; },
    delete: async k => r2.delete(k),
  },
};

// Dựng bảng định tuyến từ cây thư mục functions/ như Cloudflare Pages.
const routes = [];
(function walk(dir, base) {
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_')) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p, base + '/' + f); continue; }
    if (!f.endsWith('.js')) continue;
    const name = f.replace(/\.js$/, ''), seg = name === 'index' ? '' : '/' + name;
    const pattern = (base + seg) || '/';
    const params = [];
    const re = pattern.replace(/\/\[\[(\w+)\]\]/g, (_, n) => { params.push([n, true]); return '(?:/(.+))?'; }).replace(/\[(\w+)\]/g, (_, n) => { params.push([n, false]); return '([^/]+)'; });
    routes.push({ re: new RegExp('^' + re + '/?$'), file: p, params, dyn: params.length });
  }
})(fnDir, '');
routes.sort((a, b) => a.dyn - b.dyn);

const redirects = fs.existsSync(path.join(pub, '_redirects')) ? fs.readFileSync(path.join(pub, '_redirects'), 'utf8').split('\n').map(l => l.trim().split(/\s+/)).filter(l => l.length >= 2) : [];
const types = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mjs': 'text/javascript', '.pdf': 'application/pdf' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:' + port);
    const p = url.pathname, pd = decodeURIComponent(p);
    const rd = redirects.find(r => r[0] === pd);
    if (rd) { res.writeHead(Number(rd[2] || 302), { Location: rd[1] }); return res.end(); }
    let st = path.join(pub, pd);
    if (fs.existsSync(st) && fs.statSync(st).isDirectory()) st = path.join(st, 'index.html');
    if (p !== '/' && fs.existsSync(st) && fs.statSync(st).isFile()) {
      res.writeHead(200, { 'Content-Type': types[path.extname(st)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(st));
    }
    for (const r of routes) {
      const m = p.match(r.re);
      if (!m) continue;
      const mod = await import(r.file);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), duplex: 'half' });
      const params = Object.fromEntries(r.params.map(([n, multi], i) => [n, multi ? (m[i + 1] ? m[i + 1].split('/') : []) : m[i + 1]]));
      const h = mod.onRequest || mod['onRequest' + req.method[0] + req.method.slice(1).toLowerCase()];
      if (!h) { res.writeHead(405); return res.end(); }
      const out = await h({ request, env, params, waitUntil: () => {} });
      const hs = {};
      out.headers.forEach((v, k) => { hs[k] = k === 'set-cookie' ? v.replace(/; Secure/, '') : v; });
      res.writeHead(out.status, hs);
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(pub, '404.html')));
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e.stack)); }
}).listen(port, () => console.log('http://localhost:' + port));
