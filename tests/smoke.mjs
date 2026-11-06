// Kiểm tra nhanh trên máy chủ thử (tests/dev-server.mjs, dữ liệu trống): trang, đăng nhập, dự án, cấp giấy, tra cứu, xác thực, đối soát.
import assert from 'node:assert';

const B = process.env.BASE || 'http://localhost:8788';
let cookie = '';
const call = async (path, body) => {
  const r = await fetch(B + path, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { Origin: B, 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
  return r;
};
const j = async (p, b) => { const r = await call(p, b); const d = await r.json(); assert.ok(r.ok, p + ': ' + (d.error || r.status)); return d; };

for (const p of ['/', '/tra-cuu', '/du-an', '/sao-ke', '/xac-thuc', '/admin/']) assert.equal((await call(p)).status, 200, p);
assert.equal((await call('/tracuu')).status, 301);
assert.equal((await call('/api/admin/stats')).status, 401, 'admin API phải yêu cầu đăng nhập');

await j('/api/auth', { username: 'admin', password: 'test-pass' });
const memo = 'SMK' + Date.now().toString(36).toUpperCase().slice(-4);
const { id } = await j('/api/admin/campaigns', { action: 'save', record: { title: 'Dự án thử ' + memo, status: 'open', memo_prefix: memo, goal: '1000000' } });
await j('/api/admin/templates', { action: 'save', record: { campaign_id: id, name: 'Mẫu vàng', min_amount: 500000, fields: [{ key: 'name', x: 50, y: 40, size: 4 }] } });
const t2 = await j('/api/admin/templates', { action: 'save', record: { campaign_id: id, name: 'Mẫu thường', fields: [{ key: 'name', x: 50, y: 40, size: 4 }] } });

const issued = await j('/api/admin/certificates', { action: 'create', campaign: id, record: { name: 'Người Thử Nghiệm', phone: '0901.000.111', amount: '100000' } });
const cert = issued.created[0];
assert.match(cert.code, /^FTS-\d{4}-\d{7}$/);

const lk = await j('/api/lookup?q=' + encodeURIComponent('901000111'));
assert.ok(lk.results.some(r => r.code === cert.code), 'tra cứu theo SĐT');
assert.ok((await j('/api/lookup?q=' + encodeURIComponent('nguoi thu nghiem'))).results.some(r => r.code === cert.code), 'tra cứu không dấu');

const ok = await (await call(cert.url)).text();
assert.match(ok, /Giấy chứng nhận hợp lệ/);
const bad = await call(cert.url.replace(/s=\w+/, 's=000000000000'));
assert.equal(bad.status, 404, 'sai mã xác thực phải báo không hợp lệ');

// Ủng hộ qua form + dán sao kê → cấp giấy tự động theo mẫu mức tiền.
const don = await j('/api/donate', { campaign: id, name: 'Nhà Hảo Tâm', phone: '0902000222', amount: 600000 });
assert.equal(don.memo, memo + ' 0902000222');
const tx = await j('/api/admin/transactions', { action: 'paste', text: `06/11/2026 | 600.000 | ${memo} 0902 000 222 ung ho` });
assert.equal(tx.matched, 1);
const st = await j('/api/donate?token=' + don.token);
assert.equal(st.status, 'paid'); assert.ok(st.cert);
const list = await j('/api/admin/certificates?q=' + st.cert.code);
const tpls = (await j('/api/admin/templates')).templates;
assert.equal(tpls.find(t => t.id === list.items[0].template_id)?.name, 'Mẫu vàng', 'chọn mẫu theo mức tiền');
assert.ok(t2.id);

// Thu hồi
await j('/api/admin/certificates', { action: 'revoke', id: list.items[0].id, reason: 'Thử thu hồi' });
assert.match(await (await call(st.cert.url)).text(), /đã bị thu hồi/);
console.log('OK – smoke test đạt');
