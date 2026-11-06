// Biểu mẫu quyên góp: chọn Quỹ chung/dự án, đối tượng, số tiền → quyền lợi tương ứng → tạo mã VietQR đúng cú pháp,
// rồi bấm "Tôi đã chuyển tiền"; Ban Tổ chức duyệt và cấp Giấy chứng nhận, người ủng hộ tra cứu trong 24 giờ.
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

  // Dự án có quy đổi (VD: 50.000đ = 1 cây): chọn số lượng, số tiền = số lượng × đơn giá.
  const unitBox = form.querySelector('.unit-box'), qty = form.elements.qty, conv = form.querySelector('.unit-conv'), amtBox = form.querySelector('.amts');
  const unit = () => cfg.units[form.elements.campaign.value] || null;
  let lastCamp = null;
  function setupUnit() {
    const u = unit();
    unitBox.hidden = !u;
    if (u) {
      unitBox.querySelector('.unit-note').textContent = `${fmt(u.price)}đ = 1 ${u.name}${u.strict ? ' · nhận theo bội số' : ''}`;
      unitBox.querySelector('.qty-name').textContent = u.name;
      amtBox.innerHTML = [1, 2, 5, 10, 20, 50].map(k => `<button type="button" class="amt" data-v="${k * u.price}">${k} ${esc(u.name)}</button>`).join('');
      amount.readOnly = u.strict;
      amount.placeholder = u.strict ? '' : 'Hoặc nhập số khác';
      if (!num() || (u.strict && num() % u.price)) amount.value = fmt(u.price * (Number(qty.value) || 1));
    } else {
      amtBox.innerHTML = (cfg.amounts || []).map(a => `<button type="button" class="amt" data-v="${a}">${fmt(a)}</button>`).join('');
      amount.readOnly = false; amount.placeholder = 'Hoặc nhập số khác';
    }
  }
  amtBox.addEventListener('click', e => { const b = e.target.closest('.amt'); if (!b) return; amount.value = fmt(b.dataset.v); const u = unit(); if (u) qty.value = Math.floor(b.dataset.v / u.price); refresh(); });
  unitBox.addEventListener('click', e => { const b = e.target.closest('.qbtn'); if (!b) return; qty.value = Math.max(1, (Number(qty.value) || 1) + Number(b.dataset.d)); qty.dispatchEvent(new Event('input')); });
  qty.addEventListener('input', () => { const u = unit(); const q = Math.max(0, Math.floor(Number(String(qty.value).replace(/\D/g, '')) || 0)); qty.value = q || ''; if (u) amount.value = q ? fmt(q * u.price) : ''; refresh(); });

  function refresh() {
    if (form.elements.campaign.value !== lastCamp) { lastCamp = form.elements.campaign.value; setupUnit(); }
    const u = unit();
    if (u) {
      const n0 = num(), q = Math.floor(n0 / u.price);
      if (document.activeElement !== qty && n0) qty.value = q || '';
      conv.hidden = !n0;
      conv.textContent = n0 < u.price ? `Tối thiểu ${fmt(u.price)}đ (1 ${u.name})` : `= ${fmt(q)} ${u.name}${n0 % u.price ? ` + ${fmt(n0 % u.price)}đ` : ''}`;
    } else conv.hidden = true;
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
  amount.addEventListener('input', () => { const n = num(); amount.value = n ? fmt(n) : ''; refresh(); });
  form.addEventListener('change', refresh);
  refresh();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    const n = num();
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (!form.elements.name.value.trim()) return fail('Vui lòng nhập họ tên hoặc tên đơn vị.');
    if (!form.elements.phone.value.trim()) return fail('Vui lòng nhập số điện thoại.');
    if (n < cfg.min) return fail(`Số tiền tối thiểu ${fmt(cfg.min)}đ.`);
    const u = unit();
    if (u && u.strict && n % u.price) return fail(`Dự án nhận theo bội số ${fmt(u.price)}đ (1 ${u.name}).`);
    if (u && n < u.price) return fail(`Tối thiểu ${fmt(u.price)}đ (1 ${u.name}).`);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const v = Object.fromEntries(new FormData(form));
      const r = await fetch('/api/donate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, qty: undefined, amount: n, org: '', wantsConfirm: !!form.elements.wantsConfirm?.checked }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Không tạo được mã chuyển khoản');
      show(d);
    } catch (x) { fail(x.message); } finally { btn.disabled = false; }
  });

  function show(d) {
    form.hidden = true; pay.hidden = false;
    pay.innerHTML = `<div class="pay"><h2>Quét mã QR để chuyển khoản</h2><p class="fine">${esc(d.project)}${d.units ? ' · ' + esc(d.units) : ''}</p><div class="qr">${d.qr}</div><dl class="bank"><div><dt>Số tiền</dt><dd><b class="copy" data-copy="${d.amount}">${fmt(d.amount)}đ</b></dd></div><div><dt>Nội dung</dt><dd><code class="copy" data-copy="${esc(d.memo)}">${esc(d.memo)}</code></dd></div><div><dt>Số tài khoản</dt><dd><b class="copy" data-copy="${esc(d.bank.account)}">${esc(d.bank.account)}</b> · ${esc(d.bank.name)}</dd></div><div><dt>Chủ tài khoản</dt><dd>${esc(d.bank.holder)}</dd></div></dl><p class="fine">${esc(cfg.note)}</p><div class="btns" style="justify-content:center"><button type="button" class="btn btn-primary" id="paidBtn">Tôi đã chuyển tiền</button><button type="button" class="btn btn-ghost" id="donAgain">Ủng hộ lượt khác</button></div></div>`;
    pay.querySelector('#donAgain').onclick = () => { pay.hidden = true; form.hidden = false; };
    // Bấm "Tôi đã chuyển tiền": đánh dấu để admin ưu tiên duyệt, không bắt người ủng hộ chờ.
    pay.querySelector('#paidBtn').onclick = e => {
      fetch('/api/donate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reported', token: d.token }) }).catch(() => {});
      e.target.closest('.btns').outerHTML = `<div class="pay-ok"><p><b>${esc(cfg.paidNote || cfg.thanks)}</b></p>${d.wantsConfirm ? '<p>Giấy xác nhận tài trợ được cấp sau 7–10 ngày, tải được khi tra cứu.</p>' : ''}<div class="btns" style="justify-content:center"><a class="btn btn-primary" href="/tra-cuu">Đến trang Tra cứu</a><button type="button" class="btn btn-ghost" id="donAgain2">Ủng hộ lượt khác</button></div></div>`;
      pay.querySelector('#donAgain2').onclick = () => { pay.hidden = true; form.hidden = false; };
    };
    pay.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
