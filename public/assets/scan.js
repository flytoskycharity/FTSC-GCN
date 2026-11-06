// Quét mã QR trên giấy bằng camera, mở trang xác thực tương ứng.
(() => {
  const btn = document.getElementById('scanBtn'), video = document.getElementById('scanVideo');
  if (!btn || !navigator.mediaDevices?.getUserMedia) { if (btn) btn.hidden = true; return; }
  let stream, timer;
  const stop = () => { clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); video.hidden = true; btn.querySelector('span').textContent = 'Quét QR bằng camera'; stream = null; };
  const loadLib = () => window.jsQR ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/assets/jsQR.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  btn.addEventListener('click', async () => {
    if (stream) return stop();
    try {
      await loadLib();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch { alert('Không mở được camera. Hãy cho phép trình duyệt dùng camera, hoặc nhập mã giấy.'); return; }
    video.srcObject = stream; video.hidden = false; await video.play();
    btn.querySelector('span').textContent = 'Dừng quét';
    const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    timer = setInterval(() => {
      if (!video.videoWidth) return;
      c.width = video.videoWidth; c.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const r = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (!r?.data) return;
      stop();
      try {
        const u = new URL(r.data);
        const ours = u.origin === location.origin || (u.protocol === 'https:' && /(^|\.)flytoskycharity\.vn$/.test(u.hostname));
        if (ours && /\/(xac-thuc|xac-minh)\//.test(u.pathname)) { location.href = u.href; return; }
        if (!ours) { alert('Mã QR này không thuộc hệ thống Fly To Sky: ' + u.hostname + '. Giấy có thể không chính thức.'); return; }
      } catch { /* không phải đường dẫn */ }
      const code = document.getElementById('code');
      code.value = r.data.slice(0, 60); code.focus();
    }, 300);
  });
})();
