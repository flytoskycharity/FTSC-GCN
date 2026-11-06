// Menu, sao chép, đếm ngược và tra cứu liên thông.
(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vnd = n => Number(n || 0).toLocaleString('vi-VN') + ' VNĐ';
  const dmy = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || ''); };

  // Menu điện thoại
  const burger = $('.burger');
  burger && burger.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', open);
  });

  // Bấm để chép số tài khoản, cú pháp
  document.addEventListener('click', e => {
    const el = e.target.closest('.copy');
    if (!el) return;
    navigator.clipboard?.writeText(el.dataset.copy || el.textContent).then(() => {
      el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1600);
    });
  });

  // Đếm ngược thời gian kết thúc dự án (giờ Việt Nam)
  const cds = $$('.cd[data-end]');
  const tick = () => cds.forEach(el => {
    const end = new Date(el.dataset.end + ':00+07:00').getTime(), d = end - Date.now();
    if (!Number.isFinite(end)) return;
    if (d <= 0) { el.textContent = 'Đợt ủng hộ đã kết thúc'; return; }
    const day = Math.floor(d / 864e5), h = Math.floor(d / 36e5) % 24, m = Math.floor(d / 6e4) % 60, s = Math.floor(d / 1e3) % 60;
    el.textContent = `Còn ${day} ngày ${h} giờ ${m} phút ${s} giây`;
  });
  if (cds.length) { tick(); setInterval(tick, 1000); }

  // ---------- Tra cứu ----------
  const out = $('#lkOut');
  if (!out) return;
  const form = $('.lk-form'), input = $('#q');
  const PER = 12;
  let all = [], tab = 'all', page = 1, sources = [];

  const card = r => {
    const initial = (String(r.name).trim().split(/\s+/).pop() || '?').slice(0, 1).toUpperCase();
    const rev = r.status === 'revoked';
    const amount = r.amount ? `<div><dt>Số tiền</dt><dd class="amt-v">${esc(vnd(r.amount))}</dd></div>` : (r.amountText ? `<div><dt>Ghi nhận</dt><dd>${esc(r.amountText)}</dd></div>` : '');
    const docs = (r.documents || []).filter(d => d.url).map(d => `<a class="btn btn-ghost btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)} ↗</a>`).join('');
    const pending = (r.documents || []).filter(d => !d.url && d.label).map(d => `<span class="chip">${esc(d.label)}${d.status ? ': ' + esc(d.status) : ''}</span>`).join('');
    return `<article class="lk-card src-${esc(r.source)}${rev ? ' rev' : ''}"><div class="lk-top"><div class="av">${esc(initial)}</div><div><h3>${esc(r.name)}</h3><p>${esc(r.type)} · ${esc(r.sourceLabel)}</p></div></div>${rev ? '<span class="chip chip-bad">Đã thu hồi</span>' : ''}<dl>${r.code ? `<div><dt>Mã giấy</dt><dd><code>${esc(r.code)}</code></dd></div>` : ''}${r.org ? `<div><dt>Chức vụ, đơn vị</dt><dd>${esc(r.org)}</dd></div>` : ''}${r.project ? `<div><dt>Dự án, chương trình</dt><dd>${esc(r.project)}</dd></div>` : ''}${amount}${r.date ? `<div><dt>Ngày cấp</dt><dd>${esc(dmy(r.date))}</dd></div>` : ''}${r.phone ? `<div><dt>Số điện thoại</dt><dd>${esc(r.phone)}</dd></div>` : ''}</dl>${pending}<div class="lk-act">${r.url && !rev ? `<a class="btn btn-primary btn-sm" href="${esc(r.url)}"${/^https?:/.test(r.url) ? ' target="_blank" rel="noopener"' : ''}>Xem & xác thực</a>` : ''}${docs}</div></article>`;
  };

  function draw() {
    const groups = [['all', 'Tất cả', all.length], ...sources.map(s => [s.source, s.label, all.filter(r => r.source === s.source).length])].filter(g => g[0] === 'all' || g[2]);
    const list = tab === 'all' ? all : all.filter(r => r.source === tab);
    const pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.min(page, pages);
    if (!all.length) {
      out.innerHTML = `<div class="card center"><h3>Không tìm thấy giấy phù hợp</h3><p>Hãy thử số điện thoại khác cách viết, họ tên đầy đủ có dấu hoặc mã giấy chính xác. Giấy mới cấp có thể cần vài phút để cập nhật.</p></div>`;
      return;
    }
    out.innerHTML = `<div class="lk-sum"><p>Tìm thấy ${all.length} giấy${list.length !== all.length ? ` · đang xem ${list.length}` : ''}</p></div>${groups.length > 2 ? `<div class="lk-tabs" role="tablist">${groups.map(g => `<button type="button" role="tab" data-tab="${esc(g[0])}" class="${g[0] === tab ? 'on' : ''}" aria-selected="${g[0] === tab}">${esc(g[1])} (${g[2]})</button>`).join('')}</div>` : ''}<div class="lk-list">${list.slice((page - 1) * PER, page * PER).map(card).join('')}</div>${pages > 1 ? `<nav class="pager" aria-label="Trang kết quả">${Array.from({ length: pages }, (_, i) => `<button type="button" data-page="${i + 1}" class="${i + 1 === page ? 'on' : ''}">${i + 1}</button>`).join('')}</nav>` : ''}`;
  }
  out.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'), p = e.target.closest('[data-page]');
    if (t) { tab = t.dataset.tab; page = 1; draw(); }
    if (p) { page = Number(p.dataset.page); draw(); out.scrollIntoView({ behavior: 'smooth' }); }
  });

  async function run(q) {
    out.innerHTML = '<div class="lk-wait"><span class="spin"></span>Đang tra cứu trên các hệ thống…</div>';
    try {
      const r = await fetch('/api/lookup?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Không tra cứu được');
      all = d.results || []; sources = d.sources || []; tab = 'all'; page = 1; draw();
    } catch (e) {
      out.innerHTML = `<p class="alert">${esc(e.message === 'Failed to fetch' ? 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.' : e.message)}</p>`;
    }
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return;
    history.replaceState(null, '', '/tra-cuu?q=' + encodeURIComponent(q));
    run(q);
  });
  if (input.value.trim().length >= 2) run(input.value.trim());
  else if (!document.getElementById('lk')?.hidden) out.innerHTML = '<p class="empty">Nhập thông tin ở trên để bắt đầu tra cứu.</p>';
})();
