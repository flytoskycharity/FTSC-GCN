// Đăng ký quyên góp hiện vật và khai thông tin bưu gửi (đơn vị vận chuyển, mã bưu gửi, ngày gửi, ảnh bưu gửi).
// Chỉ nhận tại các văn phòng trong Cài đặt (Hà Nội, Gia Lai); phí vận chuyển người gửi trả trước, không nhận COD.
// Ban Tổ chức kiểm đếm khi nhận hàng rồi cấp Giấy xác nhận ủng hộ hiện vật (admin → Duyệt ủng hộ).
import { initializeDatabase, loadSettings } from '../_lib/db.js';
import { limited, sameOrigin } from '../_lib/auth.js';
import { json, readJson, normPhone, randomHex, money, clip, vnToday } from '../_lib/util.js';
import { campaignById, isOpen } from '../_lib/campaigns.js';
import { verifyPath } from '../_lib/certs.js';
import { pushStaff } from '../_lib/push-notify.js';
import { cleanItems, parseItems, itemCode, itemsText } from '../_lib/items.js';

const cut = (v, n) => clip(String(v ?? '').replace(/[<>]/g, ''), n).trim();
const JPEG = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTOS = 6;
const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';

async function savePhotos(env, list, have = 0) {
  const keys = [];
  for (const p of (Array.isArray(list) ? list : []).slice(0, Math.max(0, MAX_PHOTOS - have))) {
    const m = String(p || '').match(JPEG);
    if (!m) continue;
    const bytes = Uint8Array.from(atob(m[1]), ch => ch.charCodeAt(0));
    if (bytes.length > 2.5e6 || bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;
    const key = `parcels/${vnToday()}-${randomHex(8)}.jpg`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    keys.push(key);
  }
  return keys;
}
// Thông tin bưu gửi; bắt buộc đủ khi gửi qua đơn vị vận chuyển và không chọn "bổ sung sau".
function shipping(b, D) {
  const carrier = cut(b.carrier, 80), tracking = cut(b.tracking, 60).toUpperCase(), shipDate = isoDate(b.shipDate);
  if (carrier && !D.carriers.includes(carrier) && carrier.length < 2) return { error: 'Vui lòng ghi rõ đơn vị vận chuyển.' };
  if (shipDate && shipDate > vnToday()) return { error: 'Ngày gửi không được sau hôm nay.' };
  return { carrier, tracking, shipDate };
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB || !env.MEDIA) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
  await initializeDatabase(env);
  const b = await readJson(request) || {};
  if (b.website) return json({ ok: true }); // bẫy máy quét tự động
  if (await limited(env, request, 'donate-items', 20, 36e5)) return json({ error: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.' }, 429);
  const s = await loadSettings(env), D = s.donate;

  // Bổ sung thông tin bưu gửi sau khi đã gửi hàng (mở bằng đường dẫn riêng có mã bí mật).
  if (b.action === 'shipping') {
    const token = String(b.token || '');
    if (!/^[a-f0-9]{32}$/.test(token)) return json({ error: 'Đường dẫn không hợp lệ.' }, 400);
    const d = await env.DB.prepare("SELECT * FROM donations WHERE token=? AND kind='items'").bind(token).first();
    if (!d) return json({ error: 'Không tìm thấy lượt quyên góp.' }, 404);
    if (d.status !== 'pending') return json({ error: 'Lượt quyên góp này đã được xử lý, không sửa được nữa.' }, 400);
    const sh = shipping(b, D);
    if (sh.error) return json({ error: sh.error }, 400);
    let photos = []; try { photos = JSON.parse(d.photos || '[]'); } catch { photos = []; }
    photos = photos.concat(await savePhotos(env, b.photos, photos.length));
    if (d.ship_method === 'post' && (!sh.carrier || !sh.tracking || !sh.shipDate || !photos.length)) return json({ error: 'Vui lòng nhập đủ đơn vị vận chuyển, mã bưu gửi, ngày gửi và ít nhất 1 ảnh bưu gửi.' }, 400);
    await env.DB.prepare('UPDATE donations SET carrier=?, tracking=?, ship_date=?, photos=?, reported_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(sh.carrier, sh.tracking, sh.shipDate, JSON.stringify(photos), d.id).run();
    pushStaff(env, waitUntil, { title: 'Hiện vật đã gửi', body: `${d.name} · ${sh.carrier || 'mang trực tiếp'} ${sh.tracking}`, url: '/admin/#duyet', tag: 'donate' });
    return json({ ok: true, photos: photos.length });
  }

  const c = await campaignById(env, b.campaign);
  if (!c || !c.items_accept || !isOpen(c)) return json({ error: 'Dự án này hiện không nhận quyên góp hiện vật.' }, 400);
  const type = (D.donorTypes || []).find(t => t.id === b.donorType);
  if (!type) return json({ error: 'Vui lòng chọn bạn là cá nhân, tổ chức…' }, 400);
  const name = cut(b.name, 160), phone = normPhone(b.phone), address = cut(b.address, 250);
  if (!name) return json({ error: 'Vui lòng nhập họ tên người gửi hoặc tên đơn vị.' }, 400);
  if (!phone) return json({ error: 'Số điện thoại chưa đúng. Vui lòng nhập số di động Việt Nam 10 số.' }, 400);
  if (address.length < 10) return json({ error: 'Vui lòng nhập địa chỉ người gửi đầy đủ (số nhà, đường, phường/xã, tỉnh/thành).' }, 400);
  const email = cut(b.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email chưa đúng.' }, 400);
  const items = cleanItems(b.items);
  if (!items.length) return json({ error: 'Vui lòng nhập ít nhất một hiện vật và số lượng.' }, 400);
  const office = (D.itemOffices || []).find(o => o.id === b.office);
  if (!office) return json({ error: 'Vui lòng chọn văn phòng nhận hiện vật.' }, 400);
  const method = b.shipMethod === 'direct' ? 'direct' : 'post';
  if (method === 'post' && !b.prepaid) return json({ error: 'Vui lòng xác nhận bạn đã/sẽ thanh toán trước phí vận chuyển (Fly To Sky không nhận hàng thu hộ).' }, 400);
  const sh = shipping(b, D);
  if (sh.error) return json({ error: sh.error }, 400);
  const later = !!b.later || method === 'direct';
  const est = money(b.estValue);
  const biz = ['to-chuc', 'doanh-nghiep'].includes(type.id);
  const wants = b.wantsConfirm && est >= (Number(D.confirmMin) || 0) ? 1 : 0;
  if (wants && biz && !cut(b.taxCode, 20)) return json({ error: 'Vui lòng nhập mã số thuế để được cấp Giấy xác nhận tài trợ.' }, 400);
  if (method === 'post' && !later && (!sh.carrier || !sh.tracking || !sh.shipDate || !(b.photos || []).length))
    return json({ error: 'Vui lòng nhập đủ đơn vị vận chuyển, mã bưu gửi, ngày gửi và ảnh bưu gửi, hoặc chọn “Tôi chưa gửi, sẽ bổ sung sau”.' }, 400);
  const photos = later && method === 'direct' ? [] : await savePhotos(env, b.photos);
  if (method === 'post' && !later && !photos.length) return json({ error: 'Ảnh bưu gửi chưa hợp lệ. Vui lòng chụp lại.' }, 400);
  const token = randomHex(16);
  const r = await env.DB.prepare(`INSERT INTO donations(token,campaign_id,name,phone,org,email,amount,memo,donor_type,position,tax_code,address,wants_confirm,message,kind,items,est_value,ship_method,office,carrier,tracking,ship_date,photos,reported_at)
    VALUES(?,?,?,?,?,?,0,'',?,?,?,?,?,?,'items',?,?,?,?,?,?,?,?,?)`).bind(
    token, c.id, name, phone, '', email, type.id, cut(b.position, 160), cut(b.taxCode, 20), address, wants, cut(b.message, 1000),
    JSON.stringify(items), est, method, office.id, method === 'post' ? sh.carrier : '', method === 'post' ? sh.tracking : '', sh.shipDate, JSON.stringify(photos),
    method === 'post' && !later ? new Date().toISOString().replace('T', ' ').slice(0, 19) : '').run();
  const code = itemCode(r.meta.last_row_id);
  await env.DB.prepare('UPDATE donations SET memo=? WHERE id=?').bind(code, r.meta.last_row_id).run();
  pushStaff(env, waitUntil, { title: 'Đăng ký quyên góp hiện vật', body: `${name} · ${itemsText(items)} · ${office.label}`, url: '/admin/#duyet', tag: 'donate' });
  return json({ token, code, project: c.title, items, office, method, needShipping: method === 'post' && later, wantsConfirm: !!wants });
}

// Trạng thái lượt quyên góp hiện vật (trang bổ sung thông tin bưu gửi).
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Hệ thống tạm thời chưa sẵn sàng.' }, 503);
  await initializeDatabase(env);
  const token = (new URL(request.url).searchParams.get('token') || '').replace(/[^a-f0-9]/g, '');
  const d = token.length === 32 ? await env.DB.prepare("SELECT d.*, c.title campaign FROM donations d LEFT JOIN campaigns c ON c.id=d.campaign_id WHERE d.token=? AND d.kind='items'").bind(token).first() : null;
  if (!d) return json({ error: 'Không tìm thấy lượt quyên góp.' }, 404);
  const s = await loadSettings(env), office = (s.donate.itemOffices || []).find(o => o.id === d.office) || null;
  const cert = d.cert_id ? await env.DB.prepare('SELECT code,sig FROM certificates WHERE id=?').bind(d.cert_id).first() : null;
  let photos = 0; try { photos = JSON.parse(d.photos || '[]').length; } catch { /* trống */ }
  return json({
    status: d.status, code: d.memo, project: d.campaign, name: d.name, items: parseItems(d.items), received: parseItems(d.received_items), office, method: d.ship_method,
    carrier: d.carrier, tracking: d.tracking, shipDate: d.ship_date, photos, cert: cert ? { code: cert.code, url: verifyPath(cert) } : null,
  });
}
