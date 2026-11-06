// Biểu mẫu quyên góp: chọn Quỹ chung/dự án, đối tượng, số tiền → quyền lợi tương ứng → tạo mã VietQR đúng cú pháp,
// rồi chờ hệ thống đối soát sao kê để trả Giấy chứng nhận.
(() => {
  const form = document.getElementById('donForm'), pay = document.getElementById('donPay');
  if (!form) return;
  const cfg = JSON.parse(document.getElementById('donCfg').textContent);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('vi-VN');
  const $$ = s => [...form.querySelectorAll(s)];
  const amount = form.elements.amount, err = form.querySelector('.err');
  const num = () => Number(String(amount.value).replace(/\D/g, '')) || 0;
  const type = () => (form.querySelector('[name=donorType]:checked') || {}).value;

  function refresh() {
    const n = num(), biz = ['to-chuc', 'doanh-nghiep'].includes(type()), group = ['to-chuc', 'doanh-nghiep', 'nhom', 'fandom'].includes(type());
    $$('.only-biz').forEach(e => e.hidden = !biz);
    $$('.only-confirm').forEach(e => e.hidden = n < cfg.confirmMin);
    document.getElementById('nameLbl').textContent = group ? 'Tên đơn vị / nhóm (in trên Giấy chứng nhận) *' : 'Họ và tên (in trên Giấy chứng nhận) *';
    $$('.amt').forEach(x => x.classList.toggle('on', Number(x.dataset.v) === n));
    const list = cfg.benefits[form.elements.campaign.value] || [];
    document.getElementById('benList').innerHTML = list.map(b => {
      const ok = n >= b.min && n > 0;
      return `<li class="${ok ? 'on' : ''}"><i>${ok ? '✓' : '○'}</i><span>${b.min ? `<b>Từ ${fmt(b.min)}đ:</b> ` : ''}${esc(b.text)}</span></li>`;
    }).join('') || '<li>Giấy chứng nhận ủng hộ điện tử</li>';
  }
  $$('.amt').forEach(b => b.addEventListener('click', () => { amount.value = fmt(b.dataset.v); refresh(); }));
  amount.addEventListener('input', () => { const n = num(); amount.value = n ? fmt(n) : ''; refresh(); });
  form.addEventListener('change', refresh);
  refresh();

  let timer;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    const n = num();
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (!form.elements.name.value.trim()) return fail('Vui lòng nhập họ tên hoặc tên đơn vị.');
    if (!form.elements.phone.value.trim()) return fail('Vui lòng nhập số điện thoại.');
    if (n < cfg.min) return fail(`Số tiền tối thiểu ${fmt(cfg.min)}đ.`);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const v = Object.fromEntries(new FormData(form));
      const r = await fetch('/api/donate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, amount: n, org: '', wantsConfirm: !!form.elements.wantsConfirm?.checked }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Không tạo được mã chuyển khoản');
      show(d);
    } catch (x) { fail(x.message); } finally { btn.disabled = false; }
  });

  function show(d) {
    form.hidden = true; pay.hidden = false;
    pay.innerHTML = `<div class="pay"><h2>Quét mã QR để chuyển khoản</h2><p class="fine">${esc(d.project)}</p><div class="qr">${d.qr}</div><dl class="bank"><div><dt>Số tiền</dt><dd><b class="copy" data-copy="${d.amount}">${fmt(d.amount)}đ</b></dd></div><div><dt>Nội dung</dt><dd><code class="copy" data-copy="${esc(d.memo)}">${esc(d.memo)}</code></dd></div><div><dt>Số tài khoản</dt><dd><b class="copy" data-copy="${esc(d.bank.account)}">${esc(d.bank.account)}</b> · ${esc(d.bank.name)}</dd></div><div><dt>Chủ tài khoản</dt><dd>${esc(d.bank.holder)}</dd></div></dl><p class="fine">${esc(cfg.note)}${d.wantsConfirm ? ' Giấy xác nhận tài trợ được cấp sau 7–10 ngày và tải được khi tra cứu.' : ''}</p><p class="pay-st"><span class="spin"></span><span>Đang chờ tiền về tài khoản…</span></p><div class="btns" style="justify-content:center"><button type="button" class="btn btn-primary" id="paidBtn">Tôi đã chuyển khoản</button><button type="button" class="btn btn-ghost" id="donAgain">Ủng hộ lượt khác</button></div></div>`;
    pay.querySelector('#donAgain').onclick = () => { clearTimeout(timer); pay.hidden = true; form.hidden = false; };
    pay.querySelector('#paidBtn').onclick = async e => {
      e.target.disabled = true; e.target.textContent = 'Đang kiểm tra sao kê…';
      await fetch('/api/donate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reported', token: d.token }) }).catch(() => {});
      clearTimeout(timer); poll();
    };
    pay.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let tries = 0;
    const poll = async () => {
      if (++tries > 120) { pay.querySelector('.pay-st').innerHTML = 'Chưa nhận được giao dịch. Giấy sẽ được cấp khi hệ thống đối soát xong; bạn tra cứu lại bằng số điện thoại.'; return; }
      try {
        const s = await (await fetch('/api/donate?token=' + d.token)).json();
        if (s.status === 'paid' && s.cert) {
          pay.querySelector('.pay-st').outerHTML = `<div class="pay-ok"><p><b>${esc(cfg.thanks)}</b></p><p>Đã nhận ${fmt(s.paid)}đ. Giấy chứng nhận số <code>${esc(s.cert.code)}</code> đã được cấp.</p><a class="btn btn-primary" href="${esc(s.cert.url)}">Xem Giấy chứng nhận</a></div>`;
          pay.querySelector('#paidBtn')?.remove();
          return;
        }
      } catch { /* thử lại */ }
      timer = setTimeout(poll, 15000);
    };
    timer = setTimeout(poll, 15000);
  }
})();
