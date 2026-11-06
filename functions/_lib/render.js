// Dựng HTML phía máy chủ cho các trang công khai. Giao diện đồng bộ với website Tủ sách Bồ Câu Trắng (Khuyendoc).
import { esc, fmtDate, fmtDateTime, vnd, codePath } from './util.js';
import { certValues, IMAGE_KEYS } from './certs.js';
import { qrSvg } from './qr.js';

const V = '1';
const ICON = {
  search: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  shield: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  heart: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2 0 3.5 1.1 4.4 2.6.9-1.5 2.4-2.6 4.4-2.6 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21Z"/></svg>',
  doc: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  people: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.4.3 4 2.1 4.5 5"/></svg>',
  book: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 5.5C5.5 4 9 4 12 6c3-2 6.5-2 9-.5V19c-2.5-1.5-6-1.5-9 .5-3-2-6.5-2-9-.5z"/><path d="M12 6v13.5"/></svg>',
  qr: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>',
};

export const pageCtx = (settings, request, path) => ({ s: settings, path, origin: new URL(request.url).origin });

function head(x, { title, desc, noindex }) {
  const { s } = x, th = s.theme;
  const css = `:root{--primary:${th.primary};--primary-dark:${th.primaryDark};--accent:${th.accent};--paper:${th.paper};--tint:${th.tint};--ink:${th.ink};--font-h:"${th.fontHeading}",Georgia,serif;--font-b:"${th.fontBody}",system-ui,sans-serif}`.replace(/[<>]/g, '');
  const fonts = [...new Set([th.fontHeading, th.fontBody])].map(n => 'family=' + String(n).replace(/ /g, '+') + ':wght@400;500;600;700;800').join('&');
  const site = String(s.site.url || '').replace(/\/$/, '');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc || s.site.intro)}">${noindex ? '<meta name="robots" content="noindex">' : ''}<link rel="canonical" href="${esc(site + x.path)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc || s.site.intro)}"><meta property="og:image" content="${esc(site)}/brand/og-image.png"><meta property="og:type" content="website"><meta name="theme-color" content="${esc(th.primaryDark)}"><link rel="icon" href="/favicon.png"><link rel="apple-touch-icon" href="/favicon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap"><link rel="stylesheet" href="/assets/site.css?v=${V}"><style>${css}</style></head>`;
}

const NAV = [['/', 'Trang chủ'], ['/tra-cuu', 'Tra cứu'], ['/du-an', 'Dự án kêu gọi'], ['/sao-ke', 'Sao kê'], ['/xac-thuc', 'Xác thực giấy']];
function header(x) {
  const on = h => (h === '/' ? x.path === '/' : x.path.startsWith(h)) ? ' class="on" aria-current="page"' : '';
  return `<header class="site-head"><div class="wrap head-in"><a class="logo" href="/" aria-label="${esc(x.s.site.owner)}"><img src="/brand/fts-logo.png" alt="Fly To Sky" width="62" height="52"><span class="logo-t"><b>${esc(x.s.site.shortTitle)}</b><small>${esc(x.s.site.owner)}</small></span></a><nav class="main-nav" id="mainNav" aria-label="Menu chính"><ul>${NAV.map(([h, l]) => `<li><a href="${h}"${on(h)}>${esc(l)}</a></li>`).join('')}</ul></nav><div class="head-actions"><a class="btn btn-accent btn-sm head-cta" href="/du-an">${ICON.heart}<span>Ủng hộ</span></a><button class="burger" type="button" aria-controls="mainNav" aria-expanded="false" aria-label="Mở menu"><span></span><span></span><span></span></button></div></div></header>`;
}

function footer(x) {
  const { s } = x, k = s.contact;
  return `<footer class="site-foot"><div class="wrap foot-grid"><div class="foot-brand"><img src="/brand/fts-logo-white.png" alt="Fly To Sky" class="foot-logo" loading="lazy"><p class="foot-title">${esc(s.site.title)}</p><p><strong>Đơn vị vận hành:</strong> ${esc(s.site.operator)}</p><p><strong>Đơn vị chủ quản:</strong> ${esc(s.site.owner)}</p></div><div><h3>Cổng tra cứu</h3><ul>${NAV.slice(1).map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div><div><h3>Kênh chính thức</h3><ul>${(k.links || []).map(l => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></div><div><h3>Liên hệ</h3><ul>${(k.phones || []).map(p => `<li><a href="tel:${esc(String(p).replace(/\D/g, ''))}">${esc(p)}</a></li>`).join('')}${(k.emails || []).map(e => `<li><a href="mailto:${esc(e)}">${esc(e)}</a></li>`).join('')}</ul></div></div><div class="wrap foot-legal"><div>${(k.offices || []).map(o => `<p><strong>${esc(o.label)}:</strong> ${esc(o.value)}</p>`).join('')}<p>${esc(k.legalName)} · ${esc(k.taxNote)}</p><p class="motto">${esc(k.about)}</p></div><div class="foot-base"><span>© ${new Date().getFullYear()} ${esc(s.site.owner)}. Bảo lưu mọi quyền.</span><span>${esc(k.motto)}</span></div></div></footer>`;
}

const page = (x, meta, bodyClass, main, scripts = '') =>
  head(x, meta) + `<body class="${bodyClass}"><a class="skip" href="#main">Bỏ qua menu</a>${header(x)}<main id="main">${main}</main>${footer(x)}<script src="/assets/site.js?v=${V}" defer></script>${scripts}</body></html>`;

const searchForm = (q = '', big = false) => `<form class="lk-form${big ? ' lk-big' : ''}" action="/tra-cuu" method="get" role="search"><label class="sr" for="q">Số điện thoại, họ tên hoặc mã giấy</label><input id="q" name="q" value="${esc(q)}" placeholder="Ví dụ: 0935.939.446, Nguyễn Văn A hoặc FTS-2026-1234567" autocomplete="off" required minlength="2" maxlength="80"><button class="btn btn-accent" type="submit">${ICON.search}<span>Tra cứu</span></button></form>`;

// Mô tả dự án là văn bản thuần: dòng trống tách đoạn, dòng bắt đầu bằng "- " là gạch đầu dòng, **chữ** là in đậm.
function paras(text) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return String(text).split(/\n\s*\n/).map(b => {
    let lines = b.split('\n').map(l => l.trim()).filter(Boolean), out = '';
    if (lines[0] && lines[0].startsWith('## ')) { out = `<h3>${inline(lines[0].slice(3))}</h3>`; lines = lines.slice(1); }
    if (!lines.length) return out;
    if (lines.every(l => l.startsWith('- '))) return out + '<ul>' + lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>';
    return out + `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

// ---------- Dự án ----------
function countdown(c) {
  if (!c.end_at) return '';
  return `<p class="cd" data-end="${esc(c.end_at)}">Kết thúc lúc ${esc(fmtDateTime(c.end_at))}</p>`;
}
const pct = (raised, goal) => goal > 0 ? Math.min(100, Math.round(raised / goal * 1000) / 10) : 0;
export const campaignState = c => {
  const now = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 16);
  if (c.status === 'closed' || (c.end_at && c.end_at < now)) return 'closed';
  if (c.start_at && c.start_at > now) return 'upcoming';
  return 'open';
};
const stateChip = st => ({ open: '<span class="chip chip-live"><i></i>Đang kêu gọi</span>', upcoming: '<span class="chip">Sắp mở</span>', closed: '<span class="chip chip-end">Đã kết thúc</span>' })[st];

function campaignCard(c) {
  const st = campaignState(c), p = pct(c.raised, c.goal);
  return `<article class="camp"><a class="camp-img" href="/du-an/${esc(c.slug)}">${c.cover ? `<img src="${esc(c.cover)}" alt="" loading="lazy">` : `<span class="camp-ph">${ICON.heart}</span>`}</a><div class="camp-body">${stateChip(st)}<h3><a href="/du-an/${esc(c.slug)}">${esc(c.title)}</a></h3>${c.summary ? `<p class="camp-sum">${esc(c.summary)}</p>` : ''}<dl class="camp-facts">${c.start_at ? `<div><dt>Bắt đầu</dt><dd>${esc(fmtDateTime(c.start_at))}</dd></div>` : ''}${c.end_at ? `<div><dt>Kết thúc</dt><dd>${esc(fmtDateTime(c.end_at))}</dd></div>` : ''}${c.memo_prefix ? `<div><dt>Cú pháp</dt><dd><code>${esc(c.memo_prefix)}</code> + SĐT</dd></div>` : ''}</dl>${st === 'open' ? countdown(c) : ''}${c.kind === 'money' && c.goal > 0 ? `<div class="bar"><span style="width:${p}%"></span></div><p class="bar-meta"><span>Đã nhận <b>${esc(vnd(c.raised))}</b></span><span>${p}% / ${esc(vnd(c.goal))}</span></p>` : (c.kind === 'money' && c.raised > 0 ? `<p class="bar-meta"><span>Đã nhận <b>${esc(vnd(c.raised))}</b></span></p>` : '')}<a class="btn btn-ghost btn-sm" href="/du-an/${esc(c.slug)}">${st === 'open' && c.accept_donations && c.kind === 'money' ? 'Xem và ủng hộ' : 'Xem chi tiết'}</a></div></article>`;
}

// ---------- Trang chủ ----------
export function renderHome(x, campaigns) {
  const { s } = x, open = campaigns.filter(c => campaignState(c) !== 'closed');
  const src = s.sources || {};
  const kinds = [
    [ICON.doc, 'Giấy chứng nhận ủng hộ', 'Cấp cho nhà hảo tâm ủng hộ các dự án, chương trình của Hệ thống từ thiện Fly To Sky.', true],
    [ICON.book, 'GCN & Giấy xác nhận tài trợ – ' + (src.khuyendoc?.label || 'Tủ sách Bồ Câu Trắng'), 'Giấy chứng nhận ủng hộ và Giấy xác nhận tài trợ đã xuất tại dự án Tủ sách Bồ Câu Trắng.', src.khuyendoc?.enabled !== false],
    [ICON.people, 'Giấy chứng nhận tình nguyện viên', 'Giấy chứng nhận cấp cho thành viên, tình nguyện viên trên ' + (src.workspace?.label || 'FTS Workspace') + '.', src.workspace?.enabled !== false],
  ].filter(k => k[3]);
  const main = `<section class="hero"><div class="wrap hero-in"><p class="kicker">${esc(s.site.kicker)}</p><h1>${esc(s.site.title)}</h1><p class="lead">${esc(s.site.intro)}</p>${searchForm('', true)}<p class="fine">${esc(s.site.support)}</p><dl class="hero-org"><div><dt>Đơn vị vận hành</dt><dd>${esc(s.site.operator)}</dd></div><div><dt>Đơn vị chủ quản</dt><dd>${esc(s.site.owner)}</dd></div></dl></div></section>
  ${open.length ? `<section class="sec bg-paper"><div class="wrap"><div class="sec-head"><p class="kicker">Chung tay</p><h2>Các dự án đang kêu gọi quyên góp</h2><p class="lead">Chuyển khoản đúng cú pháp để được cấp Giấy chứng nhận điện tử tự động.</p></div><div class="camps">${open.map(campaignCard).join('')}</div><p class="center mt"><a class="btn btn-primary" href="/du-an">Tất cả dự án</a></p></div></section>` : ''}
  <section class="sec"><div class="wrap"><div class="sec-head"><p class="kicker">Một lần tra cứu</p><h2>Các loại giấy tra cứu được</h2></div><div class="kinds">${kinds.map(k => `<article class="kind"><span class="kind-ic">${k[0]}</span><h3>${esc(k[1])}</h3><p>${esc(k[2])}</p></article>`).join('')}</div></div></section>
  <section class="sec bg-tint" id="chong-gia"><div class="wrap split"><div><p class="kicker">Chống làm giả</p><h2>Mỗi giấy đều xác thực được</h2><p class="lead">Mỗi Giấy chứng nhận có mã riêng và mã QR gắn chữ ký số của hệ thống. Quét mã QR hoặc nhập mã giấy để đối chiếu với dữ liệu gốc. Thông tin trên giấy khác với trang xác thực là giấy không hợp lệ.</p><div class="btns mt"><a class="btn btn-primary" href="/xac-thuc">${ICON.qr}<span>Xác thực giấy</span></a><a class="btn btn-ghost" href="/sao-ke">Xem sao kê</a></div></div><ol class="steps"><li><b>Quét QR</b> trên giấy bằng camera điện thoại.</li><li><b>Đối chiếu</b> họ tên, số tiền, dự án, ngày cấp với trang xác thực.</li><li><b>Báo ngay</b> cho Fly To Sky nếu thấy sai khác.</li></ol></div></section>`;
  return page(x, { title: s.site.title }, 'home', main);
}

// ---------- Tra cứu ----------
export function renderLookup(x, q) {
  const { s } = x;
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">${esc(s.site.kicker)}</p><h1>Tra cứu Giấy chứng nhận</h1><p class="lead">Nhập số điện thoại, họ tên hoặc mã giấy. Số điện thoại viết kiểu nào cũng được. Kết quả gồm giấy của Fly To Sky, Tủ sách Bồ Câu Trắng và FTS Workspace.</p>${searchForm(q)}<p class="fine">${esc(s.site.support)}</p></div></section><section class="sec bg-paper lk-sec"><div class="wrap"><div id="lkOut" aria-live="polite"></div></div></section>`;
  return page(x, { title: 'Tra cứu Giấy chứng nhận | ' + s.site.owner, noindex: !!q }, 'page', main);
}

// ---------- Danh sách & chi tiết dự án ----------
export function renderCampaignList(x, campaigns) {
  const groups = [['open', 'Đang kêu gọi'], ['upcoming', 'Sắp mở'], ['closed', 'Đã kết thúc']]
    .map(([k, l]) => [l, campaigns.filter(c => campaignState(c) === k)]).filter(g => g[1].length);
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">Chung tay cùng Fly To Sky</p><h1>Dự án kêu gọi quyên góp</h1><p class="lead">Mỗi khoản ủng hộ đúng cú pháp được đối soát sao kê và cấp Giấy chứng nhận điện tử tự động.</p></div></section><section class="sec bg-paper"><div class="wrap">${groups.length ? groups.map(([l, list]) => `<h2 class="grp">${esc(l)}</h2><div class="camps">${list.map(campaignCard).join('')}</div>`).join('') : '<p class="empty">Hiện chưa có dự án đang kêu gọi.</p>'}</div></section>`;
  return page(x, { title: 'Dự án kêu gọi quyên góp | ' + x.s.site.owner }, 'page', main);
}

export function renderCampaign(x, c) {
  const { s } = x, st = campaignState(c), p = pct(c.raised, c.goal), b = s.bank;
  const donate = c.kind === 'money' && c.accept_donations && st === 'open' && c.memo_prefix;
  const amounts = (s.donate.amounts || []).map(a => `<button type="button" class="amt" data-v="${Number(a)}">${esc(Number(a).toLocaleString('vi-VN'))}</button>`).join('');
  const form = donate ? `<div class="don" id="ung-ho"><h2>Ủng hộ dự án</h2><p class="fine">${esc(s.donate.note)}</p><form id="donForm" data-campaign="${c.id}"><label class="fl"><span>Họ và tên (in trên Giấy chứng nhận) *</span><input name="name" required maxlength="160" autocomplete="name"></label><div class="f2"><label class="fl"><span>Số điện thoại *</span><input name="phone" required inputmode="tel" autocomplete="tel" maxlength="20"></label><label class="fl"><span>Email</span><input name="email" type="email" maxlength="160" autocomplete="email"></label></div><label class="fl"><span>Chức vụ, đơn vị (nếu muốn in lên giấy)</span><input name="org" maxlength="200"></label><fieldset class="fl"><legend>Số tiền ủng hộ (VNĐ) *</legend><div class="amts">${amounts}</div><input name="amount" required inputmode="numeric" placeholder="Hoặc nhập số khác" data-min="${Number(s.donate.minAmount) || 0}"></fieldset><button class="btn btn-accent btn-block" type="submit">Tạo mã QR chuyển khoản</button><p class="err" hidden></p></form><div id="donPay" hidden></div></div>` : '';
  const bankBox = c.kind === 'money' && c.memo_prefix ? `<div class="bank"><h3>Thông tin chuyển khoản</h3><dl><div><dt>Ngân hàng</dt><dd>${esc(b.name)}</dd></div><div><dt>Số tài khoản</dt><dd><b class="copy" data-copy="${esc(b.account)}">${esc(b.account)}</b></dd></div><div><dt>Chủ tài khoản</dt><dd>${esc(b.holder)}</dd></div><div><dt>Nội dung</dt><dd><code class="copy" data-copy="${esc(c.memo_prefix)} ">${esc(c.memo_prefix)}</code> + số điện thoại của bạn</dd></div></dl><p class="fine">Ví dụ: <code>${esc(c.memo_prefix)} 0935939446</code>. Ghi đúng số điện thoại để nhận Giấy chứng nhận tự động.</p></div>` : '';
  const main = `<section class="hero hero-sm${c.cover ? ' hero-img' : ''}">${c.cover ? `<img class="hero-bg" src="${esc(c.cover)}" alt="">` : ''}<div class="wrap"><p><a class="back" href="/du-an">← Dự án kêu gọi</a></p>${stateChip(st)}<h1>${esc(c.title)}</h1>${c.summary ? `<p class="lead">${esc(c.summary)}</p>` : ''}</div></section><section class="sec bg-paper"><div class="wrap cdetail"><div class="cd-main"><div class="card"><dl class="camp-facts">${c.start_at ? `<div><dt>Bắt đầu</dt><dd>${esc(fmtDateTime(c.start_at))}</dd></div>` : ''}${c.end_at ? `<div><dt>Kết thúc</dt><dd>${esc(fmtDateTime(c.end_at))}</dd></div>` : ''}${c.goal > 0 ? `<div><dt>Mục tiêu</dt><dd>${esc(vnd(c.goal))}</dd></div>` : ''}</dl>${st === 'open' ? countdown(c) : ''}${c.kind === 'money' ? `<div class="bar bar-lg"><span style="width:${p}%"></span></div><p class="bar-meta"><span>Đã nhận <b>${esc(vnd(c.raised))}</b></span>${c.goal > 0 ? `<span>${p}%</span>` : ''}</p>` : ''}</div>${c.description ? `<div class="rich card">${paras(c.description)}</div>` : ''}${bankBox}</div><aside class="cd-side">${form || `<div class="card"><h3>Tra cứu giấy của dự án</h3><p>Đã tham gia hoặc ủng hộ dự án? Tra cứu Giấy chứng nhận bằng số điện thoại hoặc họ tên.</p>${searchForm()}</div>`}</aside></div></section>`;
  return page(x, { title: c.title + ' | ' + s.site.owner, desc: c.summary }, 'page', main, donate ? `<script src="/assets/donate.js?v=${V}" defer></script>` : '');
}

// ---------- Sao kê ----------
export function renderStatement(x) {
  const st = x.s.statement;
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">Minh bạch</p><h1>${esc(st.title)}</h1><p class="lead">${esc(st.lead)}</p></div></section><section class="sec bg-paper"><div class="wrap"><div class="frame">${/^https:\/\//.test(st.embed) ? `<iframe src="${esc(st.embed)}" title="${esc(st.title)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : '<p class="empty">Chưa cấu hình trang sao kê.</p>'}</div><p class="fine center"><a href="${esc(st.embed)}" target="_blank" rel="noopener">Mở sao kê trong cửa sổ mới ↗</a></p></div></section>`;
  return page(x, { title: st.title + ' | ' + x.s.site.owner }, 'page', main);
}

// ---------- Xác thực ----------
export function renderVerifyForm(x, code = '', msg = '') {
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">${ICON.shield} Chống làm giả</p><h1>Xác thực Giấy chứng nhận</h1><p class="lead">Quét mã QR in trên giấy, hoặc nhập mã giấy và mã xác thực (nếu có) để đối chiếu với dữ liệu gốc.</p><form class="lk-form vf" action="/xac-thuc" method="get"><label class="sr" for="code">Mã giấy</label><input id="code" name="code" value="${esc(code)}" placeholder="Mã giấy, ví dụ FTS-2026-1234567" required maxlength="60"><label class="sr" for="s">Mã xác thực</label><input id="s" name="s" placeholder="Mã xác thực (12 ký tự, không bắt buộc)" maxlength="12"><button class="btn btn-accent" type="submit">${ICON.shield}<span>Xác thực</span></button></form>${msg ? `<p class="alert">${esc(msg)}</p>` : ''}<div class="scan"><button type="button" class="btn btn-glass btn-sm" id="scanBtn">${ICON.qr}<span>Quét QR bằng camera</span></button><video id="scanVideo" playsinline hidden></video></div></div></section>`;
  return page(x, { title: 'Xác thực Giấy chứng nhận | ' + x.s.site.owner }, 'page', main, `<script src="/assets/scan.js?v=${V}" defer></script>`);
}

export function renderVerify(x, c, state, tpl) {
  const { s } = x;
  const msgs = {
    valid: ['Giấy chứng nhận hợp lệ', 'Thông tin dưới đây khớp với dữ liệu gốc của Hệ thống từ thiện Fly To Sky.'],
    unsigned: ['Giấy chứng nhận có trong hệ thống', 'Mã giấy có trong dữ liệu gốc. Hãy đối chiếu kỹ từng thông tin; quét mã QR trên giấy để xác thực đầy đủ.'],
    invalid: ['Không xác thực được', 'Không tìm thấy giấy với mã này, hoặc mã xác thực không đúng. Giấy có thể đã bị làm giả hoặc chỉnh sửa.'],
    revoked: ['Giấy chứng nhận đã bị thu hồi', 'Giấy này không còn hiệu lực.'],
  }[state];
  const v = c && state !== 'invalid' ? certValues(s, c) : null;
  const ok = state === 'valid' || state === 'unsigned';
  const info = `<div class="ver ver-${state}"><div class="ver-top"><div class="ver-ic">${ok ? ICON.check : '!'}</div><div><h1>${esc(msgs[0])}</h1><p>${esc(msgs[1])}</p>${state === 'revoked' && c.revoke_reason ? `<p><b>Lý do:</b> ${esc(c.revoke_reason)}</p>` : ''}</div></div>${v ? `<dl class="profile"><div><dt>Mã giấy</dt><dd><b>${esc(c.code)}</b></dd></div>${state === 'valid' ? `<div><dt>Mã xác thực</dt><dd><code>${esc(c.sig)}</code></dd></div>` : ''}<div><dt>Họ tên</dt><dd>${esc(v.name)}${v.org ? '<br><span class="muted">' + esc(v.org) + '</span>' : ''}</dd></div><div><dt>Ghi nhận</dt><dd>${esc(v.amount)}</dd></div><div><dt>Dự án, chương trình</dt><dd>${esc(v.project)}</dd></div><div><dt>Ngày cấp</dt><dd>${esc(v.date)}</dd></div>${v.phone ? `<div><dt>Số điện thoại</dt><dd>${esc(v.phone)}</dd></div>` : ''}<div><dt>Đơn vị cấp</dt><dd>${esc(s.site.owner)}</dd></div></dl>${c.history && c.history !== '[]' ? `<p class="fine">Thông tin đã được điều chỉnh ${JSON.parse(c.history).length} lần, mã giấy giữ nguyên.</p>` : ''}` : ''}<p class="ver-more"><a href="/xac-thuc">Xác thực giấy khác</a> · <a href="/tra-cuu">Tra cứu</a></p></div>`;
  let fig = '';
  if (ok && tpl) {
    const data = {
      tpl: { background: tpl.background, width: tpl.width, height: tpl.height, fields: (tpl.fields || []).filter(f => f.visible !== false) },
      values: v,
      images: { qr: 'data:image/svg+xml;utf8,' + encodeURIComponent(qrSvg(x.origin + `/xac-thuc/${codePath(c.code)}?s=${c.sig}`, { dark: '#000', level: 'M', border: 2 })), signature: s.cert.signature || '', stamp: s.cert.stamp || '' },
      fonts: [s.theme.fontHeading, s.theme.fontBody], file: c.code,
    };
    fig = `<div class="cv-fig"><div class="cv-img"><canvas id="certCanvas" aria-label="Giấy chứng nhận ${esc(c.code)}"></canvas><p class="cv-wait">Đang dựng giấy chứng nhận…</p></div><div class="btns cv-btns"><button class="btn btn-primary btn-sm" id="dlPdf" type="button" disabled>Tải PDF</button><button class="btn btn-ghost btn-sm" id="dlPng" type="button" disabled>Tải ảnh</button>${c.file_url ? `<a class="btn btn-ghost btn-sm" href="${esc(c.file_url)}" target="_blank" rel="noopener">Xem bản gốc ↗</a>` : ''}</div><script type="application/json" id="certData">${JSON.stringify(data).replace(/</g, '\\u003c')}</script></div>`;
  } else if (ok && c.file_url) {
    fig = `<div class="cv-fig"><div class="card center"><p>Bản giấy gốc được lưu tại kho tài liệu của Fly To Sky.</p><a class="btn btn-primary" href="${esc(c.file_url)}" target="_blank" rel="noopener">Xem Giấy chứng nhận ↗</a></div></div>`;
  }
  const main = `<section class="sec bg-paper cert-main"><div class="wrap"><div class="${fig ? 'cv' : 'cv-one'}">${fig}${info}</div></div></section>`;
  return page(x, { title: 'Xác thực Giấy chứng nhận | ' + s.site.owner, noindex: true }, 'page cert-page', main, fig.includes('certCanvas') ? `<script src="/assets/cert.js?v=${V}" defer></script>` : '');
}

export function render404(x) {
  const main = `<section class="sec bg-paper nf"><div class="wrap center"><h1>404</h1><p class="lead">Không tìm thấy trang bạn cần.</p><div class="btns center-btns"><a class="btn btn-primary" href="/">Về trang chủ</a><a class="btn btn-ghost" href="/tra-cuu">Tra cứu</a></div></div></section>`;
  return page(x, { title: 'Không tìm thấy | ' + x.s.site.owner, noindex: true }, 'page', main);
}

export { IMAGE_KEYS, fmtDate };
