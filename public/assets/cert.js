// Dựng Giấy chứng nhận trên canvas từ mẫu + dữ liệu gốc, tải về PDF/ảnh. Dùng chung cho trang xác thực và trang quản trị.
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
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    const imgs = {};
    for (const k of ['qr', 'signature', 'stamp']) imgs[k] = await loadImg(data.images?.[k]);
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
      const maxw = (f.maxw || (f.align === 'center' ? 88 : 60)) / 100 * W;
      while (ctx.measureText(text).width > maxw && size > 8) { size *= 0.95; ctx.font = font(); }
      ctx.fillStyle = f.color || '#14333c';
      ctx.textAlign = f.align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }
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

  const el = document.getElementById('certData'), canvas = document.getElementById('certCanvas');
  if (!el || !canvas) return;
  const data = JSON.parse(el.textContent);
  draw(canvas, data).then(() => {
    document.querySelector('.cv-wait')?.remove();
    const pdf = document.getElementById('dlPdf'), png = document.getElementById('dlPng');
    pdf.disabled = png.disabled = false;
    pdf.addEventListener('click', () => save(pdfFromCanvas(canvas), `GCN-${data.file}.pdf`));
    png.addEventListener('click', () => canvas.toBlob(b => save(b, `GCN-${data.file}.png`), 'image/png'));
  });
})();
