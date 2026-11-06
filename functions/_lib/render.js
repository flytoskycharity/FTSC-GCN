// Dựng HTML phía máy chủ cho các trang công khai. Giao diện đồng bộ với website Tủ sách Bồ Câu Trắng (Khuyendoc).
import { esc, fmtDate, fmtDateTime, vnd, codePath, unitsOf, unitNote } from './util.js';
import { certValues, IMAGE_KEYS } from './certs.js';
import { qrSvg } from './qr.js';
import { tracked } from './news.js';
import { docKindLabel, docUrl, DOC_TYPES, NEAC_URL, parseSig } from './docs.js';

const V = '2';
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

const NAV = [['/', 'Trang chủ'], ['/tra-cuu', 'Tra cứu & kiểm tra giấy'], ['/du-an', 'Dự án kêu gọi'], ['/ung-ho', 'Quyên góp'], ['/sao-ke', 'Sao kê']];
function header(x) {
  const on = h => (h === '/' ? x.path === '/' : x.path.startsWith(h)) ? ' class="on" aria-current="page"' : '';
  return `<header class="site-head"><div class="wrap head-in"><a class="logo" href="/" aria-label="${esc(x.s.site.owner)}"><img src="/brand/fts-logo-pair.png" alt="Fly To Sky" width="138" height="52"><span class="logo-t"><b>${esc(x.s.site.shortTitle)}</b><small>${esc(x.s.site.owner)}</small></span></a><nav class="main-nav" id="mainNav" aria-label="Menu chính"><ul>${NAV.map(([h, l]) => `<li><a href="${h}"${on(h)}>${esc(l)}</a></li>`).join('')}</ul></nav><div class="head-actions"><a class="btn btn-accent btn-sm head-cta" href="/ung-ho">${ICON.heart}<span>Ủng hộ</span></a><button class="burger" type="button" aria-controls="mainNav" aria-expanded="false" aria-label="Mở menu"><span></span><span></span><span></span></button></div></div></header>`;
}

function footer(x) {
  const { s } = x, k = s.contact;
  return `<footer class="site-foot"><div class="wrap foot-grid"><div class="foot-brand"><img src="/brand/fts-logo-pair-white.png" alt="Fly To Sky" class="foot-logo" loading="lazy"><p class="foot-title">${esc(s.site.title)}</p><p><strong>Đơn vị vận hành:</strong> ${esc(s.site.operator)}</p><p><strong>Đơn vị chủ quản:</strong> ${esc(s.site.owner)}</p></div><div><h3>Cổng tra cứu</h3><ul>${NAV.slice(1).map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div><div><h3>Kênh chính thức</h3><ul>${(k.links || []).map(l => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></div><div><h3>Liên hệ</h3><ul>${(k.phones || []).map(p => `<li><a href="tel:${esc(String(p).replace(/\D/g, ''))}">${esc(p)}</a></li>`).join('')}${(k.emails || []).map(e => `<li><a href="mailto:${esc(e)}">${esc(e)}</a></li>`).join('')}</ul></div></div><div class="wrap foot-legal"><div>${(k.offices || []).map(o => `<p><strong>${esc(o.label)}:</strong> ${esc(o.value)}</p>`).join('')}<p>${esc(k.legalName)} · ${esc(k.taxNote)}</p><p class="motto">${esc(k.about)}</p></div><div class="foot-base"><span>© ${new Date().getFullYear()} ${esc(s.site.owner)}. Bảo lưu mọi quyền.</span><span>${esc(k.motto)}</span></div></div></footer>`;
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

// Thông tin bổ sung của dự án liên kết từ Khuyendoc: số liệu trường, dự toán, bảng quyền lợi theo hạng, kế hoạch.
function extInfo(c) { try { return c.ext_data ? JSON.parse(c.ext_data) : {}; } catch { return {}; } }
function extTables(e) {
  if (!e || !e.tiers) return '';
  const money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ', d = v => fmtDate(v);
  const facts = (e.facts || []).length ? `<div class="card"><h3>Thông tin trường</h3><div class="facts">${e.facts.map(f => `<div><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join('')}</div></div>` : '';
  const total = (e.budget || []).reduce((n, b) => n + (Number(b.amount) || 0), 0);
  const budget = (e.budget || []).length ? `<div class="card"><h3>Dự toán</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Hạng mục</th><th>Số lượng</th><th class="r">Kinh phí</th></tr></thead><tbody>${e.budget.map(b => `<tr><td>${esc(b.title)}</td><td>${esc(Number(b.quantity || 0).toLocaleString('vi-VN'))} ${esc(b.unit)}</td><td class="r">${esc(money(b.amount))}</td></tr>`).join('')}<tr class="sum"><td colspan="2">Tổng cộng</td><td class="r">${esc(money(total))}</td></tr></tbody></table></div></div>` : '';
  const matrix = (e.matrix || []).filter(r => (r.values || []).some(v => v && v !== '—'));
  const ben = matrix.length ? `<div class="card"><h3>Quyền lợi nhà tài trợ theo hạng</h3><div class="tbl-wrap"><table class="tbl mx"><thead><tr><th>Quyền lợi</th>${e.tiers.map(t => `<th>${esc(t.name)}<small>từ ${esc(money(t.minimum))}</small></th>`).join('')}</tr></thead><tbody>${matrix.map(r => `<tr><td>${esc(r.label)}</td>${e.tiers.map((t, i) => { const v = (r.values || [])[i] || '—'; return `<td class="${v === '—' ? 'no' : 'yes'}">${esc(v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>${e.matrixNote ? `<p class="fine">${esc(e.matrixNote)}</p>` : ''}</div>` : '';
  const plan = (e.plan || []).length ? `<div class="card"><h3>Kế hoạch triển khai</h3><ol class="plan">${e.plan.map(p => `<li class="${p.done ? 'done' : ''}"><b>${esc(d(p.from))}${p.to && p.to !== p.from ? ' – ' + esc(d(p.to)) : ''}</b><span>${esc(p.text)}</span></li>`).join('')}</ol></div>` : '';
  return facts + budget + ben + plan;
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
  return `<article class="camp" data-q="${esc([c.title, c.summary, c.memo_prefix, c.external_memo].join(' '))}"><a class="camp-img" href="/du-an/${esc(c.slug)}">${c.cover ? `<img src="${esc(c.cover)}" alt="" loading="lazy">` : `<span class="camp-ph">${ICON.heart}</span>`}</a><div class="camp-body">${stateChip(st)}<h3><a href="/du-an/${esc(c.slug)}">${esc(c.title)}</a></h3>${c.summary ? `<p class="camp-sum">${esc(c.summary)}</p>` : ''}<dl class="camp-facts">${c.start_at ? `<div><dt>Bắt đầu</dt><dd>${esc(fmtDateTime(c.start_at))}</dd></div>` : ''}${c.end_at ? `<div><dt>Kết thúc</dt><dd>${esc(fmtDateTime(c.end_at))}</dd></div>` : ''}${c.memo_prefix || c.external_memo ? `<div><dt>Cú pháp</dt><dd><code>${esc(c.memo_prefix || c.external_memo)}</code> + SĐT</dd></div>` : ''}${unitNote(c) ? `<div><dt>Quy đổi</dt><dd>${esc(unitNote(c))}</dd></div>` : ''}${c.external_url ? '<div><dt>Thuộc</dt><dd>Tủ sách Bồ Câu Trắng</dd></div>' : ''}</dl>${st === 'open' ? countdown(c) : ''}${c.kind === 'money' && c.goal > 0 ? `<div class="bar"><span style="width:${p}%"></span></div><p class="bar-meta"><span>Đã nhận <b>${esc(vnd(c.raised))}</b>${unitsOf(c.raised, c) ? ` ≈ ${esc(unitsOf(c.raised, c))}` : ''}</span><span>${p}% / ${esc(vnd(c.goal))}</span></p>` : (c.kind === 'money' && c.raised > 0 ? `<p class="bar-meta"><span>Đã nhận <b>${esc(vnd(c.raised))}</b></span></p>` : '')}<a class="btn btn-ghost btn-sm" href="/du-an/${esc(c.slug)}${st === 'open' && (c.accept_donations || c.external_url) && c.kind === 'money' ? '#ung-ho' : ''}">${st === 'open' && (c.accept_donations || c.external_url) && c.kind === 'money' ? 'Xem và ủng hộ' : 'Xem chi tiết'}</a></div></article>`;
}

function fundCard(c) {
  return `<article class="camp camp-fund"><a class="camp-img" href="/ung-ho">${c.cover ? `<img src="${esc(c.cover)}" alt="" loading="lazy">` : `<span class="camp-ph">${ICON.heart}<b>Đồng hành cùng Fly To Sky</b></span>`}</a><div class="camp-body"><span class="chip chip-live"><i></i>Luôn mở</span><h3><a href="/ung-ho">${esc(c.title)}</a></h3>${c.summary ? `<p class="camp-sum">${esc(c.summary)}</p>` : ''}<dl class="camp-facts"><div><dt>Cú pháp</dt><dd><code>${esc(c.memo_prefix)}</code> + SĐT</dd></div></dl>${c.raised > 0 ? `<p class="bar-meta"><span>Đã nhận <b>${esc(vnd(c.raised))}</b></span></p>` : ''}<a class="btn btn-accent btn-sm" href="/ung-ho">Đồng hành ngay</a></div></article>`;
}

function newsBlock(x, news) {
  const n = x.s.news || {};
  if (!news.length) return '';
  const date = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }); };
  return `<section class="sec bg-paper" id="ban-tin"><div class="wrap"><div class="sec-head row-head"><div><p class="kicker">Bản tin</p><h2>${esc(n.title)}</h2>${n.lead ? `<p class="lead">${esc(n.lead)}</p>` : ''}</div><a class="btn btn-ghost" href="${esc(tracked(n.site || n.rss))}" target="_blank" rel="noopener">Xem tất cả bản tin ↗</a></div><div class="news">${news.map(i => `<a class="news-card" href="${esc(tracked(i.link))}" target="_blank" rel="noopener">${i.image ? `<span class="news-img"><img src="${esc(i.image)}" alt="" loading="lazy"></span>` : ''}<span class="news-body">${i.category ? `<span class="chip">${esc(i.category)}</span>` : ''}<b>${esc(i.title)}</b>${i.desc ? `<span class="news-desc">${esc(i.desc)}</span>` : ''}<span class="news-meta">${esc(date(i.date))} · Đọc tiếp ↗</span></span></a>`).join('')}</div></div></section>`;
}

// ---------- Trang chủ ----------
export function renderHome(x, campaigns, fund, news = []) {
  const { s } = x, open = campaigns.filter(c => campaignState(c) !== 'closed');
  const src = s.sources || {};
  const kinds = [
    [ICON.doc, 'Giấy chứng nhận ủng hộ', 'Cấp cho nhà hảo tâm ủng hộ các dự án, chương trình của Hệ thống từ thiện Fly To Sky.', true],
    [ICON.book, 'GCN & Giấy xác nhận tài trợ – ' + (src.khuyendoc?.label || 'Tủ sách Bồ Câu Trắng'), 'Giấy chứng nhận ủng hộ và Giấy xác nhận tài trợ đã xuất tại dự án Tủ sách Bồ Câu Trắng.', src.khuyendoc?.enabled !== false],
    [ICON.people, 'Giấy chứng nhận tình nguyện viên', 'Giấy chứng nhận cấp cho thành viên, tình nguyện viên trên ' + (src.workspace?.label || 'FTS Workspace') + '.', src.workspace?.enabled !== false],
  ].filter(k => k[3]);
  const main = `<section class="hero"><div class="wrap hero-in"><p class="kicker">${esc(s.site.kicker)}</p><h1>${esc(s.site.title)}</h1><p class="lead">${esc(s.site.intro)}</p>${searchForm('', true)}<p class="fine">${esc(s.site.support)}</p><dl class="hero-org"><div><dt>Đơn vị vận hành</dt><dd>${esc(s.site.operator)}</dd></div><div><dt>Đơn vị chủ quản</dt><dd>${esc(s.site.owner)}</dd></div></dl></div></section>
  ${open.length || fund ? `<section class="sec bg-paper"><div class="wrap"><div class="sec-head"><p class="kicker">Chung tay</p><h2>Các dự án đang kêu gọi quyên góp</h2><p class="lead">Chuyển khoản đúng cú pháp để được cấp Giấy chứng nhận điện tử tự động.</p></div><div class="camps">${fund ? fundCard(fund) : ''}${open.map(campaignCard).join('')}</div><p class="center mt"><a class="btn btn-primary" href="/du-an">Tất cả dự án</a> <a class="btn btn-ghost" href="/ung-ho">Quyên góp</a></p></div></section>` : ''}
  <section class="sec"><div class="wrap"><div class="sec-head"><p class="kicker">Một lần tra cứu</p><h2>Các loại giấy tra cứu được</h2></div><div class="kinds">${kinds.map(k => `<article class="kind"><span class="kind-ic">${k[0]}</span><h3>${esc(k[1])}</h3><p>${esc(k[2])}</p></article>`).join('')}</div></div></section>
  <section class="sec about"><div class="wrap split"><div><p class="kicker">Về chúng tôi</p><h2>Hệ thống từ thiện Fly To Sky</h2><p class="lead">${esc(s.contact.about)} Tìm hiểu hành trình, các chương trình, giải thưởng và đối tác của Fly To Sky.</p><div class="btns mt"><a class="btn btn-primary" href="${esc(s.site.aboutUrl || 'https://info.flytoskycharity.vn/')}" target="_blank" rel="noopener">Xem thêm về Fly To Sky ↗</a><a class="btn btn-ghost" href="${esc(s.contact.website)}" target="_blank" rel="noopener">Website Fly To Sky ↗</a></div></div><div class="about-logo"><img src="/brand/fts-logo-pair.png" alt="Fly To Sky" loading="lazy"></div></div></section>
  ${newsBlock(x, news)}
  <section class="sec bg-tint" id="chong-gia"><div class="wrap split"><div><p class="kicker">Chống làm giả</p><h2>Mỗi giấy đều kiểm tra được</h2><p class="lead">Mỗi Giấy chứng nhận có mã riêng và mã QR gắn chữ ký số của hệ thống. Tải lên ảnh chụp hoặc tệp PDF của giấy: hệ thống đọc mã QR, dựng lại giấy gốc và so từng dòng thông tin. Mã QR bị ghép từ giấy khác, hoặc nội dung bị sửa, đều bị phát hiện.</p><div class="btns mt"><a class="btn btn-primary" href="/tra-cuu?tab=kiem-tra">${ICON.qr}<span>Kiểm tra giấy</span></a><a class="btn btn-ghost" href="/sao-ke">Xem sao kê</a></div></div><ol class="steps"><li><b>Chụp thẳng toàn bộ tờ giấy</b>, rõ góc có mã QR, hoặc dùng tệp PDF.</li><li><b>Tải lên</b> ở thẻ Kiểm tra giấy.</li><li><b>Xem kết quả</b>: dòng nào sai được đánh dấu. Trường hợp sai được lưu lại để Fly To Sky xử lý.</li></ol></div></section>`;
  return page(x, { title: s.site.title }, 'home', main);
}

// ---------- Tra cứu & kiểm tra giấy (một trang, hai thẻ) ----------
export function renderLookup(x, q, tab) {
  const { s } = x, ck = tab === 'kiem-tra';
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">${esc(s.site.kicker)}</p><h1>Tra cứu Giấy chứng nhận</h1><p class="lead">Nhập số điện thoại, họ tên hoặc mã giấy. Số điện thoại viết kiểu nào cũng được. Kết quả gồm giấy của Fly To Sky, Tủ sách Bồ Câu Trắng và FTS Workspace.</p><div class="seg-tabs" role="tablist"><button type="button" role="tab" data-pane="lk" class="${ck ? '' : 'on'}" aria-selected="${!ck}">${ICON.search}<span>Tra cứu</span></button><button type="button" role="tab" data-pane="ck" class="${ck ? 'on' : ''}" aria-selected="${ck}">${ICON.shield}<span>Kiểm tra giấy</span></button></div><div id="lk"${ck ? ' hidden' : ''}>${searchForm(q)}</div><div id="ck" class="ck"${ck ? '' : ' hidden'}><p>Tải lên ảnh chụp hoặc tệp PDF Giấy chứng nhận. Hệ thống đọc mã QR, dựng lại giấy gốc và so từng dòng thông tin để phát hiện giấy giả, giấy bị sửa.</p><div class="btns"><label class="btn btn-accent">${ICON.doc}<span>Chọn ảnh hoặc PDF</span><input type="file" id="ckFile" accept="image/*,application/pdf" hidden></label><label class="btn btn-glass">${ICON.qr}<span>Chụp ảnh giấy</span><input type="file" id="ckCam" accept="image/*" capture="environment" hidden></label></div><p class="fine">Chụp thẳng, đủ cả tờ giấy, đủ sáng và rõ góc có mã QR.</p><form class="lk-form vf" action="/xac-thuc" method="get"><label class="sr" for="code">Mã giấy</label><input id="code" name="code" placeholder="Hoặc nhập mã giấy, ví dụ FTS-2026-1234567" required maxlength="80"><label class="sr" for="s">Mã xác thực</label><input id="s" name="s" placeholder="Mã xác thực (nếu có)" maxlength="12"><button class="btn btn-ghost-l" type="submit">Kiểm tra mã</button></form></div><p class="fine">${esc(s.site.support)}</p></div></section><section class="sec bg-paper lk-sec"><div class="wrap"><div id="lkOut" aria-live="polite"></div></div></section>`;
  return page(x, { title: 'Tra cứu & kiểm tra Giấy chứng nhận | ' + s.site.owner, noindex: !!q }, 'page', main, `<script src="/assets/cert.js?v=${V}" defer></script><script src="/assets/check.js?v=${V}" defer></script>`);
}

// ---------- Quyên góp ----------
// Biểu mẫu dùng chung cho trang /ung-ho (chọn Quỹ chung hoặc dự án) và trang chi tiết dự án (cố định dự án).
export function donateBlock(x, targets, selectedId, benefits, locked) {
  const D = x.s.donate, sel = targets.find(t => t.id == selectedId) || targets[0];
  const units = Object.fromEntries(targets.filter(t => Number(t.unit_price) > 0 && t.unit_name).map(t => [t.id, { price: Number(t.unit_price), name: t.unit_name, strict: !!t.unit_strict }]));
  const cfg = { min: Number(D.minAmount) || 0, confirmMin: Number(D.confirmMin) || 0, benefits, thanks: D.thanks, note: D.note, amounts: (D.amounts || []).map(Number), units };
  const amounts = (D.amounts || []).map(a => `<button type="button" class="amt" data-v="${Number(a)}">${esc(Number(a).toLocaleString('vi-VN'))}</button>`).join('');
  return `<div class="don" id="ung-ho"><form id="donForm" novalidate>${locked ? `<input type="hidden" name="campaign" value="${sel.id}"><h2>Ủng hộ dự án</h2>` : `<label class="fl"><span>Ủng hộ cho</span><select name="campaign">${targets.map(t => `<option value="${t.id}"${t.id === sel.id ? ' selected' : ''}>${esc(t.title)}</option>`).join('')}</select></label>`}
<fieldset class="fl"><legend>Bạn là</legend><div class="pills">${(D.donorTypes || []).map((d, i) => `<label><input type="radio" name="donorType" value="${esc(d.id)}"${i ? '' : ' checked'}><span>${esc(d.label)}</span></label>`).join('')}</div></fieldset>
<div class="f2"><label class="fl"><span id="nameLbl">Họ và tên (in trên Giấy chứng nhận) *</span><input name="name" required maxlength="160" autocomplete="name"></label><label class="fl"><span>Số điện thoại *</span><input name="phone" type="tel" inputmode="tel" required maxlength="20" autocomplete="tel"></label></div>
<div class="f2"><label class="fl"><span>Email <small>(không bắt buộc)</small></span><input name="email" type="email" maxlength="160" autocomplete="email"></label><label class="fl"><span>Chức vụ, đơn vị công tác/học tập <small>(không bắt buộc)</small></span><input name="position" maxlength="160"></label></div>
<div class="f2 only-biz" hidden><label class="fl"><span>Mã số thuế</span><input name="taxCode" maxlength="20"></label><label class="fl"><span>Địa chỉ</span><input name="address" maxlength="250"></label></div>
<fieldset class="fl"><legend>Số tiền ủng hộ (VNĐ) *</legend><div class="unit-box" hidden><p class="unit-note"></p><div class="qty"><button type="button" class="qbtn" data-d="-1" aria-label="Bớt">−</button><input name="qty" inputmode="numeric" value="1" aria-label="Số lượng"><span class="qty-name"></span><button type="button" class="qbtn" data-d="1" aria-label="Thêm">+</button></div></div><div class="amts">${amounts}</div><input name="amount" required inputmode="numeric" placeholder="Hoặc nhập số khác" autocomplete="off"><p class="unit-conv fine" hidden></p></fieldset>
<div class="ben"><h3>Quyền lợi của bạn</h3><ul id="benList"></ul></div>
<label class="chk only-confirm" hidden><input type="checkbox" name="wantsConfirm"><span>${esc(D.confirmLabel)}</span></label>
<p class="biz-note only-biz" hidden>${esc(D.businessNote)}</p>
<label class="fl"><span>Lời nhắn <small>(không bắt buộc)</small></span><textarea name="message" rows="2" maxlength="1000"></textarea></label>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn btn-accent btn-block" type="submit">Tạo mã QR quyên góp</button><p class="err" hidden></p></form><div id="donPay" hidden></div><script type="application/json" id="donCfg">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script></div>`;
}

export function renderDonate(x, targets, selectedId, benefits, external = []) {
  const { s } = x, b = s.bank;
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">Chung tay cùng Fly To Sky</p><h1>${esc(s.donate.title)}</h1><p class="lead">${esc(s.donate.lead)}</p></div></section><section class="sec bg-paper"><div class="wrap cdetail"><div class="cd-main">${targets.length ? donateBlock(x, targets, selectedId, benefits, false) : '<div class="card"><p>Hiện chưa có dự án nhận ủng hộ trực tuyến.</p></div>'}</div><aside class="cd-side"><div class="bank"><h3>Thông tin chuyển khoản</h3><dl><div><dt>Ngân hàng</dt><dd>${esc(b.name)}</dd></div><div><dt>Số tài khoản</dt><dd><b class="copy" data-copy="${esc(b.account)}">${esc(b.account)}</b></dd></div><div><dt>Chủ tài khoản</dt><dd>${esc(b.holder)}</dd></div></dl><p class="fine">Nội dung chuyển khoản gồm cú pháp của dự án và số điện thoại của bạn. Mã QR tạo ở bên cạnh đã điền sẵn.</p></div><div class="card"><h3>Cú pháp từng dự án</h3><ul class="memo-list">${targets.map(t => `<li><span>${esc(t.title)}</span><code class="copy" data-copy="${esc(t.memo_prefix)} ">${esc(t.memo_prefix)}</code></li>`).join('')}</ul><p class="fine">Ví dụ: <code>${esc(targets[0]?.memo_prefix || 'DONGHANH')} 0935939446</code></p></div>${external.length ? `<div class="card"><h3>Dự án Tủ sách Bồ Câu Trắng</h3><p class="fine">Ủng hộ trên trang của dự án, cú pháp <code>${esc(external[0].external_memo)} + SĐT</code>. Giấy chứng nhận tra cứu được ngay trên cổng này.</p><ul class="memo-list">${external.map(e => `<li><a href="/du-an/${esc(e.slug)}">${esc(e.title)}</a><a class="btn btn-ghost btn-sm" href="${esc(e.external_url)}" target="_blank" rel="noopener">Ủng hộ ↗</a></li>`).join('')}</ul></div>` : ''}<div class="card"><h3>Minh bạch</h3><p>Mọi khoản ủng hộ hiển thị trên <a href="/sao-ke">sao kê công khai</a>. Giấy chứng nhận tra cứu và kiểm tra được tại <a href="/tra-cuu">trang Tra cứu</a>.</p></div></aside></div></section>`;
  return page(x, { title: s.donate.title + ' | ' + s.site.owner, desc: s.donate.lead }, 'page', main, targets.length ? `<script src="/assets/donate.js?v=${V}" defer></script>` : '');
}

// ---------- Danh sách & chi tiết dự án ----------
export function renderCampaignList(x, campaigns) {
  const groups = [['open', 'Đang kêu gọi'], ['upcoming', 'Sắp mở'], ['closed', 'Đã kết thúc']]
    .map(([k, l]) => [l, campaigns.filter(c => campaignState(c) === k)]).filter(g => g[1].length);
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">Chung tay cùng Fly To Sky</p><h1>Dự án kêu gọi quyên góp</h1><p class="lead">Mỗi khoản ủng hộ đúng cú pháp được đối soát sao kê và cấp Giấy chứng nhận điện tử tự động.</p><form class="lk-form" role="search" onsubmit="return false"><label class="sr" for="campQ">Tìm dự án</label><input id="campQ" type="search" placeholder="Tìm dự án theo tên, tỉnh, cú pháp…" autocomplete="off"></form></div></section><section class="sec bg-paper"><div class="wrap">${groups.length ? groups.map(([l, list]) => `<h2 class="grp">${esc(l)}</h2><div class="camps">${list.map(campaignCard).join('')}</div>`).join('') : '<p class="empty">Hiện chưa có dự án đang kêu gọi.</p>'}</div></section>`;
  return page(x, { title: 'Dự án kêu gọi quyên góp | ' + x.s.site.owner }, 'page', main);
}

export function renderCampaign(x, c, benefits) {
  const { s } = x, st = campaignState(c), p = pct(c.raised, c.goal), b = s.bank;
  const donate = c.kind === 'money' && c.accept_donations && st === 'open' && c.memo_prefix;
  const memo = c.memo_prefix || c.external_memo, ext = extInfo(c);
  const extBox = c.external_url && st === 'open' ? `<div class="don" id="ung-ho"><h2>Ủng hộ dự án</h2><p>Dự án thuộc <b>${esc(ext.source || 'Tủ sách Bồ Câu Trắng')}</b>. Bạn ủng hộ trên trang của dự án: chọn mức, quét mã QR, Giấy chứng nhận được cấp tự động và tra cứu được ngay trên cổng này.</p><dl class="bank"><div><dt>Nội dung chuyển khoản</dt><dd><code class="copy" data-copy="${esc(c.external_memo)} ">${esc(c.external_memo)}</code> + số điện thoại</dd></div></dl><div class="btns mt"><a class="btn btn-accent btn-block" href="${esc(c.external_url)}" target="_blank" rel="noopener">Ủng hộ dự án ↗</a>${ext.url ? `<a class="btn btn-ghost btn-block" href="${esc(ext.url)}" target="_blank" rel="noopener">Xem trang dự án ↗</a>` : ''}</div></div>` : '';
  const bankBox = c.kind === 'money' && memo ? `<div class="bank"><h3>Thông tin chuyển khoản</h3><dl><div><dt>Ngân hàng</dt><dd>${esc(b.name)}</dd></div><div><dt>Số tài khoản</dt><dd><b class="copy" data-copy="${esc(b.account)}">${esc(b.account)}</b></dd></div><div><dt>Chủ tài khoản</dt><dd>${esc(b.holder)}</dd></div><div><dt>Nội dung</dt><dd><code class="copy" data-copy="${esc(memo)} ">${esc(memo)}</code> + số điện thoại của bạn</dd></div></dl><p class="fine">Ví dụ: <code>${esc(memo)} 0935939446</code>. Ghi đúng số điện thoại để nhận Giấy chứng nhận tự động.</p></div>` : '';
  const benBox = benefits.length ? `<div class="card"><h3>Quyền lợi khi ủng hộ</h3><ul class="ben-static">${benefits.map(r => `<li>${r.min ? `<b>Từ ${esc(r.min.toLocaleString('vi-VN'))}đ:</b> ` : ''}${esc(r.text)}</li>`).join('')}</ul></div>` : '';
  const main = `<section class="hero hero-sm${c.cover ? ' hero-img' : ''}">${c.cover ? `<img class="hero-bg" src="${esc(c.cover)}" alt="">` : ''}<div class="wrap"><p><a class="back" href="/du-an">← Dự án kêu gọi</a></p>${stateChip(st)}<h1>${esc(c.title)}</h1>${c.summary ? `<p class="lead">${esc(c.summary)}</p>` : ''}</div></section><section class="sec bg-paper"><div class="wrap cdetail"><div class="cd-main"><div class="card"><dl class="camp-facts">${c.start_at ? `<div><dt>Bắt đầu</dt><dd>${esc(fmtDateTime(c.start_at))}</dd></div>` : ''}${c.end_at ? `<div><dt>Kết thúc</dt><dd>${esc(fmtDateTime(c.end_at))}</dd></div>` : ''}${c.goal > 0 ? `<div><dt>Mục tiêu</dt><dd>${esc(vnd(c.goal))}${unitsOf(c.goal, c) ? ` (${esc(unitsOf(c.goal, c))})` : ''}</dd></div>` : ''}${unitNote(c) ? `<div><dt>Quy đổi</dt><dd>${esc(unitNote(c))}${c.unit_strict ? ' · nhận theo bội số' : ''}</dd></div>` : ''}</dl>${st === 'open' ? countdown(c) : ''}${c.kind === 'money' ? `<div class="bar bar-lg"><span style="width:${p}%"></span></div><p class="bar-meta"><span>Đã nhận <b>${esc(vnd(c.raised))}</b>${unitsOf(c.raised, c) ? ` ≈ ${esc(unitsOf(c.raised, c))}` : ''}</span>${c.goal > 0 ? `<span>${p}%</span>` : ''}</p>` : ''}</div>${c.description ? `<div class="rich card">${paras(c.description)}</div>` : ''}${extTables(ext)}${donate || ext.matrix ? '' : benBox}${bankBox}</div><aside class="cd-side">${extBox || (donate ? donateBlock(x, [c], c.id, { [c.id]: benefits }, true) : `<div class="card"><h3>Tra cứu giấy của dự án</h3><p>Đã tham gia hoặc ủng hộ dự án? Tra cứu Giấy chứng nhận bằng số điện thoại hoặc họ tên.</p>${searchForm()}</div>`)}</aside></div></section>`;
  return page(x, { title: c.title + ' | ' + s.site.owner, desc: c.summary }, 'page', main, donate ? `<script src="/assets/donate.js?v=${V}" defer></script>` : '');
}

// ---------- Sao kê ----------
export function renderStatement(x) {
  const st = x.s.statement;
  const main = `<section class="hero hero-sm"><div class="wrap"><p class="kicker">Minh bạch</p><h1>${esc(st.title)}</h1><p class="lead">${esc(st.lead)}</p></div></section><section class="sec bg-paper"><div class="wrap"><div class="frame">${/^https:\/\//.test(st.embed) ? `<iframe src="${esc(st.embed)}" title="${esc(st.title)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : '<p class="empty">Chưa cấu hình trang sao kê.</p>'}</div><p class="fine center"><a href="${esc(st.embed)}" target="_blank" rel="noopener">Mở sao kê trong cửa sổ mới ↗</a></p></div></section>`;
  return page(x, { title: st.title + ' | ' + x.s.site.owner }, 'page', main);
}

// ---------- Xác thực ----------
export function renderVerify(x, c, state, tpl) {
  const { s } = x;
  const msgs = {
    valid: [(c?.doc_file ? docKindLabel(c) : 'Giấy chứng nhận') + ' hợp lệ', 'Thông tin dưới đây khớp với dữ liệu gốc của Hệ thống từ thiện Fly To Sky.'],
    unsigned: ['Giấy chứng nhận có trong hệ thống', 'Mã giấy có trong dữ liệu gốc. Hãy đối chiếu kỹ từng thông tin; quét mã QR trên giấy để xác thực đầy đủ.'],
    invalid: ['Không xác thực được', 'Không tìm thấy giấy với mã này, hoặc mã xác thực không đúng. Giấy có thể đã bị làm giả hoặc chỉnh sửa.'],
    revoked: ['Giấy chứng nhận đã bị thu hồi', 'Giấy này không còn hiệu lực.'],
  }[state];
  const v = c && state !== 'invalid' ? certValues(s, c) : null;
  const ok = state === 'valid' || state === 'unsigned';
  const info = `<div class="ver ver-${state}"><div class="ver-top"><div class="ver-ic">${ok ? ICON.check : '!'}</div><div><h1>${esc(msgs[0])}</h1><p>${esc(msgs[1])}</p>${state === 'revoked' && c.revoke_reason ? `<p><b>Lý do:</b> ${esc(c.revoke_reason)}</p>` : ''}</div></div>${v ? `<dl class="profile"><div><dt>Mã giấy</dt><dd><b>${esc(c.code)}</b></dd></div>${state === 'valid' ? `<div><dt>Mã xác thực</dt><dd><code>${esc(c.sig)}</code></dd></div>` : ''}<div><dt>Họ tên</dt><dd>${esc(v.name)}${v.org ? '<br><span class="muted">' + esc(v.org) + '</span>' : ''}</dd></div><div><dt>Ghi nhận</dt><dd>${esc(v.amountFull || v.amount)}</dd></div><div><dt>Dự án, chương trình</dt><dd>${esc(v.project)}</dd></div><div><dt>Ngày cấp</dt><dd>${esc(v.date)}</dd></div>${v.phone ? `<div><dt>Số điện thoại</dt><dd>${esc(v.phone)}</dd></div>` : ''}<div><dt>Đơn vị cấp</dt><dd>${esc(s.site.owner)}</dd></div></dl>${c.history && c.history !== '[]' ? `<p class="fine">Thông tin đã được điều chỉnh ${JSON.parse(c.history).length} lần, mã giấy giữ nguyên.</p>` : ''}` : ''}<p class="ver-more"><a href="/tra-cuu?tab=kiem-tra">Kiểm tra giấy khác</a> · <a href="/tra-cuu">Tra cứu</a></p></div>`;
  let fig = '';
  if (state === 'valid' && c.doc_file) fig = docBlock(c);
  else if (ok && c.doc_file) fig = `<div class="cv-fig"><div class="card center"><p>Giấy có tệp gốc (${esc(docKindLabel(c))}). Để xem tệp, hãy mở bằng đường dẫn trong mã QR hoặc nhập thêm mã xác thực.</p></div></div>`;
  else if (ok && tpl) {
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

// Khối chữ ký số: kết quả kiểm tra ngay trên hệ thống + hướng dẫn kiểm tra lại tại NEAC.
export function sigPanel(sig, title = 'Kiểm tra chữ ký số') {
  if (!sig || !sig.signatures?.length) return '';
  const vt = v => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
  const yes = (b, t, f) => `<li class="${b ? 'ok' : 'bad'}"><i>${b ? '✓' : '✗'}</i>${esc(b ? t : f)}</li>`;
  return `<div class="sigp ${sig.ok && sig.signatures.every(s => s.trustedRoot) && sig.signerMatch !== false ? 'sig-ok' : 'sig-bad'}"><h3>${esc(title)}</h3><p class="sig-sum">${esc(sig.summary)}</p>${sig.signatures.map(s => s.error ? `<p class="err">${esc(s.error)}</p>` : `<dl class="profile"><div><dt>Người ký</dt><dd>${esc(s.signer.name)}${s.signer.org && s.signer.org !== s.signer.name ? '<br><span class="muted">' + esc(s.signer.org) + '</span>' : ''}${s.signer.uid ? '<br><span class="muted">' + esc(s.signer.uid) + '</span>' : ''}</dd></div><div><dt>Tổ chức cấp chứng thư</dt><dd>${esc(s.ca)}</dd></div><div><dt>Thời điểm ký</dt><dd>${esc(vt(s.signingTime) || 'Không ghi')}</dd></div><div><dt>Hiệu lực chứng thư</dt><dd>${esc(vt(s.notBefore))} – ${esc(vt(s.notAfter))}</dd></div><div><dt>Chuỗi chứng thực</dt><dd>${esc((s.chain || []).join(' → '))}${s.rootName && !(s.chain || []).includes(s.rootName) ? ' → ' + esc(s.rootName) : ''}</dd></div></dl><ul class="sig-checks">${yes(s.integrity, 'Tài liệu nguyên vẹn, không bị sửa sau khi ký', 'Nội dung tài liệu đã bị thay đổi sau khi ký')}${yes(s.signatureValid, 'Chữ ký khớp với chứng thư số của người ký', 'Chữ ký không khớp chứng thư số')}${yes(s.chainOk && s.trustedRoot, 'Chứng thư thuộc chuỗi tin cậy của Root CA quốc gia', 'Chứng thư không thuộc chuỗi tin cậy quốc gia đã biết')}${yes(s.certValidAtSigning, 'Chứng thư còn hiệu lực tại thời điểm ký', 'Chứng thư hết hạn hoặc chưa hiệu lực khi ký')}</ul>`).join('')}${sig.modifiedAfter ? '<p class="err">Có nội dung được thêm vào tệp sau chữ ký cuối cùng.</p>' : ''}${sig.signerMatch === false ? '<p class="err">Người ký không phải đơn vị cấp giấy của Hệ thống từ thiện Fly To Sky.</p>' : ''}<p class="fine">Hệ thống tự kiểm tra theo cùng nguyên tắc với Trung tâm Chứng thực điện tử quốc gia (NEAC); tình trạng thu hồi chứng thư cần kiểm tra trực tuyến tại NEAC. Để kiểm tra lại: tải tệp PDF về, mở <a href="${NEAC_URL}" target="_blank" rel="noopener">neac.gov.vn</a> → Dịch vụ trực tuyến → Kiểm tra văn bản ký số, rồi tải tệp lên.</p><a class="btn btn-ghost btn-sm" href="${NEAC_URL}" target="_blank" rel="noopener">Kiểm tra tại NEAC ↗</a></div>`;
}

function docBlock(c) {
  const sig = parseSig(c), url = docUrl(c), pdf = c.doc_mime === 'application/pdf';
  const label = docKindLabel(c) + ' – ' + (c.doc_type === 'digital' ? 'PDF có chữ ký số' : 'bản scan có chữ ký tay');
  return `<div class="cv-fig"><div class="cv-img doc-view">${pdf ? `<iframe src="${esc(url)}#view=FitH" title="${esc(label)}"></iframe>` : `<img src="${esc(url)}" alt="${esc(label)}">`}</div><p class="fine"><b>${esc(label)}</b>. ${c.doc_type === 'scan' ? 'Bản scan giấy có chữ ký tay; bản gốc do đơn vị cấp lưu giữ. Hãy đối chiếu thông tin với trang này.' : 'Tệp gốc có chữ ký số; tải về để kiểm tra lại tại NEAC.'}</p><div class="btns cv-btns"><a class="btn btn-primary btn-sm" href="${esc(docUrl(c, true))}">Tải ${pdf ? 'PDF' : 'ảnh'} gốc</a><a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">Mở toàn màn hình ↗</a></div>${c.doc_type === 'digital' ? sigPanel(sig, 'Chữ ký số trên tệp gốc') : ''}</div>`;
}

export function render404(x) {
  const main = `<section class="sec bg-paper nf"><div class="wrap center"><h1>404</h1><p class="lead">Không tìm thấy trang bạn cần.</p><div class="btns center-btns"><a class="btn btn-primary" href="/">Về trang chủ</a><a class="btn btn-ghost" href="/tra-cuu">Tra cứu</a></div></div></section>`;
  return page(x, { title: 'Không tìm thấy | ' + x.s.site.owner, noindex: true }, 'page', main);
}

export { IMAGE_KEYS, fmtDate };
