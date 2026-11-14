/* Khung ứng dụng trên điện thoại cho trang quản trị Fly To Sky (dùng chung volunteer / certificates).
   Thêm thanh tiêu đề cố định phía trên (menu · icon ứng dụng · tên trang) và thanh điều hướng nhanh phía dưới,
   giống trải nghiệm FTS Workspace / Tủ sách. Chỉ hiện ở màn hình ≤ 980px; máy tính giữ nguyên thanh bên.
   Dùng: FTSMobileShell.mount({ icon: '/brand/app/app-icon-128.png', app: 'Tên ngắn', home: '#/', items: [{ href: '#/', label: 'Tổng quan', icon: 'home' }, …] }) */
(function () {
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 10h18M8 2.5v4M16 2.5v4"/>',
    brief: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14 -1.5 7 5-2.5 5 2.5-1.5-7"/>',
    heart: '<path d="M12 20.5s-8-4.6-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 6-8 10.6-8 10.6z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  var svg = function (n, s) { return '<svg width="' + (s || 22) + '" height="' + (s || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || P.file) + '</svg>'; };
  var CSS = '.fmb,.fmn{display:none}'
    + '@media (max-width:980px){'
    + 'body.fms{padding-bottom:calc(68px + env(safe-area-inset-bottom))}'
    + '.fmb{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:80;background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid rgba(5,34,139,.1);padding:calc(8px + env(safe-area-inset-top)) 12px 8px}'
    + '.fmb button{display:grid;place-items:center;width:40px;height:40px;border:0;background:none;border-radius:12px;color:#0e1b3d;cursor:pointer;flex:none}.fmb button:active{background:#eef2fb}'
    + '.fmb img{width:34px;height:34px;border-radius:10px;flex:none;box-shadow:0 6px 14px -8px rgba(3,21,82,.6)}'
    + '.fmb b{font:800 17px/1.25 Manrope,system-ui,sans-serif;color:#031552;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.fmb .av{width:36px;height:36px;border-radius:50%;background:#05228b;color:#fff;display:grid;place-items:center;font:800 14px Manrope,sans-serif;flex:none}'
    + '.fmn{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;position:fixed;left:0;right:0;bottom:0;z-index:85;background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1px solid rgba(5,34,139,.1);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}'
    + '.fmn a,.fmn button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 2px;border:0;background:none;color:#5b6787;text-decoration:none;font:700 11.5px/1.2 Manrope,system-ui,sans-serif;cursor:pointer;min-width:0}'
    + '.fmn span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}'
    + '.fmn i{display:grid;place-items:center;width:52px;height:30px;border-radius:999px;font-style:normal}'
    + '.fmn .on{color:#05228b}.fmn .on i{background:#e3eafc}'
    + 'body.fms .burger{display:none!important}'
    + 'body.fms .main{padding-top:14px}'
    + 'body.fms .top h1{display:none}body.fms .top>div:first-child>p{margin-top:0}'
    + 'body.fms .stats{gap:10px}body.fms .stat{padding:12px 14px;border-radius:16px;border:1px solid rgba(5,34,139,.07)}body.fms .stat b{font-size:24px;line-height:1.15}body.fms .stat span{display:block;margin-top:2px;line-height:1.35}'
    + 'body.fms .stats>.stat:last-child:nth-child(odd){grid-column:1/-1}'
    + '}';
  function mount(cfg) {
    if (document.getElementById('fmb')) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    document.body.classList.add('fms');
    var bar = document.createElement('header'); bar.className = 'fmb'; bar.id = 'fmb';
    bar.innerHTML = '<button type="button" aria-label="Mở menu">' + svg('menu', 24) + '</button><img src="' + cfg.icon + '" alt=""><b id="fmbT">' + (cfg.app || '') + '</b>' + (cfg.user ? '<span class="av" title="' + cfg.user.replace(/"/g, '') + '">' + cfg.user.trim().split(/\s+/).pop().charAt(0).toUpperCase() + '</span>' : '');
    var nav = document.createElement('nav'); nav.className = 'fmn'; nav.setAttribute('aria-label', 'Điều hướng nhanh');
    nav.innerHTML = cfg.items.map(function (it) { return '<a href="' + it.href + '" data-k="' + key(it.href) + '"><i>' + svg(it.icon) + '</i><span>' + it.label + '</span></a>'; }).join('') + '<button type="button"><i>' + svg('menu') + '</i><span>Menu</span></button>';
    var toggle = function () { document.body.classList.toggle('nav-open'); };
    bar.querySelector('button').onclick = toggle; nav.querySelector('button').onclick = toggle;
    document.body.insertBefore(bar, document.body.firstChild); document.body.appendChild(nav);
    var sync = function () {
      var h = document.querySelector('#main .top h1'); var t = document.getElementById('fmbT');
      if (h && t && t.textContent !== h.textContent) t.textContent = h.textContent;
      var k = key(location.hash || cfg.home || '#');
      [].forEach.call(nav.querySelectorAll('a'), function (a) { a.classList.toggle('on', a.dataset.k === k); });
    };
    new MutationObserver(sync).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', sync); sync();
  }
  function key(h) { return String(h || '').replace(/^#\/?/, '').split(/[/?]/)[0]; }
  function unmount() { ['fmb'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); }); var n = document.querySelector('nav.fmn'); if (n) n.remove(); document.body.classList.remove('fms', 'nav-open'); }
  window.FTSMobileShell = { mount: mount, unmount: unmount };
})();
