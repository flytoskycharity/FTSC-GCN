// Đăng ký ủng hộ: tạo mã QR chuyển khoản đúng cú pháp; theo dõi trạng thái để trả Giấy chứng nhận ngay khi tiền về.
import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { limited, sameOrigin } from '../_lib/auth.js';
import { json, readJson, normPhone, randomHex, money, clip } from '../_lib/util.js';
import { campaignById } from '../_lib/campaigns.js';
import { campaignState } from '../_lib/render.js';
import { vietQr, qrSvg } from '../_lib/qr.js';
import { syncBank } from '../_lib/bank.js';
import { verifyPath } from '../_lib/certs.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  await initializeDatabase(env);
  if (await limited(env, request, 'donate', 20, 36e5)) return json({ error: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.' }, 429);
  const b = await readJson(request) || {};
  const settings = await loadSettings(env);
  const c = await campaignById(env, b.campaign);
  if (!c || c.status !== 'open' || !c.accept_donations || c.kind !== 'money' || !c.memo_prefix || campaignState(c) !== 'open')
    return json({ error: 'Dự án hiện không nhận ủng hộ trực tuyến.' }, 400);
  const name = clip(b.name, 160), phone = normPhone(b.phone), amount = money(b.amount);
  if (!name) return json({ error: 'Vui lòng nhập họ và tên.' }, 400);
  if (!phone) return json({ error: 'Số điện thoại chưa đúng. Vui lòng nhập số di động Việt Nam 10 số.' }, 400);
  if (amount < (Number(settings.donate.minAmount) || 0) || amount > 10_000_000_000) return json({ error: 'Số tiền ủng hộ chưa hợp lệ.' }, 400);
  const memo = `${c.memo_prefix} ${phone}`, token = randomHex(16);
  await env.DB.prepare('INSERT INTO donations(token,campaign_id,name,phone,org,email,amount,memo) VALUES(?,?,?,?,?,?,?,?)')
    .bind(token, c.id, name, phone, clip(b.org, 200), clip(b.email, 160), amount, memo).run();
  const bank = settings.bank;
  return json({
    token, memo, amount, bank: { name: bank.name, account: bank.account, holder: bank.holder },
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
