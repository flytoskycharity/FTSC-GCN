// Form ủng hộ: tạo mã VietQR đúng cú pháp, rồi chờ hệ thống đối soát sao kê để trả Giấy chứng nhận.
(() => {
  const form = document.getElementById('donForm'), pay = document.getElementById('donPay');
  if (!form) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const amount = form.elements.amount, err = form.querySelector('.err');
  const fmt = n => Number(n || 0).toLocaleString('vi-VN');
  form.querySelectorAll('.amt').forEach(b => b.addEventListener('click', () => {
    form.querySelectorAll('.amt').forEach(x => x.classList.toggle('on', x === b));
    amount.value = fmt(b.dataset.v);
  }));
  amount.addEventListener('input', () => {
    const n = Number(amount.value.replace(/\D/g, ''));
    amount.value = n ? fmt(n) : '';
    form.querySelectorAll('.amt').forEach(x => x.classList.toggle('on', Number(x.dataset.v) === n));
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    const n = Number(amount.value.replace(/\D/g, '')), min = Number(amount.dataset.min) || 0;
    if (n < min) { err.textContent = `Số tiền tối thiểu ${fmt(min)} VNĐ.`; err.hidden = false; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await fetch('/api/donate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign: form.dataset.campaign, name: form.elements.name.value, phone: form.elements.phone.value, email: form.elements.email.value, org: form.elements.org.value, amount: n }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Không tạo được mã chuyển khoản');
      show(d);
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });

  function show(d) {
    form.hidden = true;
    pay.hidden = false;
    pay.innerHTML = `<div class="pay"><p><b>Quét mã QR bằng ứng dụng ngân hàng</b></p><div class="qr">${d.qr}</div><dl class="bank"><div><dt>Số tiền</dt><dd>${esc(fmt(d.amount))} VNĐ</dd></div><div><dt>Nội dung</dt><dd><code class="copy" data-copy="${esc(d.memo)}">${esc(d.memo)}</code></dd></div><div><dt>Tài khoản</dt><dd><b class="copy" data-copy="${esc(d.bank.account)}">${esc(d.bank.account)}</b> · ${esc(d.bank.name)}</dd></div><div><dt>Chủ tài khoản</dt><dd>${esc(d.bank.holder)}</dd></div></dl><p class="pay-st"><span class="spin"></span><span>Đang chờ tiền về tài khoản…</span></p><p class="fine">Giữ nguyên nội dung chuyển khoản. Bạn có thể đóng trang; Giấy chứng nhận vẫn được cấp và tra cứu được bằng số điện thoại.</p><button type="button" class="btn btn-ghost btn-sm" id="donAgain">Ủng hộ lượt khác</button></div>`;
    pay.querySelector('#donAgain').addEventListener('click', () => { pay.hidden = true; form.hidden = false; clearTimeout(timer); });
    pay.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let tries = 0, timer;
    const poll = async () => {
      if (++tries > 120) { pay.querySelector('.pay-st').innerHTML = 'Chưa nhận được giao dịch. Giấy sẽ được cấp khi hệ thống đối soát xong; bạn tra cứu lại sau bằng số điện thoại.'; return; }
      try {
        const r = await fetch('/api/donate?token=' + d.token), s = await r.json();
        if (s.status === 'paid' && s.cert) {
          pay.querySelector('.pay-st').outerHTML = `<div class="pay-ok"><p><b>Cảm ơn bạn! Đã nhận ${esc(fmt(s.paid))} VNĐ.</b></p><p>Giấy chứng nhận số <code>${esc(s.cert.code)}</code> đã được cấp.</p><a class="btn btn-primary" href="${esc(s.cert.url)}">Xem Giấy chứng nhận</a></div>`;
          return;
        }
      } catch { /* thử lại */ }
      timer = setTimeout(poll, 15000);
    };
    timer = setTimeout(poll, 15000);
  }
})();
