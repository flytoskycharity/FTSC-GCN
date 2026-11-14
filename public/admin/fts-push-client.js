// Nút "Bật thông báo" dùng chung cho trang quản trị các website Fly To Sky.
// Dùng: FTSPush.mount(element, { key: '/api/push/key', subscribe: '/api/push/subscribe', unsubscribe: '/api/push/unsubscribe', test: '/api/push/test', sw: '/push-sw.js' })
(function () {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64ToBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  const post = (url, body) => fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.ok === false) throw new Error(j.message || j.error || ('HTTP ' + r.status)); return j; });

  const CSS = '.ftsp{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;font:inherit}.ftsp button{display:inline-flex;align-items:center;gap:6px;text-decoration:none!important;border:1px solid #c9d5f2;background:#fff;color:#05228b;border-radius:999px;padding:7px 14px;font:inherit;font-size:.9em;font-weight:700;cursor:pointer}.ftsp button.on{background:#e8f5ee;border-color:#a7dcbf;color:#137a3f}.ftsp button:disabled{opacity:.6;cursor:default}.ftsp small{color:inherit;opacity:.78;font-size:.82em;max-width:340px;line-height:1.35}.ftsp .ftsp-test{border-style:dashed;font-weight:600}';
  const BELL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  async function registration(o) {
    const reg = await navigator.serviceWorker.register(o.sw || '/push-sw.js', { scope: o.scope || '/' });
    await navigator.serviceWorker.ready; return reg;
  }

  function mount(el, opts) {
    const o = Object.assign({ key: '/api/push/key', subscribe: '/api/push/subscribe', unsubscribe: '/api/push/unsubscribe', test: '/api/push/test', sw: '/push-sw.js', label: 'Bật thông báo' }, opts || {});
    if (!el) return;
    if (!document.getElementById('ftsp-css')) { const s = document.createElement('style'); s.id = 'ftsp-css'; s.textContent = CSS; document.head.appendChild(s); }
    el.classList.add('ftsp');
    const render = (state, note) => {
      const on = state === 'on';
      el.innerHTML = `<button type="button" class="ftsp-main${on ? ' on' : ''}" ${state === 'busy' || state === 'blocked' || state === 'unsupported' ? 'disabled' : ''}>${BELL}<span>${on ? 'Đã bật thông báo' : state === 'busy' ? 'Đang xử lý…' : state === 'blocked' ? 'Thông báo đang bị chặn' : o.label}</span></button>${on && o.test ? '<button type="button" class="ftsp-test">Gửi thử</button>' : ''}${note ? `<small>${note}</small>` : ''}`;
      const main = el.querySelector('.ftsp-main'); if (main) main.onclick = on ? disable : enable;
      const t = el.querySelector('.ftsp-test'); if (t) t.onclick = async () => { t.disabled = true; try { const r = await post(o.test); render('on', r.sent ? 'Đã gửi thông báo thử tới ' + r.sent + ' thiết bị.' : 'Chưa gửi được, thử lại sau ít phút.'); } catch (e) { render('on', 'Lỗi: ' + e.message); } };
    };
    async function refresh() {
      if (isIOS && !standalone) return render('unsupported', 'Trên iPhone/iPad: bấm nút Chia sẻ → “Thêm vào MH chính”, mở app từ màn hình chính rồi bật thông báo tại đây.');
      if (!supported) return render('unsupported', 'Trình duyệt này chưa hỗ trợ thông báo. Hãy dùng Chrome, Edge, Safari hoặc Firefox bản mới.');
      if (Notification.permission === 'denied') return render('blocked', 'Bạn đã chặn thông báo cho trang này. Bấm biểu tượng ổ khoá cạnh địa chỉ trang → Cho phép Thông báo, rồi tải lại trang.');
      try {
        const reg = await navigator.serviceWorker.getRegistration(o.scope || '/');
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub && Notification.permission === 'granted') { post(o.subscribe, { subscription: sub.toJSON(), refresh: true }).catch(() => {}); return render('on'); }
      } catch { /* hiện nút bật */ }
      render('off', 'Nhận thông báo ngay trên máy tính / điện thoại này khi có việc mới, không cần mở trang.');
    }
    async function enable() {
      render('busy');
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return refresh();
        const reg = await registration(o);
        const { publicKey } = await (await fetch(o.key, { credentials: 'include' })).json();
        let sub = await reg.pushManager.getSubscription();
        if (sub) { try { await sub.unsubscribe(); } catch { /* bỏ qua */ } }
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
        await post(o.subscribe, { subscription: sub.toJSON() });
        render('on', 'Đã bật. Thiết bị này sẽ nhận thông báo khi có việc mới.');
      } catch (e) { render('off', 'Chưa bật được: ' + (e && e.message || e)); }
    }
    async function disable() {
      render('busy');
      try {
        const reg = await navigator.serviceWorker.getRegistration(o.scope || '/');
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) { await post(o.unsubscribe, { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      } catch { /* bỏ qua */ }
      refresh();
    }
    refresh();
  }
  window.FTSPush = { mount };
})();
