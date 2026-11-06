// Gửi đề xuất điều chỉnh thông tin Giấy chứng nhận từ trang xác thực.
(() => {
  const f = document.getElementById('fixForm');
  if (!f) return;
  if (location.hash === '#dieu-chinh') { const d = document.getElementById('dieu-chinh'); d.open = true; setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); }
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const err = f.querySelector('.err'), btn = f.querySelector('button');
    err.hidden = true; btn.disabled = true;
    const v = Object.fromEntries(new FormData(f));
    try {
      const r = await fetch('/api/cert-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, code: f.dataset.code, s: f.dataset.s }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gửi chưa được, vui lòng thử lại.');
      f.closest('.fix').innerHTML = '<p class="fine center"><b>Đã gửi đề xuất.</b> Ban Tổ chức sẽ kiểm tra; sau khi duyệt, giấy được cập nhật và trang này ghi rõ thông tin đã điều chỉnh.</p>';
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  });
})();
