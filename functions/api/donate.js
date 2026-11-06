// Đăng ký ủng hộ (Quỹ chung hoặc dự án đang mở): tạo mã VietQR đúng cú pháp; theo dõi trạng thái để trả Giấy chứng nhận ngay khi tiền về.
import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { limited, sameOrigin } from '../_lib/auth.js';
import { json, readJson, normPhone, randomHex, money, clip, unitsOf } from '../_lib/util.js';
import { campaignById, isOpen } from '../_lib/campaigns.js';
import { vietQr, qrSvg } from '../_lib/qr.js';
import { syncBank } from '../_lib/bank.js';
import { verifyPath } from '../_lib/certs.js';

const cut = (v, n) => clip(String(v ?? '').replace(/[<>]/g, ''), n);

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  await initializeDatabase(env);
  const b = await readJson(request) || {};
  if (b.website) return json({ ok: true }); // bẫy máy quét tự động
  if (b.action === 'reported') {
    // Người ủng hộ bấm "Tôi đã chuyển khoản": đối soát ngay.
    const token = String(b.token || '');
    if (!/^[a-f0-9]{32}$/.test(token)) return json({ error: 'Mã không hợp lệ' }, 400);
    await env.DB.prepare("UPDATE donations SET reported_at=CURRENT_TIMESTAMP WHERE token=? AND status='pending' AND reported_at=''").bind(token).run();
    const p = syncBank(env, await loadSettings(env), {}).catch(() => {});
    if (waitUntil) waitUntil(p); else await p;
    return json({ ok: true });
  }
  if (await limited(env, request, 'donate', 30, 36e5)) return json({ error: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.' }, 429);
  const s = await loadSettings(env), D = s.donate;
  const c = await campaignById(env, b.campaign);
  if (!c || c.kind !== 'money' || !c.accept_donations || !c.memo_prefix || !isOpen(c)) return json({ error: 'Dự án này hiện không nhận ủng hộ trực tuyến.' }, 400);
  const type = (D.donorTypes || []).find(t => t.id === b.donorType);
  if (!type) return json({ error: 'Vui lòng chọn bạn là cá nhân, tổ chức…' }, 400);
  const name = cut(b.name, 160), phone = normPhone(b.phone), amount = money(b.amount);
  if (!name) return json({ error: 'Vui lòng nhập họ tên hoặc tên đơn vị.' }, 400);
  if (!phone) return json({ error: 'Số điện thoại chưa đúng. Vui lòng nhập số di động Việt Nam 10 số.' }, 400);
  const email = cut(b.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email chưa đúng.' }, 400);
  if (amount < (Number(D.minAmount) || 1000) || amount > 100_000_000_000) return json({ error: `Số tiền tối thiểu ${(Number(D.minAmount) || 1000).toLocaleString('vi-VN')}đ.` }, 400);
  const up = Number(c.unit_price) || 0;
  if (c.unit_strict && up > 0 && amount % up) return json({ error: `Dự án nhận theo bội số ${up.toLocaleString('vi-VN')}đ (1 ${c.unit_name}). Vui lòng chọn số ${c.unit_name}.` }, 400);
  const biz = ['to-chuc', 'doanh-nghiep'].includes(type.id);
  const wants = b.wantsConfirm && amount >= (Number(D.confirmMin) || 0) ? 1 : 0;
  if (wants && biz && !cut(b.taxCode, 20)) return json({ error: 'Vui lòng nhập mã số thuế để được cấp Giấy xác nhận tài trợ.' }, 400);
  const memo = `${c.memo_prefix} ${phone}`, token = randomHex(16);
  await env.DB.prepare(`INSERT INTO donations(token,campaign_id,name,phone,org,email,amount,memo,donor_type,position,tax_code,address,wants_confirm,message) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(token, c.id, name, phone, cut(b.org, 200), email, amount, memo, type.id, cut(b.position, 160), cut(b.taxCode, 20), cut(b.address, 250), wants, cut(b.message, 1000)).run();
  const bank = s.bank;
  return json({
    token, memo, amount, project: c.title, wantsConfirm: !!wants, units: unitsOf(amount, c),
    bank: { name: bank.name, account: bank.account, holder: bank.holder },
    qr: qrSvg(vietQr({ bin: bank.bin, account: bank.account, amount, memo }), { level: 'M', border: 3 }),
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  await initializeDatabase(env);
  const token = (new URL(request.url).searchParams.get('token') || '').replace(/[^a-f0-9]/g, '');
  let d = token.length === 32 ? await env.DB.prepare('SELECT * FROM donations WHERE token=?').bind(token).first() : null;
  if (!d) return json({ error: 'Không tìm thấy lượt ủng hộ.' }, 404);
  if (d.status === 'pending') {
    await syncBank(env, await loadSettings(env)).catch(() => {});
    d = await env.DB.prepare('SELECT * FROM donations WHERE id=?').bind(d.id).first();
  }
  const cert = d.cert_id ? await env.DB.prepare('SELECT code,sig FROM certificates WHERE id=?').bind(d.cert_id).first() : null;
  return json({ status: d.status, paid: d.paid_amount, cert: cert ? { code: cert.code, url: verifyPath(cert) } : null });
}
