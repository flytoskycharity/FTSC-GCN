// Thẻ "Kiểm tra giấy": đọc mã QR từ ảnh/PDF, dựng lại giấy gốc và so từng dòng thông tin.
// Thuật toán so ảnh dùng chung với website Tủ sách Bồ Câu Trắng (Khuyendoc).
// Giấy sai, bị thu hồi, không đọc được QR hoặc không xác nhận được đều được gửi kèm ảnh vào nhật ký để admin kiểm tra.
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const out = $('#lkOut');
  if (!out || !$('#ck')) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dmy = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || ''); };

  // Chuyển thẻ Tra cứu / Kiểm tra giấy
  const panes = { lk: $('#lk'), ck: $('#ck') };
  $$('[data-pane]').forEach(b => b.addEventListener('click', () => {
    $$('[data-pane]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    Object.entries(panes).forEach(([k, e]) => e.hidden = k !== b.dataset.pane);
    history.replaceState(null, '', b.dataset.pane === 'ck' ? '/tra-cuu?tab=kiem-tra' : '/tra-cuu');
    out.innerHTML = b.dataset.pane === 'ck' ? '' : '<p class="empty">Nhập thông tin ở trên để bắt đầu tra cứu.</p>';
  }));

  const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  const OURS = /\/(xac-thuc|xac-minh)\//;
  const nextTick = () => new Promise(r => setTimeout(r));

  // ---------- Đọc mã QR ----------
  function detect(c) { const g = c.getContext('2d', { willReadFrequently: true }), d = g.getImageData(0, 0, c.width, c.height); return window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' }); }
  // Một ảnh có thể có nhiều mã QR: đọc xong mã khác thì che lại rồi đọc tiếp.
  function scanAll(c) {
    const g = c.getContext('2d');
    let other = null;
    for (let i = 0; i < 5; i++) {
      const r = detect(c); if (!r) return other;
      const l = r.location, pts = [l.topLeftCorner, l.topRightCorner, l.bottomLeftCorner];
      if (OURS.test(r.data)) return { data: r.data, pts };
      other = other || { data: r.data, pts };
      const all = [...pts, l.bottomRightCorner], xs = all.map(p => p.x), ys = all.map(p => p.y), pad = (Math.max(...xs) - Math.min(...xs)) * .12;
      g.fillStyle = '#fff'; g.fillRect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);
    }
    return other;
  }
  function slice(src, sx, sy, sw, sh, w) { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(w * sh / sw); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height); return c; }
  const mapped = (r, sx, sy, k) => r && { data: r.data, pts: r.pts.map(p => ({ x: sx + p.x / k, y: sy + p.y / k })) };
  async function fromImage(src, W, H) {
    for (const w of [Math.min(W, 3000), W < 1500 ? W * 2 : 1600]) { const r = scanAll(slice(src, 0, 0, W, H, w)); if (r) return mapped(r, 0, 0, w / W); await nextTick(); }
    for (const n of [2, 3]) for (let y = 0; y < n * 2 - 1; y++) for (let x = 0; x < n * 2 - 1; x++) {
      const sw = W / n, sh = H / n, sx = x * sw / 2, sy = y * sh / 2, w = Math.min(1800, Math.max(1000, sw * 2)), r = scanAll(slice(src, sx, sy, sw, sh, w));
      if (r) return mapped(r, sx, sy, w / sw); await nextTick();
    }
    return null;
  }
  async function readFile(f) {
    if (!window.jsQR) await load('/assets/vendor/jsQR.js');
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      const P = await import('/assets/vendor/pdf.min.mjs');
      P.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdf.worker.min.mjs';
      const doc = await P.getDocument({ data: await f.arrayBuffer() }).promise;
      let first = null;
      for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
        const pg = await doc.getPage(i), v = pg.getViewport({ scale: 3 }), c = document.createElement('canvas');
        c.width = v.width; c.height = v.height;
        await pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: v }).promise;
        first = first || c;
        const r = await fromImage(c, c.width, c.height);
        if (r) return { ...r, src: c, W: c.width, H: c.height };
      }
      return { data: null, src: first, W: first?.width, H: first?.height };
    }
    const b = await createImageBitmap(f), r = await fromImage(b, b.width, b.height);
    return { ...(r || { data: null }), src: b, W: b.width, H: b.height };
  }

  // ---------- So từng dòng thông tin của giấy tải lên với giấy gốc ----------
  let GW = 2400; const LIMIT = .015;
  function canvasOf(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; draw(g); return c; }
  function grayOf(c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, o = new Float32Array(c.width * c.height); for (let i = 0; i < o.length; i++) o[i] = .3 * d[i * 4] + .59 * d[i * 4 + 1] + .11 * d[i * 4 + 2]; return o; }
  // Chuẩn hóa độ sáng theo phần lõi (in = lề bỏ qua) để chữ của dòng bên cạnh lọt vào vùng tìm kiếm không làm lệch kết quả.
  function region(g, w, x0, y0, rw, rh, inn = 0) {
    const o = new Float32Array(rw * rh); let m = 0, n = 0;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const v = g[(y0 + y) * w + x0 + x]; o[y * rw + x] = v; if (x >= inn && x < rw - inn && y >= inn && y < rh - inn) { m += v; n++; } }
    m /= n || 1; let sd = 0;
    for (let y = inn; y < rh - inn; y++) for (let x = inn; x < rw - inn; x++) sd += (o[y * rw + x] - m) ** 2;
    sd = Math.sqrt(sd / (n || 1)) || 1;
    for (let i = 0; i < o.length; i++) o[i] = (o[i] - m) / sd;
    return o;
  }
  // Mỗi đoạn của dòng tự tìm độ lệch riêng để ảnh hơi nghiêng vẫn so được, rồi đo chỗ khác biệt đậm nhất cỡ một ký tự.
  function score(base, cand, w, h, R) {
    const M = Math.round(GW / 130), x0 = Math.max(M + 1, R.x), y0 = Math.max(M + 1, R.y), rw = Math.min(R.w, w - x0 - M - 1), rh = Math.min(R.h, h - y0 - M - 1);
    if (rw < 8 || rh < 8) return null;
    const a = region(base, w, x0, y0, rw, rh), ex = rw + 2 * M, ey = rh + 2 * M, b = region(cand, w, x0 - M, y0 - M, ex, ey, M), cw = Math.min(rw, Math.round(rh * 2.5)), col = new Float32Array(rw);
    const cost = (sx, sw, dx, dy) => { let s = 0; for (let y = 0; y < rh; y += 2) for (let x = sx; x < sx + sw; x += 3) s += Math.abs(a[y * rw + x] - b[(y + dy) * ex + x + dx]); return s; };
    let rx = M, ry = M, rb = 1e18;
    for (let dy = 0; dy <= 2 * M; dy += 2) for (let dx = 0; dx <= 2 * M; dx += 2) { const s = cost(0, rw, dx, dy); if (s < rb) { rb = s; rx = dx; ry = dy; } }
    const S = Math.max(3, Math.round(GW / 400));
    for (let sx = 0; ; sx = Math.min(sx + Math.ceil(cw / 2), rw - cw)) {
      let best = 1e18, bx = rx, by = ry;
      for (let dy = Math.max(0, ry - S); dy <= Math.min(2 * M, ry + S); dy++) for (let dx = Math.max(0, rx - S); dx <= Math.min(2 * M, rx + S); dx++) { const s = cost(sx, cw, dx, dy); if (s < best) { best = s; bx = dx; by = dy; } }
      for (let x = sx; x < sx + cw; x++) {
        let n = 0;
        for (let y = 0; y < rh; y++) { let d = 9; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const yy = y + by + j, xx = x + bx + i; if (yy >= 0 && yy < ey && xx >= 0 && xx < ex) { const v = Math.abs(a[y * rw + x] - b[yy * ex + xx]); if (v < d) d = v; } } if (d > .9) n++; }
        if (sx === 0 || n < col[x] || x >= sx + cw / 2) col[x] = n;
      }
      if (sx + cw >= rw) break;
    }
    const win = Math.min(rw, Math.max(10, rh)); let sum = 0, top = 0;
    for (let x = 0; x < rw; x++) { sum += col[x]; if (x >= win) sum -= col[x - win]; if (sum > top) top = sum; }
    return top / (win * rh);
  }
  function boxOf(f, H) { const fs = GW * f.size / 100, tw = Math.min(GW * .96, fs * .72 * Math.max(4, f.len) + fs * 2), h = Math.round(fs * 1.7), x = f.align === 'center' ? GW * f.x / 100 - tw / 2 : f.align === 'right' ? GW * f.x / 100 - tw : GW * f.x / 100; return { x: Math.max(0, Math.round(x - fs * .5)), y: Math.max(0, Math.round(H * f.y / 100 - h / 2)), w: Math.round(tw + fs), h }; }
  // Vùng nền cố định của phôi: nền khớp thì ảnh đã căn đúng, nên dòng nào sai là sai thật.
  function framePatches(base, H, fields, q, ko) {
    const pw = Math.round(GW / 7), ph = Math.round(H / 22), off = [...fields.map(f => boxOf(f, H))];
    if (q) { const xs = q.pts.map(p => p.x * ko), ys = q.pts.map(p => p.y * ko), m = (Math.max(...xs) - Math.min(...xs)) * .45; off.push({ x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + 2 * m, h: Math.max(...ys) - Math.min(...ys) + 2 * m }); }
    const hit = (x, y) => off.some(b => x < b.x + b.w && x + pw > b.x && y < b.y + b.h && y + ph > b.y), out = [];
    for (let y = ph; y + ph * 2 < H; y += ph) for (let x = pw; x + pw * 2 < GW; x += pw) { if (hit(x, y)) continue; let e = 0; for (let j = 0; j < ph; j += 2) for (let i = 0; i < pw; i += 2) { const k = (y + j) * GW + x + i; e += Math.abs(base[k] - base[k + 1]) + Math.abs(base[k] - base[k + GW]); } out.push({ x, y, w: pw, h: ph, e }); }
    return [0, 1, 2].flatMap(i => [0, 1].flatMap(k => out.filter(p => Math.floor(p.x * 3 / GW) === i && Math.floor(p.y * 2 / H) === k).sort((a, b) => b.e - a.e).slice(0, 2)));
  }
  const high = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length * .75)] : 1; };
  async function compare(up, o, fields) {
    const q = await fromImage(o, o.width, o.height), dist = p => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), ratio = q && up.pts ? dist(up.pts) / dist(q.pts) : up.W / o.width;
    GW = Math.round(Math.min(2400, Math.max(1000, o.width * ratio)));
    const H = Math.round(GW * o.height / o.width), oc = canvasOf(GW, H, g => g.drawImage(o, 0, 0, GW, H)), base = grayOf(oc), tries = [];
    if (Math.abs(up.W / up.H - o.width / o.height) < .03) tries.push(canvasOf(GW, H, g => g.drawImage(up.src, 0, 0, GW, H)));
    if (q && up.pts) {
      const [p0, p1, p2] = up.pts, [Q0, Q1, Q2] = q.pts, ux = p1.x - p0.x, uy = p1.y - p0.y, vx = p2.x - p0.x, vy = p2.y - p0.y, det = ux * vy - vx * uy;
      if (Math.abs(det) > 1) {
        const Ux = Q1.x - Q0.x, Uy = Q1.y - Q0.y, Vx = Q2.x - Q0.x, Vy = Q2.y - Q0.y, A = (Ux * vy - Vx * uy) / det, C = (Vx * ux - Ux * vx) / det, B = (Uy * vy - Vy * uy) / det, D = (Vy * ux - Uy * vx) / det, k = GW / o.width;
        tries.push(canvasOf(GW, H, g => { g.setTransform(A * k, B * k, C * k, D * k, (Q0.x - (A * p0.x + C * p0.y)) * k, (Q0.y - (B * p0.x + D * p0.y)) * k); g.drawImage(up.src, 0, 0); }));
      }
    }
    const patches = framePatches(base, H, fields, q, GW / o.width);
    let best = null;
    for (const c of tries) {
      await nextTick();
      const g = grayOf(c), rows = fields.map(f => { const R = boxOf(f, H), v = score(base, g, GW, H, R); return { ...f, R, v }; });
      const bad = rows.filter(r => r.v === null || r.v > LIMIT).length, sum = rows.reduce((n, r) => n + (r.v ?? 1), 0), frame = high(patches.map(R => score(base, g, GW, H, R) ?? 1)), aligned = frame <= LIMIT;
      if (!best || (bad === 0 && best.bad > 0) || (best.bad > 0 && ((aligned && !best.aligned) || (aligned === best.aligned && (bad < best.bad || (bad === best.bad && sum < best.sum)))))) best = { rows, bad, sum, c, aligned };
    }
    if (!best) return { verdict: 'unsure', rows: fields.map(f => ({ ...f, v: null })) };
    return { verdict: best.bad === 0 ? 'match' : best.aligned ? 'mismatch' : 'unsure', rows: best.rows, up: best.c, orig: oc };
  }
  const crop = (src, R) => { const c = document.createElement('canvas'); c.width = R.w; c.height = R.h; c.getContext('2d').drawImage(src, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h); return c; };

  // ---------- Ghi nhật ký sai phạm ----------
  const jpeg = t => { const c = slice(t.src, 0, 0, t.W, t.H, Math.min(1600, t.W)); return c.toDataURL('image/jpeg', .82); };
  const report = (t, verdict, extra = {}) => fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict, image: t?.src ? jpeg(t) : '', qr: t?.data || '', ...extra }) }).catch(() => {});
  const logged = '<p class="fine log-note">Trường hợp này đã được ghi lại kèm ảnh để Fly To Sky kiểm tra.</p>';

  const V = {
    match: ['valid', '✓', 'Giấy thật, khớp bản gốc', 'Nội dung giấy tải lên trùng với giấy gốc trên hệ thống.'],
    mismatch: ['invalid', '!', 'Giấy giả hoặc đã bị chỉnh sửa', 'Thông tin in trên giấy không khớp với mã QR. Mã QR có thể bị ghép từ giấy khác, hoặc nội dung đã bị sửa. Dòng đánh dấu ✗ là chỗ sai.'],
    unsure: ['unsigned', '?', 'Chưa xác nhận được giấy này', 'Ảnh bị nghiêng, cắt, mờ hoặc khác mẫu nên chưa so được, vì vậy chưa thể coi là giấy thật. Nếu tờ giấy ghi khác thông tin dưới đây thì đó là giấy giả. Bạn có thể tải lên ảnh rõ, thẳng hơn.'],
    invalid: ['invalid', '!', 'Không xác thực được', 'Mã QR không có trong hệ thống hoặc đã bị thay đổi. Giấy có thể đã bị làm giả.'],
    revoked: ['revoked', '!', 'Giấy chứng nhận đã bị thu hồi', 'Giấy này không còn hiệu lực.'],
    foreign: ['invalid', '!', 'Mã QR không thuộc Fly To Sky', ''],
    no_qr: ['invalid', '?', 'Không đọc được mã QR', 'Vui lòng chụp thẳng, đủ sáng, đủ cả tờ giấy và rõ góc có mã QR, hoặc dùng tệp PDF. Bạn cũng có thể nhập mã giấy ở ô bên trên.'],
  };
  const head = (k, extra = '') => `<div class="ver-top"><div class="ver-ic">${V[k][1]}</div><div><h1>${esc(V[k][2])}</h1><p>${esc(extra || V[k][3])}</p></div></div>`;
  const tick = ok => `<b class="${ok ? 'r-ok' : 'r-bad'}">${ok ? '✓' : '✗'}</b>`;

  // Kết quả kiểm tra chữ ký số PDF (máy chủ kiểm tra) + đối chiếu với tệp gốc đã lưu.
  const vt = v => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
  function pdfPanel(r) {
    if (!r) return '';
    const match = r.match ? `<div class="ver ${r.match.revoked ? 'ver-revoked' : 'ver-valid'}"><div class="ver-top"><div class="ver-ic">${r.match.revoked ? '!' : '✓'}</div><div><h1>${r.match.revoked ? 'Đúng tệp gốc nhưng giấy đã bị thu hồi' : 'Đúng tệp gốc đã lưu trên hệ thống'}</h1><p>${esc(r.match.kind)} cấp cho <b>${esc(r.match.name)}</b>${r.match.project ? ' – ' + esc(r.match.project) : ''}. Mã giấy <code>${esc(r.match.code)}</code>.</p></div></div><p><a class="btn btn-primary btn-sm" href="${esc(r.match.url)}">Xem trang xác thực</a></p></div>` : '';
    if (!r.signatures?.length) return match;
    const li = (b, t, f2) => `<li class="${b ? 'ok' : 'bad'}"><i>${b ? '✓' : '✗'}</i>${esc(b ? t : f2)}</li>`;
    return match + `<div class="sigp ${r.ok && r.signatures.every(s => s.trustedRoot) && r.signerMatch !== false ? 'sig-ok' : 'sig-bad'}"><h3>Chữ ký số trên tệp PDF</h3><p class="sig-sum">${esc(r.summary)}</p>${r.signatures.map(s => s.error ? `<p class="err">${esc(s.error)}</p>` : `<dl class="profile"><div><dt>Người ký</dt><dd>${esc(s.signer.name)}${s.signer.uid ? '<br><span class="muted">' + esc(s.signer.uid) + '</span>' : ''}</dd></div><div><dt>Tổ chức cấp chứng thư</dt><dd>${esc(s.ca)}</dd></div><div><dt>Thời điểm ký</dt><dd>${esc(vt(s.signingTime))}</dd></div><div><dt>Chuỗi chứng thực</dt><dd>${esc((s.chain || []).join(' → '))}</dd></div></dl><ul class="sig-checks">${li(s.integrity, 'Tài liệu nguyên vẹn, không bị sửa sau khi ký', 'Nội dung đã bị thay đổi sau khi ký')}${li(s.signatureValid, 'Chữ ký khớp chứng thư số', 'Chữ ký không khớp chứng thư số')}${li(s.chainOk && s.trustedRoot, 'Chứng thư thuộc chuỗi tin cậy của Root CA quốc gia', 'Chứng thư không thuộc chuỗi tin cậy quốc gia đã biết')}${li(s.certValidAtSigning, 'Chứng thư còn hiệu lực khi ký', 'Chứng thư hết hạn hoặc chưa hiệu lực khi ký')}</ul>`).join('')}${r.signerMatch === false ? '<p class="err">Người ký không phải đơn vị cấp giấy của Hệ thống từ thiện Fly To Sky.</p>' : ''}<p class="fine">Kiểm tra lại tại Trung tâm Chứng thực điện tử quốc gia: mở neac.gov.vn → Dịch vụ trực tuyến → Kiểm tra văn bản ký số, tải tệp này lên.</p><a class="btn btn-ghost btn-sm" href="https://neac.gov.vn/vi" target="_blank" rel="noopener">Kiểm tra tại NEAC ↗</a></div>`;
  }

  async function check(f) {
    out.innerHTML = '<div class="lk-wait"><span class="spin"></span>Đang đọc mã QR và chữ ký số trên giấy…</div>';
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let t = null;
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const pdfReq = isPdf && f.size <= 15e6 ? fetch('/api/verify-pdf', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: f }).then(r => r.json()).catch(() => null) : Promise.resolve(null);
    const addPdf = async () => { const r = await pdfReq; if (r && (r.signatures?.length || r.match)) out.insertAdjacentHTML('afterbegin', pdfPanel(r)); return r; };
    try {
      t = await readFile(f);
      if (!t.data) {
        const r = await pdfReq;
        if (r && (r.signatures?.length || r.match)) { out.innerHTML = pdfPanel(r); return; }
        out.innerHTML = `<div class="ver ver-invalid">${head('no_qr')}</div>`;
        if (t.src) report(t, 'no_qr', { detail: 'Không đọc được mã QR. Tệp: ' + f.name });
        return;
      }
      const j = await (await fetch('/api/verify?qr=' + encodeURIComponent(t.data))).json();
      if (j.error) throw new Error(j.error);
      if (['invalid', 'revoked', 'foreign'].includes(j.state)) {
        out.innerHTML = `<div class="ver ver-${V[j.state][0]}">${head(j.state, j.reason)}${j.code ? `<p>Mã trên QR: <code>${esc(j.code)}</code></p>` : ''}${logged}</div>`;
        report(t, j.state, { code: j.code || '', detail: j.reason || '' });
        await addPdf();
        return;
      }
      if (j.state === 'remote' || j.state === 'remote-valid') {
        const i = j.info || {};
        out.innerHTML = `<div class="ver ver-unsigned"><div class="ver-top"><div class="ver-ic">i</div><div><h1>Giấy của ${esc(j.label)}</h1><p>${j.state === 'remote-valid' ? 'Mã QR hợp lệ. Hãy đối chiếu từng thông tin dưới đây với tờ giấy; khác một chi tiết là giấy giả. Để so ảnh tự động, kiểm tra trên trang của hệ thống cấp giấy.' : 'Chưa kết nối được hệ thống cấp giấy. Mở trang xác thực của hệ thống đó để kiểm tra.'}</p></div></div>${j.state === 'remote-valid' ? `<dl class="profile">${[['Mã giấy', i.code], ['Họ tên', i.name], ['Dự án, chương trình', i.project], ['Ghi nhận', i.amount ? Number(i.amount).toLocaleString('vi-VN') + ' VNĐ' : i.amountText], ['Ngày cấp', dmy(i.date)]].filter(r => r[1]).map(r => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl>` : ''}<p class="mt"><a class="btn btn-primary btn-sm" href="${esc(j.url)}" target="_blank" rel="noopener">Mở trang xác thực của ${esc(j.label)} ↗</a></p></div>`;
        await addPdf();
        return;
      }
      // Giấy của cổng này
      const R = j.render;
      if (!R) {
        out.innerHTML = `<div class="ver ver-unsigned">${head('unsure', 'Giấy này được cấp ở hệ thống cũ hoặc nơi khác nên chưa so ảnh tự động được. Hãy đối chiếu từng thông tin với trang xác thực.')}<p class="mt"><a class="btn btn-primary btn-sm" href="${esc(j.url)}">Mở trang xác thực</a></p></div>`;
        await addPdf();
        return;
      }
      if (!R.image) {
        out.innerHTML = `<div class="ver ver-unsigned">${head('unsure', 'Mã QR hợp lệ nhưng ảnh giấy gốc chưa sẵn sàng để so tự động. Hãy đối chiếu từng thông tin với trang xác thực.')}<p class="mt"><a class="btn btn-primary btn-sm" href="${esc(j.url)}" target="_blank" rel="noopener">Mở trang xác thực</a></p></div>`;
        report(t, 'unsure', { code: j.code, detail: 'Chưa có ảnh giấy gốc để so' });
        await addPdf();
        return;
      }
      out.innerHTML = '<div class="lk-wait"><span class="spin"></span>Đang so từng dòng thông tin với giấy gốc…</div>';
      // Giấy gốc là một ảnh đã ghép sẵn trên hệ thống (nền và chữ không tách rời).
      const oc = await new Promise((ok, no) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); ok(c); }; im.onerror = () => no(new Error('Không tải được ảnh giấy gốc')); im.src = R.image; });
      const res = await compare(t, oc, R.rows);
      const show = res.verdict === 'match' || res.verdict === 'mismatch', none = '<b></b>';
      const rows = res.rows.map((r, i) => {
        const ok = r.v !== null && r.v <= LIMIT, mark = res.verdict === 'match' ? tick(true) : show && !ok ? tick(false) : none;
        return `<div class="ck-row"><div class="ck-l">${mark}<span>${esc(r.label)}</span><strong>${esc(r.text)}</strong></div>${show && !ok && res.up ? `<div class="ck-diff"><figure data-i="${i}" data-s="up"><figcaption>Giấy bạn tải lên</figcaption></figure><figure data-i="${i}" data-s="orig"><figcaption>Giấy gốc</figcaption></figure></div>` : ''}</div>`;
      }).join('');
      out.innerHTML = `<div class="ck-card"><div class="ck-imgs">${res.verdict === 'match' ? '' : '<figure id="ckYours"><figcaption class="fine">Giấy bạn tải lên</figcaption></figure>'}<figure id="ckOrig"><figcaption class="fine">Giấy gốc trên hệ thống</figcaption></figure></div><div class="ver ver-${V[res.verdict][0]}">${head(res.verdict)}<h2 class="ck-h">Mã QR này được cấp cho</h2><div class="ck-rows"><div class="ck-row"><div class="ck-l">${res.verdict === 'match' ? tick(true) : none}<span>Mã QR</span><strong>${esc(j.code)}</strong></div></div>${rows}</div>${res.verdict === 'match' ? `<p class="mt"><a class="btn btn-primary btn-sm" href="${esc(j.url)}">Xem và tải Giấy chứng nhận</a></p>` : logged}</div></div>`;
      $('#ckYours')?.prepend(slice(t.src, 0, 0, t.W, t.H, Math.min(1200, t.W)));
      oc.style.width = '100%'; $('#ckOrig').prepend(oc);
      out.querySelectorAll('.ck-diff figure').forEach(fg => { const r = res.rows[+fg.dataset.i]; fg.prepend(crop(fg.dataset.s === 'up' ? res.up : res.orig, r.R)); });
      await addPdf();
      if (res.verdict !== 'match') {
        const wrong = res.rows.filter(r => r.v === null || r.v > LIMIT).map(r => r.label).join(', ');
        report(t, res.verdict, { code: j.code, detail: (res.verdict === 'mismatch' ? 'Dòng sai: ' : 'Chưa so được: ') + wrong });
      }
    } catch (x) {
      console.error(x);
      // Không dựng được trang PDF (VD: thiếu phông) nhưng vẫn có thể có chữ ký số để kiểm tra.
      const r = await pdfReq;
      if (r && (r.signatures?.length || r.match)) { out.innerHTML = pdfPanel(r); return; }
      out.innerHTML = `<div class="ver ver-invalid">${head('no_qr', 'Không đọc được tệp này. Vui lòng thử ảnh JPG/PNG hoặc tệp PDF khác.')}</div>`;
    }
  }
  for (const id of ['ckFile', 'ckCam']) $('#' + id)?.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) check(f); });
})();
