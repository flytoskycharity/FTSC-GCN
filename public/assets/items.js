// Quyên góp hiện vật: chọn hiện vật + số lượng, thông tin người gửi, văn phòng nhận (Hà Nội/Gia Lai),
// khai bưu gửi (đơn vị vận chuyển, mã bưu gửi, ngày gửi, ảnh). ?gui=<mã> mở chế độ bổ sung thông tin bưu gửi.
(() => {
  const form = document.getElementById('itemForm'), done = document.getElementById('itemDone');
  if (!form) return;
  const cfg = JSON.parse(document.getElementById('itemCfg').textContent);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('vi-VN');
  const $ = s => form.querySelector(s), $$ = s => [...form.querySelectorAll(s)];
  const E = form.elements, err = $('.err'), rows = $('#itemRows');
  const today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
  $$('input[type=date]').forEach(i => i.max = today);
  E.shipDate2.removeAttribute('max');

  // ---------- Danh sách hiện vật ----------
  const types = () => cfg.targets[E.campaign.value]?.types || [];
  function row(v = {}) {
    const t = types(), d = document.createElement('div');
    d.className = 'irow';
    const known = t.find(x => x.name === v.name);
    d.innerHTML = `${t.length ? `<select class="i-type" aria-label="Loại hiện vật">${t.map(x => `<option value="${esc(x.name)}" data-unit="${esc(x.unit)}"${known && known.name === x.name ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="">Khác…</option></select>` : ''}<input class="i-name" placeholder="Tên hiện vật, VD: Sách giáo khoa lớp 5" maxlength="80" value="${esc(known ? '' : v.name || '')}"${t.length && known !== undefined ? ' hidden' : ''}><input class="i-qty" inputmode="numeric" placeholder="Số lượng (nếu có)" value="${esc(v.qty || '')}" aria-label="Số lượng"><input class="i-unit" placeholder="Đơn vị" maxlength="20" value="${esc(v.unit || known?.unit || t[0]?.unit || '')}" aria-label="Đơn vị"><input class="i-note" placeholder="Mô tả, tình trạng (VD: còn mới 90%)" maxlength="200" value="${esc(v.note || '')}"><button type="button" class="i-del" aria-label="Bỏ dòng này">×</button>`;
    const sel = d.querySelector('.i-type'), name = d.querySelector('.i-name'), unit = d.querySelector('.i-unit');
    if (sel) {
      if (!known && v.name) sel.value = '';
      const sync = () => { const o = sel.selectedOptions[0]; name.hidden = !!sel.value; if (sel.value) unit.value = o.dataset.unit || unit.value; else name.focus(); };
      sel.addEventListener('change', sync);
      name.hidden = !!sel.value;
    }
    d.querySelector('.i-qty').addEventListener('input', e => { const n = Number(e.target.value.replace(/\D/g, '')) || 0; e.target.value = n ? fmt(n) : ''; });
    d.querySelector('.i-del').onclick = () => { if (rows.children.length > 1) d.remove(); else d.querySelectorAll('input').forEach(i => i.value = ''); };
    rows.append(d);
  }
  const readRows = () => [...rows.children].map(d => ({
    name: (d.querySelector('.i-type')?.value || d.querySelector('.i-name').value).trim(),
    qty: Number(d.querySelector('.i-qty').value.replace(/\D/g, '')) || 0,
    unit: d.querySelector('.i-unit').value.trim(), note: d.querySelector('.i-note').value.trim(),
  })).filter(i => i.name || i.qty);
  function setCampaign() {
    rows.innerHTML = ''; row();
    const n = cfg.targets[E.campaign.value]?.note, p = $('.item-req');
    p.hidden = !n; p.textContent = n ? 'Yêu cầu: ' + n : '';
  }
  E.campaign.addEventListener('change', setCampaign);
  $('#addRow').onclick = () => row();
  setCampaign();

  // ---------- Hiển thị theo lựa chọn ----------
  const val = n => (form.querySelector(`[name=${n}]:checked`) || {}).value;
  function refresh() {
    const biz = ['to-chuc', 'doanh-nghiep'].includes(val('donorType')), post = val('shipMethod') !== 'direct';
    $$('.only-biz').forEach(e => e.hidden = !biz);
    $('.only-post').hidden = !post; $('.only-direct').hidden = post;
    $('.ship-now').hidden = E.later.checked;
    const est = Number(E.estValue.value.replace(/\D/g, '')) || 0;
    $$('.only-confirm').forEach(e => e.hidden = !est || est < cfg.confirmMin);
  }
  E.estValue.addEventListener('input', () => { const n = Number(E.estValue.value.replace(/\D/g, '')) || 0; E.estValue.value = n ? fmt(n) : ''; refresh(); });
  form.addEventListener('change', refresh);
  refresh();

  // ---------- Ảnh bưu gửi: thu nhỏ còn ≤1600px, JPEG ----------
  async function shrink(file) {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .82);
  }
  function photoInput(root) {
    const inp = root.querySelector('[name=photos]'), prev = root.querySelector('.ph-prev');
    let list = [];
    inp.addEventListener('change', async () => {
      for (const f of [...inp.files].slice(0, 6 - list.length)) { try { list.push(await shrink(f)); } catch { /* không phải ảnh */ } }
      inp.value = '';
      prev.innerHTML = list.map((u, i) => `<span><img src="${u}" alt="Ảnh bưu gửi ${i + 1}"><button type="button" data-i="${i}" aria-label="Bỏ ảnh">×</button></span>`).join('');
    });
    prev.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; list.splice(+b.dataset.i, 1); b.parentNode.remove(); prev.querySelectorAll('[data-i]').forEach((x, i) => x.dataset.i = i); });
    return () => list;
  }
  const photos = photoInput(form);

  const post = body => fetch('/api/donate-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'Có lỗi, vui lòng thử lại.'); return d; });
  const fail = (box, m) => { box.textContent = m; box.hidden = false; box.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const officeHtml = o => o ? `<div class="bank"><h3>Gửi về: ${esc(o.label)}</h3><dl><div><dt>Người nhận</dt><dd>${esc(o.receiver)}</dd></div><div><dt>Điện thoại</dt><dd><b class="copy" data-copy="${esc(o.phone)}">${esc(o.phone)}</b></dd></div><div><dt>Địa chỉ</dt><dd><span class="copy" data-copy="${esc(o.address)}">${esc(o.address)}</span></dd></div></dl></div>` : '';

  form.addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true;
    const items = readRows();
    if (!items.length || items.some(i => !i.name)) return fail(err, 'Vui lòng nhập tên cho từng hiện vật.');
    if (!E.name.value.trim()) return fail(err, 'Vui lòng nhập họ tên người gửi hoặc tên đơn vị.');
    if (!E.phone.value.trim()) return fail(err, 'Vui lòng nhập số điện thoại.');
    if (E.address.value.trim().length < 10) return fail(err, 'Vui lòng nhập địa chỉ người gửi đầy đủ.');
    const isPost = val('shipMethod') !== 'direct', later = E.later.checked;
    if (isPost && !E.prepaid.checked) return fail(err, 'Vui lòng xác nhận bạn thanh toán trước phí vận chuyển (Fly To Sky không nhận hàng thu hộ).');
    if (isPost && !later && (!E.carrier.value.trim() || !E.tracking.value.trim() || !E.shipDate.value || !photos().length)) return fail(err, 'Vui lòng nhập đơn vị vận chuyển, mã bưu gửi, ngày gửi và chụp ảnh bưu gửi, hoặc chọn “Tôi chưa gửi hàng, sẽ bổ sung sau”.');
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Đang gửi…';
    try {
      const d = await post({
        campaign: E.campaign.value, items, estValue: Number(E.estValue.value.replace(/\D/g, '')) || 0, donorType: val('donorType'),
        name: E.name.value, phone: E.phone.value, address: E.address.value, email: E.email.value, position: E.position.value, taxCode: E.taxCode.value,
        shipMethod: isPost ? 'post' : 'direct', office: val('office'), prepaid: E.prepaid.checked, later,
        carrier: E.carrier.value, tracking: E.tracking.value, shipDate: isPost ? E.shipDate.value : E.shipDate2.value, photos: isPost && !later ? photos() : [],
        wantsConfirm: !!E.wantsConfirm?.checked && !$('.only-confirm').hidden, message: E.message.value, website: E.website.value,
      });
      const link = `${location.origin}/ung-ho/hien-vat?gui=${d.token}`;
      form.hidden = true; done.hidden = false;
      done.innerHTML = `<div class="pay"><h2>Đã đăng ký quyên góp hiện vật</h2><p class="fine">${esc(d.project)}</p><p>Mã quyên góp của bạn</p><p class="hv-code copy" data-copy="${esc(d.code)}">${esc(d.code)}</p><p><b>Ghi mã ${esc(d.code)} và số điện thoại của bạn lên ngoài kiện hàng.</b></p></div>${d.method === 'post' ? officeHtml(d.office) : `<div class="bank"><h3>Mang đến: ${esc(d.office.label)}</h3><dl><div><dt>Địa chỉ</dt><dd>${esc(d.office.address)}</dd></div><div><dt>Liên hệ trước</dt><dd><b>${esc(d.office.phone)}</b></dd></div></dl></div>`}<p class="ship-note">${esc(cfg.note)}</p>${d.needShipping ? `<div class="card"><h3>Sau khi gửi hàng</h3><p>Mở đường dẫn dưới đây để khai <b>đơn vị vận chuyển, mã bưu gửi, ngày gửi</b> và <b>chụp ảnh bưu gửi</b>. Hãy lưu lại đường dẫn này (chụp màn hình hoặc sao chép):</p><p><a href="${esc(link)}" class="copy-link">${esc(link)}</a></p><button type="button" class="btn btn-ghost btn-sm copy" data-copy="${esc(link)}">Sao chép đường dẫn</button></div>` : ''}<div class="pay-ok"><p><b>${esc(cfg.paidNote)}</b></p>${d.wantsConfirm ? '<p>Giấy xác nhận tài trợ được cấp sau khi nhận hàng 7–10 ngày, tải được khi tra cứu.</p>' : ''}<div class="btns" style="justify-content:center"><a class="btn btn-primary" href="/tra-cuu">Đến trang Tra cứu</a></div></div>`;
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (x) { fail(err, x.message); } finally { btn.disabled = false; btn.textContent = 'Đăng ký quyên góp hiện vật'; }
  });

  // ---------- Bổ sung thông tin bưu gửi: /ung-ho/hien-vat?gui=<mã bí mật> ----------
  const token = new URLSearchParams(location.search).get('gui');
  if (!token) return;
  form.hidden = true; done.hidden = false;
  done.innerHTML = '<p class="fine">Đang tải…</p>';
  fetch('/api/donate-items?token=' + encodeURIComponent(token)).then(r => r.json()).then(d => {
    if (d.error) { done.innerHTML = `<p class="err">${esc(d.error)}</p>`; return; }
    const ST = { pending: 'Chờ nhận hàng', paid: 'Đã nhận hàng', cancelled: 'Đã hủy' };
    const items = (d.received.length ? d.received : d.items).map(i => `<li>${i.qty ? fmt(i.qty) + ' ' + esc(i.unit) : ''} ${esc(i.name)}${i.note ? ` <span class="fine">(${esc(i.note)})</span>` : ''}</li>`).join('');
    const open = d.status === 'pending';
    done.innerHTML = `<h2>Quyên góp hiện vật <span class="hv-code">${esc(d.code)}</span></h2><p class="fine">${esc(d.project)} · ${esc(d.name)} · <b>${ST[d.status] || d.status}</b></p><ul>${items}</ul>${d.cert ? `<p><a class="btn btn-primary" href="${esc(d.cert.url)}">Xem Giấy xác nhận ${esc(d.cert.code)}</a></p>` : ''}${officeHtml(d.office)}${open ? `<form id="shipForm" class="mt"><h3>Thông tin bưu gửi</h3><div class="ship-slot"></div><button class="btn btn-accent btn-block" type="submit">Lưu thông tin bưu gửi</button><p class="err" hidden></p></form>` : ''}`;
    if (!open) return;
    const sf = done.querySelector('#shipForm'), slot = sf.querySelector('.ship-slot'), now = form.querySelector('.ship-now');
    slot.append(now); now.hidden = false;
    sf.elements.carrier.value = d.carrier || ''; sf.elements.tracking.value = d.tracking || ''; sf.elements.shipDate.value = d.shipDate || '';
    if (d.photos) slot.insertAdjacentHTML('beforeend', `<p class="fine">Đã có ${d.photos} ảnh bưu gửi. Ảnh chọn thêm sẽ được bổ sung.</p>`);
    sf.addEventListener('submit', async e => {
      e.preventDefault(); const er = sf.querySelector('.err'); er.hidden = true;
      const f = sf.elements;
      if (d.method === 'post' && (!f.carrier.value.trim() || !f.tracking.value.trim() || !f.shipDate.value || (!photos().length && !d.photos))) return fail(er, 'Vui lòng nhập đủ đơn vị vận chuyển, mã bưu gửi, ngày gửi và ít nhất 1 ảnh bưu gửi.');
      const btn = sf.querySelector('button[type=submit]'); btn.disabled = true;
      try { await post({ action: 'shipping', token, carrier: f.carrier.value, tracking: f.tracking.value, shipDate: f.shipDate.value, photos: photos() }); sf.outerHTML = '<div class="pay-ok"><p><b>Đã lưu thông tin bưu gửi. Cảm ơn bạn!</b></p><p>Khi nhận và kiểm đếm hiện vật, Ban Tổ chức sẽ cấp Giấy xác nhận ủng hộ hiện vật.</p></div>'; }
      catch (x) { fail(er, x.message); btn.disabled = false; }
    });
  }).catch(() => { done.innerHTML = '<p class="err">Không tải được thông tin. Vui lòng thử lại.</p>'; });
})();
