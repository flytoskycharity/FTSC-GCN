// Trang quản trị Cổng tra cứu Giấy chứng nhận Fly To Sky.
(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vnd = n => n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('vi-VN') + 'đ';
  const dmy = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/); return m ? (m[4] ? `${m[4]}:${m[5]} ` : '') + `${m[3]}/${m[2]}/${m[1]}` : String(v || ''); };
  const app = $('#app');
  const SHEET = 'https://docs.google.com/spreadsheets/d/1GaA2ojIUYSDXo_469Wsan34hv36iRPNvJ8uvIPJ4fPU/edit';
  let me = null, campaigns = [], tplMeta = null;

  // ---------- tiện ích ----------
  async function api(path, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), headers: {} };
    if (body instanceof FormData) opt.body = body;
    else if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(path, opt);
    let d = {};
    try { d = await r.json(); } catch { d = { error: 'Máy chủ trả dữ liệu không hợp lệ (' + r.status + ')' }; }
    if (r.status === 401) { me = null; boot(); throw new Error(d.error || 'Hết phiên đăng nhập'); }
    if (d.mustChange) { me.mustChange = true; boot(); throw new Error(d.error); }
    if (!r.ok) throw new Error(d.error || 'Lỗi ' + r.status);
    return d;
  }
  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, bad ? 6000 : 3000);
  }
  const fail = e => toast(e.message || String(e), true);
  const modal = {
    open(html, wide) {
      const m = $('#modal');
      $('.modal-box', m).classList.toggle('wide', !!wide);
      $('.modal-body', m).innerHTML = html; m.hidden = false;
      $('.modal-body input, .modal-body select, .modal-body textarea', m)?.focus();
      return $('.modal-body', m);
    },
    close() { $('#modal').hidden = true; $('.modal-body', $('#modal')).innerHTML = ''; },
  };
  $('.modal-x').addEventListener('click', modal.close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) modal.close(); });
  const formData = form => {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return o;
  };
  const field = (name, label, value = '', o = {}) => {
    const attrs = `name="${name}" ${o.required ? 'required' : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''}`;
    let input;
    if (o.type === 'textarea') input = `<textarea ${attrs} rows="${o.rows || 4}">${esc(value)}</textarea>`;
    else if (o.options) input = `<select ${attrs}>${o.options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else input = `<input ${attrs} type="${o.type || 'text'}" value="${esc(value)}"${o.list ? ` list="${o.list}"` : ''}>`;
    return `<label class="f"><span>${esc(label)}</span>${input}${o.help ? `<small>${o.help}</small>` : ''}</label>`;
  };
  const check = (name, label, on) => `<label class="chk"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${esc(label)}</label>`;
  const upload = (name, label, value, folder) => `<label class="f"><span>${esc(label)}</span><div class="upl"><input name="${name}" value="${esc(value || '')}" placeholder="/media/... hoặc để trống">${value ? `<img src="${esc(value)}" alt="">` : ''}<button type="button" class="btn ghost sm" data-upload="${name}" data-folder="${folder}">Tải ảnh</button></div></label>`;
  // Nút tải ảnh trong biểu mẫu: chọn tệp → đưa lên R2 → điền đường dẫn.
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-upload]');
    if (!b) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f); fd.append('folder', b.dataset.folder || 'uploads');
      b.disabled = true; b.textContent = 'Đang tải…';
      try {
        const d = await api('/api/admin/media', fd);
        const target = b.closest('.upl').querySelector('input');
        target.value = d.url; target.dispatchEvent(new Event('change', { bubbles: true }));
        let img = b.closest('.upl').querySelector('img');
        if (!img) { img = document.createElement('img'); b.before(img); }
        img.src = d.url;
        toast('Đã tải ảnh lên');
      } catch (x) { fail(x); } finally { b.disabled = false; b.textContent = 'Tải ảnh'; }
    };
    inp.click();
  });
  const loadCampaigns = async () => { campaigns = (await api('/api/admin/campaigns')).campaigns; return campaigns; };
  const campOptions = (all = true) => [...(all ? [['', 'Tất cả dự án']] : []), ['0', '— Không gắn dự án —'], ...campaigns.map(c => [c.id, c.title])];
  const isSuper = () => me?.role === 'super';
  const canEdit = () => me?.role === 'super' || me?.role === 'staff';

  // ---------- đăng nhập ----------
  async function boot() {
    try {
      const d = await fetch('/api/auth').then(r => r.json());
      if (!d.configured) { app.innerHTML = `<div class="login"><form><img src="/brand/fts-logo.png" alt=""><h1>Chưa cấu hình</h1><p class="sub">Cần gắn D1 (DB), đặt ADMIN_PASSWORD và ADMIN_SESSION_SECRET trên Cloudflare Pages, rồi triển khai lại.</p></form></div>`; return; }
      me = d.loggedIn ? d.user : null;
    } catch { me = null; }
    if (!me) return loginView();
    if (me.mustChange) return changeView(true);
    shell();
  }
  function loginView() {
    app.innerHTML = `<div class="login"><form id="lf"><img src="/brand/fts-logo.png" alt="Fly To Sky"><h1>Quản trị Cổng tra cứu GCN</h1><p class="sub">Hệ thống từ thiện Fly To Sky</p>${field('username', 'Tên đăng nhập', '', { required: true })}${field('password', 'Mật khẩu', '', { type: 'password', required: true })}<button class="btn" style="width:100%;justify-content:center">Đăng nhập</button><p class="err" hidden></p></form></div>`;
    $('#lf').addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('#lf .err'); err.hidden = true;
      try { const d = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData(e.target)) }).then(async r => ({ ok: r.ok, ...(await r.json()) })); if (!d.ok) throw new Error(d.error); boot(); }
      catch (x) { err.textContent = x.message; err.hidden = false; }
    });
  }
  function changeView(forced) {
    const html = `<form id="cf">${forced ? '<p class="hint">Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được đặt lại. Vui lòng đổi mật khẩu để tiếp tục.</p>' : ''}${field('current', 'Mật khẩu hiện tại', '', { type: 'password', required: true })}${field('next', 'Mật khẩu mới (ít nhất 8 ký tự)', '', { type: 'password', required: true })}${field('again', 'Nhập lại mật khẩu mới', '', { type: 'password', required: true })}<button class="btn">Đổi mật khẩu</button><p class="err" hidden></p></form>`;
    const host = forced ? (app.innerHTML = `<div class="login"><div class="modal-box" style="width:min(440px,100%)"><h2>Đổi mật khẩu</h2>${html}</div></div>`, app) : modal.open('<h2>Đổi mật khẩu</h2>' + html);
    $('#cf', host).addEventListener('submit', async e => {
      e.preventDefault();
      const v = formData(e.target), err = $('#cf .err', host);
      if (v.next !== v.again) { err.textContent = 'Hai lần nhập mật khẩu mới chưa khớp.'; err.hidden = false; return; }
      try { await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change', current: v.current, next: v.next }) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); }); toast('Đã đổi mật khẩu'); if (!forced) modal.close(); boot(); }
      catch (x) { err.textContent = x.message; err.hidden = false; }
    });
  }

  // ---------- khung ----------
  const TABS = [
    ['tong-quan', 'Tổng quan', overview], ['du-an', 'Dự án kêu gọi', campaignsView], ['mau', 'Mẫu Giấy chứng nhận', templatesView],
    ['giay', 'Giấy chứng nhận', certsView], ['giao-dich', 'Giao dịch & đối soát', txView], ['nhap', 'Nhập dữ liệu cũ', importView],
    ['cai-dat', 'Cài đặt', settingsView, true], ['tai-khoan', 'Tài khoản & nhật ký', usersView, true],
  ];
  function shell() {
    app.innerHTML = `<div class="shell"><aside class="side"><a class="side-brand" href="/" target="_blank"><img src="/brand/fts-logo.png" alt=""><b>Cổng tra cứu Giấy chứng nhận</b></a><nav>${TABS.filter(t => !t[3] || isSuper()).map(t => `<a href="#${t[0]}" data-tab="${t[0]}">${esc(t[1])}</a>`).join('')}</nav><div class="side-foot"><p><b>${esc(me.name || me.username)}</b><br>${esc({ super: 'Quản trị cao nhất', staff: 'Cán bộ cấp GCN & dự án', viewer: 'Chỉ xem' }[me.role] || me.role)}</p><button type="button" id="chg">Đổi mật khẩu</button><button type="button" id="out">Đăng xuất</button></div></aside><main class="main" id="main"></main></div>`;
    $('#chg').onclick = () => changeView(false);
    $('#out').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); me = null; boot(); };
    window.onhashchange = route;
    route();
  }
  async function route() {
    const [tab, arg] = (location.hash.slice(1) || 'tong-quan').split('/');
    const t = TABS.find(x => x[0] === tab && (!x[3] || isSuper())) || TABS[0];
    $$('.side nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === t[0]));
    document.body.classList.remove('nav-open');
    const main = $('#main');
    main.innerHTML = '<p class="empty">Đang tải…</p>';
    try { await t[2](main, arg ? decodeURIComponent(arg) : ''); } catch (e) { main.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; }
  }
  const top = (title, sub, actions = '') => `<div class="top"><div><button class="burger" type="button" onclick="document.body.classList.toggle('nav-open')">☰ Menu</button><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`;

  // ---------- Tổng quan ----------
  async function overview(main) {
    const d = await api('/api/admin/stats');
    const sync = d.sync?.at ? `${d.sync.ok ? 'Thành công' : 'Lỗi: ' + esc(d.sync.error)} lúc ${new Date(d.sync.at).toLocaleString('vi-VN')}` : 'Chưa chạy';
    main.innerHTML = top('Tổng quan', 'Cổng tra cứu Giấy chứng nhận của Hệ thống từ thiện Fly To Sky', canEdit() ? '<a class="btn accent" href="#giay/new">+ Cấp giấy</a><a class="btn ghost" href="#du-an/new">+ Dự án</a>' : '') +
      `<div class="stats"><div class="stat"><b>${d.certs}</b><span>Giấy chứng nhận</span></div><div class="stat"><b>${d.month}</b><span>Cấp trong 30 ngày</span></div><div class="stat"><b>${d.open}/${d.campaigns}</b><span>Dự án đang mở / tổng</span></div><div class="stat${d.unmatched ? ' warn' : ''}"><b>${d.unmatched}</b><span>Giao dịch chưa nhận diện</span></div><div class="stat"><b>${d.pending}</b><span>Đăng ký ủng hộ chờ tiền</span></div><div class="stat"><b>${d.revoked}</b><span>Giấy đã thu hồi</span></div></div>
      <div class="grid2"><div class="card"><h2>Giấy cấp gần đây</h2><div class="tbl"><table><tbody>${d.recent.map(c => `<tr><td><b>${esc(c.name)}</b><span class="sub">${esc(c.campaign_name)}</span></td><td><a href="/xac-thuc/${c.code.split('/').map(encodeURIComponent).join('/')}?s=${c.sig}" target="_blank"><code>${esc(c.code)}</code></a><span class="sub">${dmy(c.issued_date)}</span></td><td>${c.amount ? vnd(c.amount) : esc(c.amount_text)}</td></tr>`).join('') || '<tr><td class="empty">Chưa có giấy nào</td></tr>'}</tbody></table></div></div>
      <div class="card"><h2>Đối soát sao kê</h2><p>${sync}</p><p><a href="#giao-dich">Mở Giao dịch & đối soát →</a></p><h3 style="margin-top:18px">Hoạt động gần đây</h3><div class="tbl"><table><tbody>${d.audit.map(a => `<tr><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td class="sub">${dmy(a.at)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  }

  // ---------- Dự án ----------
  const STATUS = { draft: ['Nháp', 'mute'], open: ['Đang mở', 'ok'], closed: ['Đã kết thúc', 'warn'], hidden: ['Ẩn', 'bad'] };
  async function campaignsView(main, arg) {
    await loadCampaigns();
    main.innerHTML = top('Dự án kêu gọi', 'Dự án hiển thị trên cổng, cú pháp chuyển khoản và cách cấp Giấy chứng nhận tự động.', canEdit() ? '<button class="btn accent" id="newC">+ Thêm dự án</button>' : '') +
      `<div class="card tbl"><table><thead><tr><th>Dự án</th><th>Trạng thái</th><th>Cú pháp</th><th>Đã nhận / mục tiêu</th><th>GCN</th><th>Mẫu</th><th></th></tr></thead><tbody>${campaigns.map(c => `<tr><td><b>${esc(c.title)}</b><span class="sub">${c.kind === 'program' ? 'Chương trình (không quy ra tiền)' : 'Quyên góp tiền'} · ${dmy(c.start_at) || '…'} → ${dmy(c.end_at) || '…'}</span></td><td><span class="tag ${STATUS[c.status]?.[1]}">${STATUS[c.status]?.[0] || c.status}</span></td><td>${c.memo_prefix ? `<code>${esc(c.memo_prefix)} SĐT</code>` : '—'}</td><td>${vnd(c.raised)}${c.goal ? ' / ' + vnd(c.goal) : ''}</td><td><a href="#giay/c${c.id}">${c.certs}</a></td><td><a href="#mau/${c.id}">${c.templates || 'Chung'}</a></td><td class="acts">${canEdit() ? `<button class="btn sm ghost" data-edit="${c.id}">Sửa</button> <a class="btn sm ghost" href="#giay/new${c.id}">Cấp GCN</a> ` : ''}<a class="btn sm link" href="/du-an/${esc(c.slug)}" target="_blank">Xem</a></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có dự án. Bấm “Thêm dự án” hoặc nhập từ bảng KEUGOI ở mục Nhập dữ liệu cũ.</td></tr>'}</tbody></table></div>`;
    $('#newC')?.addEventListener('click', () => editCampaign({}));
    $$('[data-edit]', main).forEach(b => b.onclick = () => editCampaign(campaigns.find(c => c.id == b.dataset.edit)));
    if (arg === 'new' && canEdit()) editCampaign({});
  }
  function editCampaign(c) {
    const m = modal.open(`<h2>${c.id ? 'Sửa dự án' : 'Thêm dự án'}</h2><form id="cform">${field('title', 'Tên dự án *', c.title, { required: true, max: 200 })}<div class="fg">${field('status', 'Trạng thái', c.status || 'open', { options: Object.entries(STATUS).map(([k, v]) => [k, v[0]]) })}${field('kind', 'Loại', c.kind || 'money', { options: [['money', 'Quyên góp tiền'], ['program', 'Chương trình, hoạt động (không quy ra tiền)']] })}</div><div class="fg">${field('start_at', 'Bắt đầu', (c.start_at || '').slice(0, 16), { type: 'datetime-local' })}${field('end_at', 'Kết thúc', (c.end_at || '').slice(0, 16), { type: 'datetime-local' })}</div><div class="fg">${field('memo_prefix', 'Cú pháp chuyển khoản', c.memo_prefix, { ph: 'VD: TRONGRUNG', max: 40, help: 'Người ủng hộ ghi: <code>CÚ PHÁP SĐT</code>. Mỗi dự án một cú pháp riêng, khác với cú pháp TUSACH của Khuyendoc.' })}${field('cert_prefix', 'Tiền tố mã giấy', c.cert_prefix, { ph: 'Mặc định FTS', max: 10, help: 'Mã giấy dạng TIỀNTỐ-NĂM-7 số ngẫu nhiên.' })}</div><div class="fg">${field('goal', 'Số tiền kêu gọi (VNĐ)', c.goal || '', { ph: '0 = không đặt mục tiêu' })}${field('raised_offset', 'Số tiền đã nhận ngoài sao kê (VNĐ)', c.raised_offset || '', { help: 'Cộng thêm vào số đã nhận (tiền mặt, tài khoản khác…).' })}</div>${check('accept_donations', 'Nhận ủng hộ trực tuyến (hiện form + mã QR trên trang dự án)', c.accept_donations !== 0)}${field('summary', 'Tóm tắt (1–2 câu)', c.summary, { type: 'textarea', rows: 2, max: 400 })}${field('description', 'Mô tả chi tiết', c.description, { type: 'textarea', rows: 7, help: 'Dòng trống để tách đoạn; dòng bắt đầu bằng "- " là gạch đầu dòng; "## " là tiêu đề nhỏ; **chữ** là in đậm.' })}${upload('cover', 'Ảnh bìa', c.cover, 'covers')}<div class="fg">${field('slug', 'Đường dẫn (tự tạo nếu để trống)', c.slug, { ph: 'trong-rung-2026' })}${field('sort', 'Thứ tự ưu tiên (lớn hiện trước)', c.sort || 0, { type: 'number' })}</div><p class="err" hidden></p><div class="modal-acts">${c.id ? '<button type="button" class="btn danger" id="delC">Xóa</button>' : ''}<button type="button" class="btn ghost" onclick="this.closest('.modal').hidden=true">Hủy</button><button class="btn">Lưu</button></div></form>`);
    $('#cform', m).addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/api/admin/campaigns', { action: 'save', record: { ...formData(e.target), id: c.id } }); modal.close(); toast('Đã lưu dự án'); route(); }
      catch (x) { const er = $('.err', m); er.textContent = x.message; er.hidden = false; }
    });
    $('#delC', m)?.addEventListener('click', async () => {
      if (!confirm('Xóa dự án "' + c.title + '"?')) return;
      try { await api('/api/admin/campaigns', { action: 'delete', id: c.id }); modal.close(); toast('Đã xóa'); route(); } catch (x) { fail(x); }
    });
  }

  // ---------- Mẫu Giấy chứng nhận ----------
  const SAMPLE = { name: 'NGUYỄN VĂN AN', org: 'Giám đốc Công ty ABC', amount: '1.000.000 VNĐ', project: 'Tên dự án mẫu', phone: '093****446', code: 'FTS-2026-1234567', date: '06/11/2026', signer: 'Lê Văn Phúc' };
  let settingsCache = null;
  const getSettings = async () => settingsCache || (settingsCache = (await api('/api/admin/settings')).settings);
  const sampleQr = () => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1zM10 10h2v2h-2zM14 14h2v2h-2zM17 17h3v3h-3zM10 2h2v5h-2zM2 10h5v2H2z" fill="#000"/><path d="M3 3h3v3H3zM15 3h3v3h-3zM3 15h3v3H3z" fill="#fff"/></svg>');
  async function drawTpl(canvas, t, values) {
    const s = await getSettings();
    return window.FTSCert.draw(canvas, { tpl: t, values: { ...SAMPLE, ...(values || {}) }, images: { qr: sampleQr(), signature: s.cert.signature, stamp: s.cert.stamp }, fonts: [s.theme.fontHeading, s.theme.fontBody] });
  }
  async function templatesView(main, arg) {
    await loadCampaigns();
    tplMeta = await api('/api/admin/templates');
    const filter = arg === '' ? 'all' : arg;
    const list = tplMeta.templates.filter(t => filter === 'all' || String(t.campaign_id) === filter);
    const cname = id => id ? (campaigns.find(c => c.id == id)?.title || 'Dự án #' + id) : 'Mẫu chung (mọi dự án)';
    main.innerHTML = top('Mẫu Giấy chứng nhận', 'Mỗi dự án có thể có nhiều mẫu. Khi cấp tự động: chọn mẫu có “mức tiền tối thiểu” cao nhất mà số tiền đạt tới; nhiều mẫu cùng mức thì chọn ngẫu nhiên. Dự án chưa có mẫu riêng dùng mẫu chung, cuối cùng là mẫu mặc định.', canEdit() ? '<button class="btn accent" id="newT">+ Thêm mẫu</button>' : '') +
      `<div class="filters"><select id="tf"><option value="all">Tất cả mẫu</option><option value="0"${filter === '0' ? ' selected' : ''}>Mẫu chung</option>${campaigns.map(c => `<option value="${c.id}"${filter == c.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('')}</select></div><div class="tpl-list">${list.map(t => `<div class="tpl"><canvas data-t="${t.id}"></canvas><div><h3>${esc(t.name)} ${t.enabled ? '' : '<span class="tag mute">Đang tắt</span>'}</h3><p class="sub">${esc(cname(t.campaign_id))}${t.min_amount ? ' · từ ' + vnd(t.min_amount) : ''}</p>${canEdit() ? `<div class="row"><button class="btn sm" data-ed="${t.id}">Sửa</button><button class="btn sm ghost" data-dup="${t.id}">Nhân bản</button></div>` : ''}</div></div>`).join('') || '<div class="card empty">Chưa có mẫu nào ở mục này. Giấy sẽ dùng mẫu mặc định của hệ thống.</div>'}</div>`;
    $('#tf').onchange = e => location.hash = 'mau/' + (e.target.value === 'all' ? '' : e.target.value);
    for (const cv of $$('canvas[data-t]', main)) drawTpl(cv, tplMeta.templates.find(t => t.id == cv.dataset.t), { project: cname(tplMeta.templates.find(t => t.id == cv.dataset.t).campaign_id) });
    $('#newT')?.addEventListener('click', () => editTemplate({ ...JSON.parse(JSON.stringify(tplMeta.defaults)), id: 0, name: 'Mẫu mới', campaign_id: filter === 'all' ? 0 : Number(filter) }));
    $$('[data-ed]', main).forEach(b => b.onclick = () => editTemplate(JSON.parse(JSON.stringify(tplMeta.templates.find(t => t.id == b.dataset.ed)))));
    $$('[data-dup]', main).forEach(b => b.onclick = () => { const t = JSON.parse(JSON.stringify(tplMeta.templates.find(x => x.id == b.dataset.dup))); editTemplate({ ...t, id: 0, name: t.name + ' (bản sao)' }); });
  }
  function editTemplate(t) {
    const keys = tplMeta.fieldKeys, imgKeys = tplMeta.imageKeys;
    let sel = 0;
    const m = modal.open(`<h2>${t.id ? 'Sửa mẫu' : 'Thêm mẫu'}: ${esc(t.name)}</h2><div class="ed"><div><div class="stage" id="stage"><canvas id="tc"></canvas></div><p class="sub" style="margin-top:8px">Kéo các ô trên giấy để đặt vị trí. Chữ căn giữa lấy điểm giữa; ảnh (QR, chữ ký, con dấu) lấy góc trên bên trái.</p></div><form id="tform">${field('name', 'Tên mẫu', t.name, { max: 120 })}${field('campaign_id', 'Dùng cho', t.campaign_id, { options: [['0', 'Mẫu chung (mọi dự án)'], ...campaigns.map(c => [c.id, c.title])] })}<div class="fg">${field('min_amount', 'Mức tiền tối thiểu (VNĐ)', t.min_amount || '', { ph: '0 = mọi mức' })}</div>${check('enabled', 'Đang dùng', t.enabled !== 0)}${upload('background', 'Ảnh nền giấy (PNG/JPG, nên ≥ 2000px)', t.background, 'templates')}<div class="sect"><b>Các ô thông tin</b><div class="fields" id="flist"></div><div class="row"><select id="addKey">${Object.entries(keys).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select><button type="button" class="btn sm ghost" id="addF">+ Thêm ô</button></div></div><div class="sect" id="fprops"></div><p class="err" hidden></p><div class="modal-acts">${t.id ? '<button type="button" class="btn danger" id="delT">Xóa</button>' : ''}<button class="btn">Lưu mẫu</button></div></form></div>`, true);
    const canvas = $('#tc', m), stage = $('#stage', m), form = $('#tform', m);
    let redrawT;
    const redraw = () => { clearTimeout(redrawT); redrawT = setTimeout(async () => { await drawTpl(canvas, t, { project: campaigns.find(c => c.id == form.elements.campaign_id.value)?.title || 'Tên dự án mẫu' }); handles(); }, 60); };
    function handles() {
      $$('.hd', stage).forEach(h => h.remove());
      t.fields.forEach((f, i) => {
        if (f.visible === false) return;
        const h = document.createElement('div');
        const img = imgKeys.includes(f.key);
        h.className = 'hd' + (img ? '' : ' pt') + (i === sel ? ' on' : '');
        h.style.left = f.x + '%'; h.style.top = f.y + '%';
        if (img) { h.style.width = f.w + '%'; h.style.height = (f.w * (t.width / t.height) * (f.key === 'qr' ? 1 : 0.5)) + '%'; h.textContent = keys[f.key]; }
        else { h.style.transform = 'translate(-50%,-50%)'; h.innerHTML = `<span>${esc(keys[f.key])}</span>`; }
        h.addEventListener('pointerdown', e => {
          e.preventDefault(); sel = i; list(); props();
          $$('.hd', stage).forEach(x => x.classList.remove('on')); h.classList.add('on');
          const r = stage.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = f.x, oy = f.y;
          const move = ev => { f.x = Math.round((ox + (ev.clientX - sx) / r.width * 100) * 10) / 10; f.y = Math.round((oy + (ev.clientY - sy) / r.height * 100) * 10) / 10; h.style.left = f.x + '%'; h.style.top = f.y + '%'; };
          const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); props(); redraw(); };
          addEventListener('pointermove', move); addEventListener('pointerup', up);
        });
        stage.appendChild(h);
      });
    }
    function list() {
      $('#flist', m).innerHTML = t.fields.map((f, i) => `<button type="button" data-i="${i}" class="${i === sel ? 'on' : ''}${f.visible === false ? ' off' : ''}"><span>${esc(keys[f.key])}${f.key === 'text' && f.text ? ': ' + esc(f.text.slice(0, 18)) : ''}</span><span>${f.x}, ${f.y}</span></button>`).join('');
      $$('#flist button', m).forEach(b => b.onclick = () => { sel = Number(b.dataset.i); list(); props(); handles(); });
    }
    function props() {
      const f = t.fields[sel], box = $('#fprops', m);
      if (!f) { box.innerHTML = ''; return; }
      const img = imgKeys.includes(f.key);
      box.innerHTML = `<b>${esc(keys[f.key])}</b><div class="fg" style="margin-top:8px">${field('x', 'Ngang (%)', f.x, { type: 'number' })}${field('y', 'Dọc (%)', f.y, { type: 'number' })}</div>${img ? field('w', 'Rộng (% chiều ngang giấy)', f.w, { type: 'number' }) : `${f.key === 'text' ? field('text', 'Nội dung chữ', f.text || '') : field('prefix', 'Chữ đứng trước (tùy chọn)', f.prefix || '', { ph: 'VD: Mã GCN: ' })}<div class="fg">${field('size', 'Cỡ chữ (% ngang)', f.size, { type: 'number' })}${field('color', 'Màu', f.color || '#14333c', { type: 'color' })}</div><div class="fg">${field('align', 'Căn', f.align || 'center', { options: [['left', 'Trái'], ['center', 'Giữa'], ['right', 'Phải']] })}${field('font', 'Kiểu chữ', f.font || '', { options: [['', 'Không chân'], ['serif', 'Có chân']] })}</div>${field('maxw', 'Rộng tối đa (%), chữ dài tự thu nhỏ', f.maxw || '', { type: 'number', ph: 'Tự động' })}${check('bold', 'In đậm', f.bold)}${check('upper', 'Viết hoa toàn bộ', f.upper)}`}${check('visible', 'Hiển thị', f.visible !== false)}<button type="button" class="btn sm danger" id="rmF">Xóa ô này</button>`;
      $$('input,select', box).forEach(el => el.addEventListener('input', () => {
        const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        if (el.name === 'visible') { if (v) delete f.visible; else f.visible = false; }
        else f[el.name] = v;
        list(); redraw();
      }));
      $('#rmF', box).onclick = () => { t.fields.splice(sel, 1); sel = 0; list(); props(); redraw(); };
    }
    $('#addF', m).onclick = () => {
      const k = $('#addKey', m).value;
      t.fields.push(imgKeys.includes(k) ? { key: k, x: 45, y: 45, w: 10 } : { key: k, x: 50, y: 50, size: 2, color: '#14333c', align: 'center', bold: true, ...(k === 'text' ? { text: 'Nội dung' } : {}) });
      sel = t.fields.length - 1; list(); props(); redraw();
    };
    form.elements.background.addEventListener('change', () => {
      const im = new Image();
      im.onload = () => { t.width = im.naturalWidth || 1600; t.height = im.naturalHeight || 1131; redraw(); };
      t.background = form.elements.background.value; im.src = t.background;
    });
    form.elements.campaign_id.addEventListener('change', redraw);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = formData(form);
      try { await api('/api/admin/templates', { action: 'save', record: { id: t.id, name: v.name, campaign_id: v.campaign_id, min_amount: v.min_amount, enabled: v.enabled, background: v.background || t.background, width: t.width, height: t.height, fields: t.fields } }); modal.close(); toast('Đã lưu mẫu'); route(); }
      catch (x) { const er = $('.err', m); er.textContent = x.message; er.hidden = false; }
    });
    $('#delT', m)?.addEventListener('click', async () => { if (!confirm('Xóa mẫu này?')) return; try { await api('/api/admin/templates', { action: 'delete', id: t.id }); modal.close(); toast('Đã xóa mẫu'); route(); } catch (x) { fail(x); } });
    list(); props(); redraw();
  }

  // ---------- Giấy chứng nhận ----------
  const SRC = { auto: 'Tự động (sao kê)', manual: 'Cấp tay', import: 'Nhập từ bảng tính' };
  let certState = { q: '', campaign: '', source: '', status: '', page: 1 };
  async function certsView(main, arg) {
    await loadCampaigns();
    if (arg && arg.startsWith('c')) certState = { ...certState, campaign: arg.slice(1), page: 1 };
    main.innerHTML = top('Giấy chứng nhận', 'Tra cứu, cấp mới, chỉnh sửa (giữ nguyên mã, lưu lịch sử) và thu hồi.', canEdit() ? '<button class="btn accent" id="newG">+ Cấp giấy</button><button class="btn ghost" id="bulkG">Cấp hàng loạt</button>' : '') +
      `<form class="filters" id="gf"><input type="search" name="q" value="${esc(certState.q)}" placeholder="Mã giấy, họ tên hoặc số điện thoại"><select name="campaign">${campOptions().map(([v, l]) => `<option value="${v}"${String(v) === certState.campaign ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><select name="source"><option value="">Mọi nguồn</option>${Object.entries(SRC).map(([k, l]) => `<option value="${k}"${k === certState.source ? ' selected' : ''}>${l}</option>`).join('')}</select><select name="status"><option value="">Mọi trạng thái</option><option value="valid"${certState.status === 'valid' ? ' selected' : ''}>Hiệu lực</option><option value="revoked"${certState.status === 'revoked' ? ' selected' : ''}>Đã thu hồi</option></select><button class="btn">Lọc</button></form><div class="card"><div id="glist"><p class="empty">Đang tải…</p></div></div>`;
    $('#gf').addEventListener('submit', e => { e.preventDefault(); certState = { ...certState, ...formData(e.target), page: 1 }; loadCerts(); });
    $('#newG')?.addEventListener('click', () => issueForm(certState.campaign));
    $('#bulkG')?.addEventListener('click', () => bulkForm(certState.campaign));
    await loadCerts();
    if (arg && arg.startsWith('new') && canEdit()) issueForm(arg.slice(3));
  }
  async function loadCerts() {
    const p = new URLSearchParams(Object.entries(certState).filter(([, v]) => v !== '' && v !== undefined));
    const d = await api('/api/admin/certificates?' + p);
    const box = $('#glist');
    box.innerHTML = `<div class="tbl"><table><thead><tr><th>Mã giấy</th><th>Họ tên</th><th>Dự án</th><th>Ghi nhận</th><th>Ngày cấp</th><th>Nguồn</th><th></th></tr></thead><tbody>${d.items.map(c => `<tr><td><a href="${esc(c.url)}" target="_blank"><code>${esc(c.code)}</code></a>${c.status === 'revoked' ? '<br><span class="tag bad">Đã thu hồi</span>' : ''}</td><td><b>${esc(c.name)}</b><span class="sub">${esc(c.org)}${c.phone ? ' · ' + esc(c.phone) : ''}</span></td><td>${esc(c.campaign_name)}</td><td>${c.amount ? vnd(c.amount) : esc(c.amount_text || '—')}</td><td>${dmy(c.issued_date)}</td><td><span class="tag mute">${esc(SRC[c.source] || c.source)}</span>${c.file_url ? `<br><a href="${esc(c.file_url)}" target="_blank" class="sub">Bản gốc ↗</a>` : ''}</td><td class="acts">${canEdit() ? `<button class="btn sm ghost" data-g="${c.id}">Sửa</button> ${c.status === 'revoked' ? `<button class="btn sm ghost" data-restore="${c.id}">Khôi phục</button>` : `<button class="btn sm danger" data-revoke="${c.id}">Thu hồi</button>`}` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Không có giấy phù hợp.</td></tr>'}</tbody></table></div><div class="pager"><span>${d.total} giấy · trang ${d.page}/${d.pages}</span><button class="btn sm ghost" id="pv" ${d.page <= 1 ? 'disabled' : ''}>‹ Trước</button><button class="btn sm ghost" id="nx" ${d.page >= d.pages ? 'disabled' : ''}>Sau ›</button></div>`;
    $('#pv').onclick = () => { certState.page--; loadCerts(); };
    $('#nx').onclick = () => { certState.page++; loadCerts(); };
    $$('[data-g]', box).forEach(b => b.onclick = () => editCert(d.items.find(c => c.id == b.dataset.g)));
    $$('[data-revoke]', box).forEach(b => b.onclick = async () => { const reason = prompt('Lý do thu hồi (hiển thị trên trang xác thực):'); if (!reason) return; try { await api('/api/admin/certificates', { action: 'revoke', id: b.dataset.revoke, reason }); toast('Đã thu hồi'); loadCerts(); } catch (x) { fail(x); } });
    $$('[data-restore]', box).forEach(b => b.onclick = async () => { try { await api('/api/admin/certificates', { action: 'restore', id: b.dataset.restore }); toast('Đã khôi phục'); loadCerts(); } catch (x) { fail(x); } });
  }
  const tplOptions = campId => [['auto', 'Tự chọn theo dự án và số tiền'], ['0', 'Mẫu mặc định của hệ thống'], ...(tplMeta?.templates || []).filter(t => !t.campaign_id || t.campaign_id == campId).map(t => [t.id, t.name + (t.campaign_id ? '' : ' (chung)')])];
  async function issueForm(campId) {
    tplMeta = tplMeta || await api('/api/admin/templates');
    const m = modal.open(`<h2>Cấp Giấy chứng nhận</h2><form id="iform">${field('campaign_id', 'Dự án, chương trình', campId || '0', { options: campOptions(false) })}${field('name', 'Họ và tên *', '', { required: true, max: 160 })}<div class="fg">${field('phone', 'Số điện thoại', '', { help: 'Dùng để tra cứu; trên giấy được che bớt.' })}${field('org', 'Chức vụ, đơn vị', '', { max: 200 })}</div><div class="fg">${field('amount', 'Số tiền (VNĐ)', '', { ph: 'Để trống nếu không quy ra tiền' })}${field('amount_text', 'Hoặc nội dung ghi nhận', '', { ph: 'VD: Đã tham gia trồng 20 cây' })}</div><div class="fg">${field('issued_date', 'Ngày cấp', new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10), { type: 'date' })}${field('code', 'Mã giấy (để trống để tự tạo)', '', { max: 40 })}</div>${field('template_id', 'Mẫu giấy', 'auto', { options: tplOptions(campId) })}${field('file_url', 'Đường dẫn bản gốc (nếu có, https://…)', '')}${field('note', 'Ghi chú nội bộ', '', { max: 500 })}<p class="err" hidden></p><div class="modal-acts"><button class="btn">Cấp giấy</button></div></form>`);
    $('#iform', m).elements.campaign_id.onchange = e => { $('#iform', m).elements.template_id.innerHTML = tplOptions(e.target.value).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''); };
    $('#iform', m).addEventListener('submit', async e => {
      e.preventDefault();
      const v = formData(e.target);
      try {
        const d = await api('/api/admin/certificates', { action: 'create', campaign: v.campaign_id, record: v });
        if (d.errors.length) throw new Error(d.errors.join('; '));
        const c = d.created[0];
        $('.modal-body').innerHTML = `<h2>Đã cấp giấy</h2><p>Mã giấy <code>${esc(c.code)}</code></p><p>Đường dẫn xác thực (in vào QR, gửi cho người nhận):<br><input class="f" style="width:100%;padding:8px" readonly value="${esc(location.origin + c.url)}"></p><div class="modal-acts"><a class="btn" href="${esc(c.url)}" target="_blank">Xem giấy</a><button class="btn ghost" id="again">Cấp giấy khác</button></div>`;
        $('#again').onclick = () => issueForm(v.campaign_id);
        if ($('#glist')) loadCerts();
      } catch (x) { const er = $('.err', m); er.textContent = x.message; er.hidden = false; }
    });
  }
  async function bulkForm(campId) {
    tplMeta = tplMeta || await api('/api/admin/templates');
    const m = modal.open(`<h2>Cấp hàng loạt</h2><div class="hint"><p>Dán từ Excel/Google Sheets, mỗi dòng một người, các cột theo thứ tự:</p><p><code>Họ tên | Số điện thoại | Số tiền hoặc nội dung ghi nhận | Chức vụ, đơn vị</code></p><p>Có thể ngăn cách bằng Tab (dán từ bảng tính) hoặc dấu |. Tối đa 500 dòng mỗi lần.</p></div><form id="bform">${field('campaign_id', 'Dự án, chương trình', campId || '0', { options: campOptions(false) })}${field('template_id', 'Mẫu giấy', 'auto', { options: tplOptions(campId) })}${field('issued_date', 'Ngày cấp', new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10), { type: 'date' })}${field('rows', 'Danh sách', '', { type: 'textarea', rows: 10, required: true })}<p class="err" hidden></p><div class="modal-acts"><button class="btn">Cấp giấy</button></div></form>`, true);
    $('#bform', m).addEventListener('submit', async e => {
      e.preventDefault();
      const v = formData(e.target);
      const records = v.rows.split(/\r?\n/).map(l => l.split(/\t|\|/).map(s => s.trim())).filter(r => r[0]).map(r => ({ name: r[0], phone: r[1] || '', amount: r[2] || '', org: r[3] || '', issued_date: v.issued_date }));
      if (!confirm(`Cấp ${records.length} giấy chứng nhận?`)) return;
      try {
        const d = await api('/api/admin/certificates', { action: 'bulk', campaign: v.campaign_id, template_id: v.template_id, records });
        $('.modal-body').innerHTML = `<h2>Đã cấp ${d.created.length} giấy</h2>${d.errors.length ? `<p class="err">${d.errors.map(esc).join('<br>')}</p>` : ''}<div class="tbl"><table><tbody>${d.created.map((c, i) => `<tr><td>${esc(records[i]?.name || '')}</td><td><code>${esc(c.code)}</code></td><td>${esc(location.origin + c.url)}</td></tr>`).join('')}</tbody></table></div><div class="modal-acts"><button class="btn" id="cpy">Chép danh sách</button></div>`;
        $('#cpy').onclick = () => navigator.clipboard.writeText(d.created.map(c => `${c.code}\t${location.origin + c.url}`).join('\n')).then(() => toast('Đã chép'));
        loadCerts();
      } catch (x) { const er = $('.err', m); er.textContent = x.message; er.hidden = false; }
    });
  }
  async function editCert(c) {
    tplMeta = tplMeta || await api('/api/admin/templates');
    const hist = JSON.parse(c.history || '[]');
    const m = modal.open(`<h2>Sửa giấy <code>${esc(c.code)}</code></h2><p class="hint">Mã giấy và mã xác thực giữ nguyên. Mỗi lần sửa thông tin được lưu vào lịch sử; trang xác thực ghi rõ số lần điều chỉnh.</p><form id="eform">${field('campaign_id', 'Dự án, chương trình', c.campaign_id, { options: campOptions(false) })}${field('campaign_name', 'Tên dự án in trên giấy', c.campaign_name)}${field('name', 'Họ và tên *', c.name, { required: true })}<div class="fg">${field('phone', 'Số điện thoại', c.phone)}${field('org', 'Chức vụ, đơn vị', c.org)}</div><div class="fg">${field('amount', 'Số tiền (VNĐ)', c.amount ?? '')}${field('amount_text', 'Hoặc nội dung ghi nhận', c.amount_text)}</div><div class="fg">${field('issued_date', 'Ngày cấp', c.issued_date, { type: 'date' })}${field('template_id', 'Mẫu giấy', c.template_id, { options: tplOptions(c.campaign_id).filter(o => o[0] !== 'auto') })}</div>${field('file_url', 'Đường dẫn bản gốc', c.file_url)}${field('note', 'Ghi chú nội bộ', c.note)}${field('reason', 'Lý do điều chỉnh', '', { ph: 'VD: Sai chính tả họ tên theo yêu cầu người nhận' })}${hist.length ? `<details class="sect"><summary>Lịch sử điều chỉnh (${hist.length})</summary>${hist.map(h => `<p class="sub">${dmy(h.at)} · ${esc(h.by)}: trước đó “${esc(h.old?.name)}”, ${esc(h.old?.amount ?? h.old?.amount_text ?? '')}${h.reason ? ' — ' + esc(h.reason) : ''}</p>`).join('')}</details>` : ''}<p class="err" hidden></p><div class="modal-acts">${isSuper() ? '<button type="button" class="btn danger" id="delG">Xóa hẳn</button>' : ''}<a class="btn ghost" href="${esc(c.url)}" target="_blank">Xem giấy</a><button class="btn">Lưu</button></div></form>`);
    $('#eform', m).addEventListener('submit', async e => {
      e.preventDefault();
      const v = formData(e.target);
      try { await api('/api/admin/certificates', { action: 'update', id: c.id, reason: v.reason, record: v }); modal.close(); toast('Đã lưu'); loadCerts(); }
      catch (x) { const er = $('.err', m); er.textContent = x.message; er.hidden = false; }
    });
    $('#delG', m)?.addEventListener('click', async () => { if (!confirm('Xóa hẳn giấy ' + c.code + '? Mã này sẽ báo "không xác thực được". Thường nên Thu hồi thay vì xóa.')) return; try { await api('/api/admin/certificates', { action: 'delete', id: c.id }); modal.close(); toast('Đã xóa'); loadCerts(); } catch (x) { fail(x); } });
  }

  // ---------- Giao dịch ----------
  const TXS = { unmatched: ['Chưa nhận diện', 'warn'], matched: ['Đã cấp GCN', 'ok'], ignored: ['Bỏ qua', 'mute'], other: ['Không thuộc dự án', 'mute'] };
  async function txView(main, arg) {
    await loadCampaigns();
    const view = arg || 'unmatched';
    const isDon = view === 'donations';
    const d = await api('/api/admin/transactions?' + (isDon ? 'view=donations' : view === 'all' ? '' : 'status=' + view));
    const sync = d.sync?.at ? `Lần đồng bộ gần nhất: ${new Date(d.sync.at).toLocaleString('vi-VN')} — ${d.sync.ok ? `đọc ${d.sync.count} giao dịch, ${d.sync.added || 0} mới, cấp ${d.sync.matched || 0} GCN` : 'lỗi: ' + esc(d.sync.error || '')}` : 'Chưa đồng bộ lần nào.';
    const tabs = [['unmatched', 'Chưa nhận diện'], ['matched', 'Đã cấp GCN'], ['all', 'Tất cả giao dịch dự án'], ['other', 'Không thuộc dự án'], ['donations', 'Đăng ký ủng hộ']];
    main.innerHTML = top('Giao dịch & đối soát', 'Hệ thống đọc sao kê, nhận ra cú pháp từng dự án (<code>CÚ PHÁP SĐT</code>) và cấp Giấy chứng nhận tự động.', canEdit() ? '<button class="btn accent" id="syncB">Đồng bộ sao kê ngay</button><button class="btn ghost" id="pasteB">Dán sao kê</button>' : '') +
      `<div class="card"><p style="margin:0">${sync}</p>${d.syncUrl ? '' : '<p class="sub">Chưa cấu hình địa chỉ dữ liệu sao kê (Cài đặt → Đối soát sao kê). Có thể dán sao kê tay.</p>'}</div><div class="filters">${tabs.map(([k, l]) => `<a class="btn sm ${k === view ? '' : 'ghost'}" href="#giao-dich/${k}">${l}</a>`).join('')}</div><div class="card tbl">${isDon ? donTable(d.items) : txTable(d.items)}</div>`;
    $('#syncB')?.addEventListener('click', async e => { e.target.disabled = true; try { const r = await api('/api/admin/transactions', { action: 'sync' }); toast(`Đọc ${r.count} giao dịch, ${r.added} mới, cấp ${r.matched} GCN`); route(); } catch (x) { fail(x); e.target.disabled = false; } });
    $('#pasteB')?.addEventListener('click', () => {
      const m = modal.open(`<h2>Dán sao kê</h2><div class="hint"><p>Mỗi dòng: <code>ngày | số tiền | nội dung</code> (dán từ Excel cũng được), hoặc chép nguyên trang sao kê của ngân hàng/Thiện Nguyện. Giao dịch đã ghi trước đó tự bỏ qua.</p></div><form id="pf">${field('text', 'Sao kê', '', { type: 'textarea', rows: 12, required: true })}<div class="modal-acts"><button class="btn">Đối soát</button></div></form>`, true);
      $('#pf', m).addEventListener('submit', async e => { e.preventDefault(); try { const r = await api('/api/admin/transactions', { action: 'paste', text: e.target.elements.text.value }); modal.close(); toast(`Đọc ${r.read} dòng, ${r.added} mới, cấp ${r.matched} GCN, ${r.unmatched} chưa nhận diện`); route(); } catch (x) { fail(x); } });
    });
    $$('[data-assign]', main).forEach(b => b.onclick = () => assignTx(d.items.find(t => t.id === b.dataset.assign)));
    $$('[data-ign]', main).forEach(b => b.onclick = async () => { try { await api('/api/admin/transactions', { action: b.dataset.act, id: b.dataset.ign }); route(); } catch (x) { fail(x); } });
    $$('[data-cancel]', main).forEach(b => b.onclick = async () => { try { await api('/api/admin/transactions', { action: 'cancelDonation', donation: b.dataset.cancel }); route(); } catch (x) { fail(x); } });
  }
  const txTable = items => `<table><thead><tr><th>Ngày</th><th>Số tiền</th><th>Nội dung chuyển khoản</th><th>Dự án</th><th>Trạng thái</th><th></th></tr></thead><tbody>${items.map(t => `<tr><td>${dmy(t.tx_date)}</td><td><b>${vnd(t.amount)}</b></td><td>${esc(t.description)}</td><td>${esc(t.campaign || '—')}</td><td><span class="tag ${TXS[t.status]?.[1]}">${TXS[t.status]?.[0] || t.status}</span>${t.cert_code ? `<br><a href="${esc(t.cert_url)}" target="_blank"><code>${esc(t.cert_code)}</code></a>` : ''}</td><td class="acts">${canEdit() && !t.cert_id ? `<button class="btn sm" data-assign="${esc(t.id)}">Cấp GCN</button> <button class="btn sm link" data-ign="${esc(t.id)}" data-act="${t.status === 'ignored' ? 'unignore' : 'ignore'}">${t.status === 'ignored' ? 'Bỏ đánh dấu' : 'Bỏ qua'}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Không có giao dịch.</td></tr>'}</tbody></table>`;
  const donTable = items => `<table><thead><tr><th>Lúc đăng ký</th><th>Người ủng hộ</th><th>Dự án</th><th>Số tiền</th><th>Nội dung CK</th><th>Trạng thái</th><th></th></tr></thead><tbody>${items.map(d => `<tr><td>${dmy(d.created_at)}</td><td><b>${esc(d.name)}</b><span class="sub">${esc(d.phone)} ${esc(d.email)}</span></td><td>${esc(d.campaign || '')}</td><td>${vnd(d.amount)}${d.paid_amount ? `<span class="sub">Đã nhận ${vnd(d.paid_amount)}</span>` : ''}</td><td><code>${esc(d.memo)}</code></td><td><span class="tag ${d.status === 'paid' ? 'ok' : d.status === 'pending' ? 'warn' : 'mute'}">${{ paid: 'Đã nhận', pending: 'Chờ tiền', cancelled: 'Đã hủy' }[d.status] || d.status}</span>${d.cert_code ? `<br><a href="${esc(d.cert_url)}" target="_blank"><code>${esc(d.cert_code)}</code></a>` : ''}</td><td>${d.status === 'pending' && canEdit() ? `<button class="btn sm link" data-cancel="${d.id}">Hủy</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có đăng ký.</td></tr>'}</tbody></table>`;
  function assignTx(t) {
    const m = modal.open(`<h2>Cấp GCN cho giao dịch</h2><p class="hint">${dmy(t.tx_date)} · <b>${vnd(t.amount)}</b><br>${esc(t.description)}</p><form id="af">${field('campaign', 'Dự án', t.campaign_id || '', { options: campaigns.map(c => [c.id, c.title]) })}${field('name', 'Họ và tên *', '', { required: true })}<div class="fg">${field('phone', 'Số điện thoại', (t.description.match(/(?:\+?84|0)\d{9}/) || [''])[0])}${field('org', 'Chức vụ, đơn vị', '')}</div><p class="err" hidden></p><div class="modal-acts"><button class="btn">Cấp giấy</button></div></form>`);
    $('#af', m).addEventListener('submit', async e => {
      e.preventDefault();
      try { const r = await api('/api/admin/transactions', { action: 'assign', id: t.id, ...formData(e.target) }); modal.close(); toast('Đã cấp ' + r.code); route(); }
      catch (x) { const er = $('.err', m); er.textContent = x.message; er.hidden = false; }
    });
  }

  // ---------- Nhập dữ liệu cũ ----------
  function importView(main) {
    main.innerHTML = top('Nhập dữ liệu cũ', 'Chuyển dữ liệu từ Google Sheets của hệ thống Apps Script cũ sang cổng mới. Mã giấy cũ (VD: FT26…, GCN_1) được giữ nguyên và có thêm mã xác thực chống giả.') +
      `<div class="card"><form id="imf"><div class="hint"><p>1. Mở Google Sheets → <b>Chia sẻ</b> → “Bất kỳ ai có đường liên kết” → <b>Người xem</b>.</p><p>2. Nhập bảng <b>KEUGOI</b> trước (tạo dự án), rồi bảng <b>GCN</b> (giấy chứng nhận). Chiến dịch chưa có sẽ tự tạo thành dự án “Đã kết thúc”.</p><p>3. Bấm <b>Xem trước</b> để kiểm tra, rồi <b>Ghi vào hệ thống</b>. Mã đã có sẽ bỏ qua (trừ khi chọn ghi đè), nên nhập lại nhiều lần vẫn an toàn.</p></div><div class="fg">${field('type', 'Loại dữ liệu', 'certificates', { options: [['certificates', 'Giấy chứng nhận (bảng GCN)'], ['campaigns', 'Dự án kêu gọi (bảng KEUGOI)']] })}${field('sheet', 'Tên trang tính (tab)', 'GCN')}</div>${field('sheetUrl', 'Đường dẫn Google Sheets', SHEET)}${field('csv', 'Hoặc dán nội dung CSV/TSV (có hàng tiêu đề)', '', { type: 'textarea', rows: 4 })}${check('overwrite', 'Ghi đè giấy đã có cùng mã', false)}<div class="row"><button class="btn ghost" name="go" value="preview">Xem trước</button><button class="btn accent" type="button" id="commitB" disabled>Ghi vào hệ thống</button></div><div class="prog" hidden><span></span></div></form><div id="impOut"></div></div>`;
    const form = $('#imf'), out = $('#impOut');
    let items = null;
    form.elements.type.onchange = e => { form.elements.sheet.value = e.target.value === 'campaigns' ? 'KEUGOI' : 'GCN'; items = null; $('#commitB').disabled = true; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = formData(form);
      out.innerHTML = '<p class="empty">Đang đọc…</p>';
      try {
        const d = await api('/api/admin/import', { action: 'preview', type: v.type, sheetUrl: v.csv ? '' : v.sheetUrl, sheet: v.sheet, csv: v.csv });
        items = d.items || null;
        $('#commitB').disabled = false;
        out.innerHTML = `<p><b>Sẽ ghi ${d.total} giấy.</b> Hiển thị ${d.preview.length} dòng đầu.</p>${d.invalidCodes?.length ? `<p class="err">Mã không hợp lệ (sẽ bỏ qua): ${d.invalidCodes.map(esc).join(', ')}</p>` : ''}${d.duplicates?.length ? `<div class="hint"><p><b>${d.duplicates.length} dòng nhập trùng</b> (cùng mã, họ tên, SĐT) sẽ được bỏ qua, không cấp giấy thứ hai:</p><p>${d.duplicates.slice(0, 30).map(esc).join('<br>')}</p></div>` : ''}${d.shared?.length ? `<div class="hint"><p><b>Mã dùng chung cho nhiều người</b> (VD: số quyết định). Người đầu giữ mã gốc, người sau thêm đuôi -2, -3…; tra cứu mã gốc vẫn ra cả nhóm:</p><p>${d.shared.slice(0, 30).map(esc).join('<br>')}</p></div>` : ''}<div class="tbl"><table><thead><tr>${Object.keys(d.preview[0] || {}).map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${d.preview.map(r => `<tr>${Object.values(r).map(x => `<td>${esc(x ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      } catch (x) { out.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
    });
    $('#commitB').addEventListener('click', async e => {
      const v = formData(form);
      if (!confirm('Ghi dữ liệu vào hệ thống?')) return;
      e.target.disabled = true;
      const bar = $('.prog', form); bar.hidden = false;
      try {
        if (v.type === 'campaigns') {
          const r = await api('/api/admin/import', { action: 'commit', type: 'campaigns', sheetUrl: v.csv ? '' : v.sheetUrl, sheet: v.sheet, csv: v.csv });
          out.innerHTML = `<p><b>Đã thêm ${r.added} dự án</b>, bỏ qua ${r.skipped} dự án trùng tên. <a href="#du-an">Xem dự án →</a></p>`;
        } else {
          let written = 0, skipped = 0, newC = 0, errors = [];
          for (let i = 0; i < items.length; i += 300) {
            const r = await api('/api/admin/import', { action: 'commit', type: 'certificates', items: items.slice(i, i + 300), overwrite: v.overwrite });
            written += r.written; skipped += r.skipped; newC += r.newCampaigns; errors = errors.concat(r.errors);
            $('span', bar).style.width = Math.min(100, (i + 300) / items.length * 100) + '%';
          }
          out.innerHTML = `<p><b>Đã ghi ${written} giấy</b>, bỏ qua ${skipped} mã đã có, tạo ${newC} dự án mới.</p>${errors.length ? `<p class="err">${errors.slice(0, 30).map(esc).join('<br>')}</p>` : ''}<p><a href="#giay">Xem giấy chứng nhận →</a></p>`;
        }
        toast('Đã nhập dữ liệu');
      } catch (x) { fail(x); } finally { bar.hidden = true; }
    });
  }

  // ---------- Cài đặt ----------
  async function settingsView(main) {
    const d = await api('/api/admin/settings');
    const s = d.settings; settingsCache = s;
    const envRow = (k, need, desc) => `<tr><td><code>${k}</code></td><td>${d.env[k] ? '<span class="tag ok">Đã có</span>' : `<span class="tag ${need ? 'bad' : 'mute'}">Chưa có</span>`}</td><td>${desc}</td></tr>`;
    const lines = a => (a || []).join('\n');
    main.innerHTML = top('Cài đặt', 'Mọi nội dung hiển thị trên cổng. Lưu xong có hiệu lực ngay, không cần sửa mã.') +
      `<form id="sf"><div class="card"><h2>Thông tin cổng</h2>${field('site.title', 'Tên cổng', s.site.title)}<div class="fg">${field('site.shortTitle', 'Tên ngắn (đầu trang)', s.site.shortTitle)}${field('site.kicker', 'Dòng nhỏ phía trên tiêu đề', s.site.kicker)}</div>${field('site.operator', 'Đơn vị vận hành', s.site.operator)}${field('site.owner', 'Đơn vị chủ quản', s.site.owner)}${field('site.intro', 'Giới thiệu', s.site.intro, { type: 'textarea', rows: 3 })}${field('site.support', 'Dòng hỗ trợ', s.site.support)}${field('site.url', 'Địa chỉ chính thức (dùng trong QR)', s.site.url)}</div>
      <div class="card"><h2>Giấy chứng nhận</h2><div class="fg">${field('cert.prefix', 'Tiền tố mã giấy mặc định', s.cert.prefix)}${field('cert.programText', 'Chữ ghi nhận khi không có số tiền', s.cert.programText)}</div><div class="fg">${field('cert.signerName', 'Người ký', s.cert.signerName)}${field('cert.signerTitle', 'Chức danh người ký', s.cert.signerTitle)}</div><div class="fg">${upload('cert.signature', 'Ảnh chữ ký (PNG nền trong)', s.cert.signature, 'signs')}${upload('cert.stamp', 'Ảnh con dấu (PNG nền trong)', s.cert.stamp, 'signs')}</div>${check('cert.maskPhone', 'Che bớt số điện thoại trên giấy và trang xác thực', s.cert.maskPhone)}</div>
      <div class="card"><h2>Tài khoản nhận ủng hộ</h2><div class="fg">${field('bank.name', 'Ngân hàng', s.bank.name)}${field('bank.bin', 'Mã BIN ngân hàng (VietQR)', s.bank.bin, { help: 'MB Bank: 970422' })}${field('bank.account', 'Số tài khoản', s.bank.account)}</div>${field('bank.holder', 'Chủ tài khoản', s.bank.holder)}<div class="fg">${field('donate.minAmount', 'Số tiền tối thiểu', s.donate.minAmount, { type: 'number' })}${field('donate.anonymousName', 'Tên khi chưa có thông tin', s.donate.anonymousName)}</div>${field('donate.amounts', 'Các mức gợi ý (mỗi dòng một số)', lines(s.donate.amounts), { type: 'textarea', rows: 3 })}${field('donate.note', 'Ghi chú dưới form ủng hộ', s.donate.note, { type: 'textarea', rows: 2 })}</div>
      <div class="card"><h2>Đối soát sao kê</h2><div class="hint"><p>Dùng cùng địa chỉ dữ liệu sao kê JSON với Khuyendoc (Admin Khuyendoc → Quyên góp → Đồng bộ sao kê). Có thể dùng {account}, {from}, {to}, {fromIso}, {toIso}.</p><p>Để đối soát định kỳ, dùng dịch vụ hẹn giờ (VD: cron-job.org) gọi <code>${esc(location.origin)}/api/bank-sync?key=SYNC_KEY</code> mỗi 5–10 phút.</p></div>${check('sync.enabled', 'Bật tự đối soát (khi có người tra cứu hoặc chờ thanh toán)', s.sync.enabled)}${field('sync.url', 'Địa chỉ dữ liệu sao kê (JSON)', s.sync.url)}<div class="fg">${field('sync.lookbackDays', 'Số ngày đọc lại', s.sync.lookbackDays, { type: 'number' })}${field('sync.startDate', 'Chỉ cấp GCN cho giao dịch từ ngày', s.sync.startDate, { type: 'date' })}</div><button type="button" class="btn ghost sm" id="testSync">Thử đọc sao kê</button><span id="testOut" class="sub"></span><div class="sect">${field('statement.title', 'Tiêu đề trang Sao kê', s.statement.title)}${field('statement.lead', 'Mô tả', s.statement.lead)}${field('statement.embed', 'Trang sao kê nhúng (https://…)', s.statement.embed)}</div></div>
      <div class="card"><h2>Tra cứu liên thông</h2><p class="hint">Tra cứu một lần trên cả Khuyendoc (GCN, Giấy xác nhận tài trợ) và FTS Workspace (GCN tình nguyện viên). Ba hệ thống cần cùng một biến <code>FEDERATION_KEY</code>.</p>${['khuyendoc', 'workspace'].map(k => `<div class="fg">${check(`sources.${k}.enabled`, 'Bật', s.sources[k].enabled)}${field(`sources.${k}.label`, 'Tên hiển thị', s.sources[k].label)}${field(`sources.${k}.url`, 'Địa chỉ', s.sources[k].url)}</div>`).join('')}</div>
      <div class="card"><h2>Liên hệ & chân trang</h2>${field('contact.phones', 'Số điện thoại (mỗi dòng một số)', lines(s.contact.phones), { type: 'textarea', rows: 2 })}${field('contact.emails', 'Email (mỗi dòng một địa chỉ)', lines(s.contact.emails), { type: 'textarea', rows: 2 })}${field('contact.links', 'Kênh chính thức (mỗi dòng: Tên | https://…)', (s.contact.links || []).map(l => l.label + ' | ' + l.href).join('\n'), { type: 'textarea', rows: 5 })}${field('contact.offices', 'Văn phòng (mỗi dòng: Tên | Địa chỉ)', (s.contact.offices || []).map(l => l.label + ' | ' + l.value).join('\n'), { type: 'textarea', rows: 3 })}${field('contact.legalName', 'Tên pháp nhân', s.contact.legalName)}${field('contact.taxNote', 'Mã số doanh nghiệp', s.contact.taxNote)}${field('contact.about', 'Giới thiệu ngắn', s.contact.about, { type: 'textarea', rows: 2 })}${field('contact.motto', 'Khẩu hiệu', s.contact.motto)}${field('contact.website', 'Website chính', s.contact.website)}</div>
      <div class="card"><h2>Màu sắc</h2><div class="fg">${['primary', 'primaryDark', 'accent', 'paper', 'tint', 'ink'].map(k => field('theme.' + k, { primary: 'Màu chính', primaryDark: 'Màu chính đậm', accent: 'Màu nhấn', paper: 'Nền giấy', tint: 'Nền nhạt', ink: 'Màu chữ' }[k], s.theme[k], { type: 'color' })).join('')}</div><div class="fg">${field('theme.fontHeading', 'Phông tiêu đề (Google Fonts)', s.theme.fontHeading)}${field('theme.fontBody', 'Phông nội dung', s.theme.fontBody)}</div></div>
      <div class="card"><h2>Biến môi trường trên Cloudflare</h2><div class="tbl"><table><tbody>${envRow('DB', 1, 'Cơ sở dữ liệu D1')}${envRow('MEDIA', 1, 'Kho ảnh R2 (nền mẫu, chữ ký, ảnh bìa)')}${envRow('ADMIN_PASSWORD', 1, 'Mật khẩu khôi phục tài khoản admin')}${envRow('ADMIN_SESSION_SECRET', 1, 'Khóa ký phiên đăng nhập')}${envRow('CERT_SECRET', 1, 'Khóa ký mã xác thực GCN — đặt một lần, không đổi')}${envRow('FEDERATION_KEY', 0, 'Khóa tra cứu liên thông')}${envRow('SYNC_KEY', 0, 'Khóa cho dịch vụ hẹn giờ đối soát')}</tbody></table></div></div>
      <p class="err" hidden></p><div class="row" style="position:sticky;bottom:12px"><button class="btn accent">Lưu cài đặt</button></div></form>`;
    const form = $('#sf');
    $('#testSync').onclick = async () => { $('#testOut').textContent = ' Đang đọc…'; try { const r = await api('/api/admin/transactions', { action: 'test', url: form.elements['sync.url'].value }); $('#testOut').textContent = ` Đọc được ${r.count} giao dịch.`; } catch (x) { $('#testOut').textContent = ' ' + x.message; } };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = formData(form), out = JSON.parse(JSON.stringify(s));
      for (const [k, val] of Object.entries(v)) { const p = k.split('.'); let o = out; while (p.length > 1) o = o[p.shift()]; o[p[0]] = val; }
      const split = t => String(t || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      out.contact.phones = split(v['contact.phones']); out.contact.emails = split(v['contact.emails']);
      out.contact.links = split(v['contact.links']).map(l => { const [label, href] = l.split('|').map(x => x.trim()); return { label, href: href || '' }; });
      out.contact.offices = split(v['contact.offices']).map(l => { const [label, ...rest] = l.split('|'); return { label: label.trim(), value: rest.join('|').trim() }; });
      out.donate.amounts = split(v['donate.amounts']).map(x => Number(x.replace(/\D/g, ''))).filter(Boolean);
      try { const r = await api('/api/admin/settings', { settings: out }); settingsCache = r.settings; toast('Đã lưu cài đặt'); }
      catch (x) { const er = $('.err', form); er.textContent = x.message; er.hidden = false; }
    });
  }

  // ---------- Tài khoản ----------
  async function usersView(main) {
    const d = await api('/api/admin/users');
    main.innerHTML = top('Tài khoản & nhật ký', 'Cấp tài khoản cho cán bộ Phòng/Ban Tổ chức - Hành chính. Người mới phải đổi mật khẩu ở lần đăng nhập đầu.', '<button class="btn accent" id="newU">+ Thêm tài khoản</button>') +
      `<div class="card tbl"><table><thead><tr><th>Tài khoản</th><th>Quyền</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th></th></tr></thead><tbody>${d.users.map(u => `<tr><td><b>${esc(u.name || u.username)}</b><span class="sub">${esc(u.username)}</span></td><td>${esc(d.roles[u.role] || u.role)}</td><td><span class="tag ${u.status === 'active' ? 'ok' : 'bad'}">${u.status === 'active' ? 'Hoạt động' : 'Đã khóa'}</span>${u.must_change ? ' <span class="tag warn">Chờ đổi mật khẩu</span>' : ''}</td><td>${dmy(u.last_login) || '—'}</td><td class="acts"><button class="btn sm ghost" data-u="${u.id}">Sửa</button> <button class="btn sm ghost" data-reset="${u.id}">Đặt lại mật khẩu</button> ${u.id !== me.id ? `<button class="btn sm ${u.status === 'active' ? 'danger' : 'ghost'}" data-lock="${u.id}" data-act="${u.status === 'active' ? 'lock' : 'unlock'}">${u.status === 'active' ? 'Khóa' : 'Mở khóa'}</button> <button class="btn sm link" data-del="${u.id}">Xóa</button>` : ''}</td></tr>`).join('')}</tbody></table></div><div class="card"><h2>Nhật ký thao tác</h2><div class="tbl"><table><tbody>${d.audit.map(a => `<tr><td class="sub">${esc(a.at)}</td><td><b>${esc(a.actor)}</b></td><td>${esc(a.action)}</td></tr>`).join('')}</tbody></table></div></div>`;
    const roleOpts = Object.entries(d.roles);
    const post = async body => { try { await api('/api/admin/users', body); toast('Đã cập nhật'); modal.close(); route(); } catch (x) { fail(x); } };
    $('#newU').onclick = () => {
      const m = modal.open(`<h2>Thêm tài khoản</h2><form id="uf">${field('username', 'Tên đăng nhập *', '', { required: true, ph: 'vd: nguyenvana' })}${field('name', 'Họ tên', '')}${field('role', 'Quyền', 'staff', { options: roleOpts })}${field('password', 'Mật khẩu tạm (≥ 8 ký tự) *', '', { required: true })}<div class="modal-acts"><button class="btn">Tạo</button></div></form>`);
      $('#uf', m).addEventListener('submit', e => { e.preventDefault(); post({ action: 'create', ...formData(e.target) }); });
    };
    $$('[data-u]', main).forEach(b => b.onclick = () => {
      const u = d.users.find(x => x.id == b.dataset.u);
      const m = modal.open(`<h2>Sửa ${esc(u.username)}</h2><form id="uf">${field('name', 'Họ tên', u.name)}${field('role', 'Quyền', u.role, { options: roleOpts })}<div class="modal-acts"><button class="btn">Lưu</button></div></form>`);
      $('#uf', m).addEventListener('submit', e => { e.preventDefault(); post({ action: 'update', id: u.id, ...formData(e.target) }); });
    });
    $$('[data-reset]', main).forEach(b => b.onclick = () => { const pw = prompt('Mật khẩu tạm mới (≥ 8 ký tự). Người dùng phải đổi ở lần đăng nhập tới:'); if (pw) post({ action: 'reset', id: b.dataset.reset, password: pw }); });
    $$('[data-lock]', main).forEach(b => b.onclick = () => post({ action: b.dataset.act, id: b.dataset.lock }));
    $$('[data-del]', main).forEach(b => b.onclick = () => { if (confirm('Xóa tài khoản này?')) post({ action: 'delete', id: b.dataset.del }); });
  }

  boot();
})();
