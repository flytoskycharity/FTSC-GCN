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

for (const p of ['/', '/tra-cuu', '/tra-cuu?tab=kiem-tra', '/du-an', '/ung-ho', '/sao-ke', '/admin/']) assert.equal((await call(p)).status, 200, p);
assert.equal((await call('/xac-thuc')).status, 302);
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
const logs = await j('/api/admin/verify-logs?status=new');
assert.ok(logs.items.some(l => l.code === cert.code && l.verdict === 'invalid'), 'ghi nhật ký xác thực sai');
const chk = await j('/api/verify?qr=' + encodeURIComponent(B + cert.url));
assert.equal(chk.state, 'valid'); assert.ok(chk.render.rows.length >= 1 && chk.render.width && !JSON.stringify(chk).includes('background'), 'trả dữ liệu so giấy, không lộ phôi');
await j('/api/verify', { verdict: 'mismatch', code: cert.code, detail: 'thử' });

// Chống làm giả: phôi trống không công khai; ảnh giấy chỉ là một ảnh đã ghép, cần đúng mã xác thực.
assert.equal((await fetch(B + '/media/_default/cert.svg')).status, 404, 'phôi mặc định không được công khai');
assert.equal((await call('/media/_default/cert.svg')).status, 200, 'quản trị viên xem được phôi');
assert.ok(!/cert-default|\/media\/templates|\/media\/signs|"background"/.test(ok), 'trang xác thực không lộ phôi, chữ ký');
const imgUrl = '/api/cert-image?code=' + encodeURIComponent(cert.code) + '&s=' + cert.url.split('s=')[1];
assert.equal((await fetch(B + imgUrl)).status, 404, 'chưa ghép thì chưa có ảnh');
const q = await j('/api/admin/cert-render');
const item = q.items.find(x => x.code === cert.code); assert.ok(item && item.tpl.background, 'hàng đợi ghép ảnh có giấy mới');
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const up = await fetch(B + `/api/admin/cert-render?id=${item.id}&ver=${encodeURIComponent(item.ver)}`, { method: 'POST', headers: { Origin: B, Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: jpg });
assert.ok(up.ok, 'lưu ảnh đã ghép');
const im = await fetch(B + imgUrl); assert.equal(im.status, 200); assert.equal(im.headers.get('content-type'), 'image/jpeg');
assert.equal((await fetch(B + imgUrl.replace(/s=\w+/, 's=000000000000'))).status, 404, 'sai mã xác thực không lấy được ảnh');
assert.match(await (await call(cert.url)).text(), /id="certImg"/);
// Đề xuất điều chỉnh: sai 4 số cuối bị từ chối; duyệt thì giấy cập nhật, ghi rõ thông tin đã sửa.
const sig = cert.url.split('s=')[1];
assert.equal((await call('/api/cert-fix', { code: cert.code, s: sig, name: 'Người Thử Nghiệm Mới', last4: '0000', reason: 'Sai tên' })).status, 400);
await j('/api/cert-fix', { code: cert.code, s: sig, name: 'Người Thử Nghiệm Mới', org: 'Lớp 12A', last4: '0111', reason: 'Sai tên' });
assert.match(await (await call(cert.url)).text(), /đang chờ Ban Tổ chức/);
const fx = (await j('/api/admin/cert-requests')).items.find(r => r.code === cert.code);
assert.equal(fx.changes.name, 'Người Thử Nghiệm Mới');
await j('/api/admin/cert-requests', { action: 'approve', id: fx.id, name: fx.changes.name, org: fx.changes.org });
const after = await (await call(cert.url)).text();
assert.match(after, /đã được điều chỉnh 1 lần/); assert.match(after, /<s>Người Thử Nghiệm<\/s> → <b>Người Thử Nghiệm Mới<\/b>/);
assert.equal((await fetch(B + imgUrl)).status, 404, 'sửa xong thì ảnh cũ không còn dùng, chờ ghép lại');
assert.ok((await j('/api/admin/cert-render')).items.some(x => x.code === cert.code), 'giấy sửa xong vào lại hàng đợi');
assert.ok((await j('/api/lookup?q=0901000111')).results.find(r => r.code === cert.code).adjusted[0].changes.length, 'tra cứu ghi rõ đã điều chỉnh');
// Quỹ chung luôn có sẵn ở trang Quyên góp
assert.match(await (await call('/ung-ho')).text(), /Quỹ chung các dự án/);

// Ủng hộ qua form + dán sao kê → cấp giấy tự động theo mẫu mức tiền.
const don = await j('/api/donate', { campaign: id, donorType: 'ca-nhan', name: 'Nhà Hảo Tâm', phone: '0902000222', amount: 600000, wantsConfirm: true });
assert.ok(don.wantsConfirm);
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
const found = await j('/api/lookup?q=0902000222');
assert.ok(found.results[0].documents.some(d => d.label === 'Giấy xác nhận tài trợ'), 'hiện yêu cầu Giấy xác nhận tài trợ');
console.log('OK – smoke test đạt');
