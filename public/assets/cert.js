// Dựng Giấy chứng nhận trên canvas từ mẫu + dữ liệu gốc: CHỈ chạy ở trang quản trị (ghép thành một ảnh rồi lưu lên máy chủ).
// Trang công khai chỉ nhận ảnh đã ghép sẵn và tải về ảnh/PDF từ ảnh đó, không bao giờ có nền trống riêng.
(() => {
  const loadImg = src => new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = src;
  });

  async function draw(canvas, data) {
    const t = data.tpl, W = Number(t.width) || 1600, H = Number(t.height) || 1131;
    const [serif, sans] = data.fonts || ['Source Serif 4', 'Manrope'];
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (document.fonts) {
      await Promise.all([serif, sans].flatMap(f => ['400', '700'].map(w => document.fonts.load(`${w} 40px "${f}"`, 'ẮẰẲẴẶ ĐƯỜNG Việt').catch(() => {}))));
    }
    const bg = await loadImg(t.background);
    if (data.strict && t.background && !bg) throw new Error('không tải được ảnh nền mẫu giấy');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    const imgs = {};
    for (const k of ['qr', 'signature', 'stamp']) {
      imgs[k] = await loadImg(data.images?.[k]);
      if (data.strict && data.images?.[k] && !imgs[k]) throw new Error('không tải được ảnh ' + ({ qr: 'mã QR', signature: 'chữ ký', stamp: 'con dấu' })[k]);
    }
    for (const f of t.fields || []) {
      if (f.visible === false) continue;
      const x = f.x / 100 * W, y = f.y / 100 * H;
      if (['qr', 'signature', 'stamp'].includes(f.key)) {
        const im = imgs[f.key];
        if (!im) continue;
        const w = (f.w || 10) / 100 * W, h = im.naturalHeight && im.naturalWidth ? w * im.naturalHeight / im.naturalWidth : w;
        ctx.drawImage(im, x, y, w, h);
        continue;
      }
      let text = f.key === 'text' ? (f.text || '') : (data.values?.[f.key] || '');
      if (!text) continue;
      text = (f.prefix || '') + text;
      if (f.upper) text = text.toLocaleUpperCase('vi');
      let size = (f.size || 2) / 100 * W;
      const family = f.font === 'serif' ? `"${serif}",Georgia,serif` : `"${sans}",Arial,sans-serif`;
      const font = () => `${f.bold ? '700' : '400'} ${size}px ${family}`;
      ctx.font = font();
      // Chữ dài tự thu nhỏ để không tràn lề: giới hạn theo khoảng trống thực tế từ vị trí đặt chữ tới mép giấy
      // (chừa lề 5%), và theo độ rộng tối đa admin đặt cho ô (nếu có).
      const pad = 0.05 * W, align = f.align || 'center';
      const room = align === 'center' ? 2 * Math.min(x, W - x) - 2 * pad : align === 'right' ? x - pad : W - x - pad;
      const maxw = Math.max(W * 0.05, Math.min(room, f.maxw ? f.maxw / 100 * W : Infinity));
      ctx.font = font();
      const wNow = ctx.measureText(text).width;
      if (wNow > maxw) { size = Math.max(6, size * maxw / wNow); ctx.font = font(); }
      while (ctx.measureText(text).width > maxw && size > 6) { size *= 0.97; ctx.font = font(); }
      ctx.fillStyle = f.color || '#14333c';
      ctx.textAlign = f.align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }
    // Hình chìm mã giấy rải mờ khắp giấy: khó cắt ghép, khó xóa chữ để lấy lại nền.
    if (data.watermark) {
      ctx.save(); ctx.globalAlpha = 0.045; ctx.fillStyle = '#05228b'; ctx.font = `700 ${Math.round(W * 0.013)}px "${sans}",Arial,sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 7);
      const step = W * 0.26, gap = W * 0.07;
      for (let y = -H; y < H; y += gap) for (let x = -W; x < W; x += step) ctx.fillText(data.watermark, x + (Math.round(y / gap) % 2 ? step / 2 : 0), y);
      ctx.restore();
    }
    // Vẽ lại QR sau cùng để hình chìm không làm khó quét.
    const qf = (t.fields || []).find(f => f.key === 'qr' && f.visible !== false);
    if (data.watermark && qf && imgs.qr) { const w = (qf.w || 10) / 100 * W; ctx.fillStyle = '#fff'; ctx.fillRect(qf.x / 100 * W, qf.y / 100 * H, w, w); ctx.drawImage(imgs.qr, qf.x / 100 * W, qf.y / 100 * H, w, w); }
    return canvas;
  }

  // PDF tối giản: một trang, một ảnh JPEG phủ kín trang.
  function pdfFromCanvas(canvas) {
    const jpg = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const W = canvas.width, H = canvas.height, pw = W >= H ? 842 : 595, ph = Math.round(pw * H / W);
    const enc = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255);
    const parts = [], offsets = [];
    let len = 0;
    const add = s => { const b = typeof s === 'string' ? enc(s) : s; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; add(`${n} 0 obj\n`); body(); add('\nendobj\n'); };
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => { add(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); add(enc(jpg)); add('\nendstream'); });
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(5, () => add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    const xref = len;
    add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offsets[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  const save = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  window.FTSCert = { draw, pdfFromCanvas, save };

  // Trang xác thực: tải ảnh/PDF từ ảnh giấy đã ghép sẵn.
  const img = document.getElementById('certImg'), pdf = document.getElementById('dlPdf');
  if (!img || !pdf) return;
  const ready = () => { pdf.disabled = false; };
  if (img.complete && img.naturalWidth) ready(); else img.addEventListener('load', ready);
  pdf.addEventListener('click', () => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    save(pdfFromCanvas(c), `GCN-${pdf.dataset.file}.pdf`);
  });
})();
