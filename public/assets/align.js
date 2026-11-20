// So ảnh chụp lại một tờ giấy KHÔNG có mã QR với bản gốc đã lưu (giấy khen, giấy ký tay cũ).
// 1) Tìm điểm đặc trưng ở cả hai ảnh, ghép cặp, ước lượng phép chiếu (homography) bằng RANSAC để "trải phẳng" ảnh chụp lên bản gốc.
// 2) Chuẩn hóa độ sáng cục bộ (bỏ ảnh hưởng bóng, lóa nhẹ) rồi so từng ô; ô khác rõ được tô đỏ.
// Chạy hoàn toàn trong trình duyệt, không gửi ảnh đi đâu. Kết quả: match | mismatch | unsure.
(() => {
  const AW = 900;            // độ rộng làm việc khi tìm điểm đặc trưng (theo bản gốc)
  const GW = 1200;           // độ rộng khi so từng ô
  const nextTick = () => new Promise(r => setTimeout(r));

  function grayOf(src, sw, sh, w) {
    const h = Math.round(w * sh / sw), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, o = new Float32Array(w * h);
    for (let i = 0; i < o.length; i++) o[i] = .3 * d[i * 4] + .59 * d[i * 4 + 1] + .11 * d[i * 4 + 2];
    return { g: o, w, h };
  }
  // Làm mờ hộp (tách hàng/cột) – dùng cho chuẩn hóa độ sáng và khử nhiễu.
  function boxBlur(a, w, h, r) {
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { let s = 0, n = 0; const row = y * w;
      for (let x = -r; x < w; x++) { if (x + r < w) { s += a[row + x + r]; n++; } if (x - r - 1 >= 0) { s -= a[row + x - r - 1]; n--; } if (x >= 0) t[row + x] = s / n; } }
    for (let x = 0; x < w; x++) { let s = 0, n = 0;
      for (let y = -r; y < h; y++) { if (y + r < h) { s += t[(y + r) * w + x]; n++; } if (y - r - 1 >= 0) { s -= t[(y - r - 1) * w + x]; n--; } if (y >= 0) o[y * w + x] = s / n; } }
    return o;
  }

  // ---------- Điểm đặc trưng (Shi–Tomasi) + mô tả bằng mảng điểm ảnh chuẩn hóa ----------
  const PR = 14, PS = 11; // bán kính vùng mô tả, số mẫu mỗi chiều
  function features(I, max = 700) {
    const { g, w, h } = I, s = boxBlur(g, w, h, 1), gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = s[i + 1] - s[i - 1]; gy[i] = s[i + w] - s[i - w]; }
    const xx = new Float32Array(w * h), yy = new Float32Array(w * h), xy = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { xx[i] = gx[i] * gx[i]; yy[i] = gy[i] * gy[i]; xy[i] = gx[i] * gy[i]; }
    const A = boxBlur(xx, w, h, 2), B = boxBlur(yy, w, h, 2), C = boxBlur(xy, w, h, 2);
    // Chia lưới để điểm rải đều khắp tờ giấy, mỗi ô lấy vài điểm mạnh nhất.
    const cw = Math.ceil(w / 16), ch = Math.ceil(h / 12), per = Math.ceil(max / 192), cells = new Map(), m = PR + 2;
    for (let y = m; y < h - m; y += 2) for (let x = m; x < w - m; x += 2) {
      const i = y * w + x, a = A[i], b = B[i], c = C[i], e = (a + b) / 2 - Math.sqrt(((a - b) / 2) ** 2 + c * c);
      if (e < 40) continue;
      const k = Math.floor(y / ch) * 99 + Math.floor(x / cw), l = cells.get(k) || []; l.push({ x, y, e }); cells.set(k, l);
    }
    const pts = [];
    for (const l of cells.values()) {
      l.sort((p, q) => q.e - p.e);
      const keep = [];
      for (const p of l) { if (keep.length >= per) break; if (keep.every(q => Math.abs(q.x - p.x) > 6 || Math.abs(q.y - p.y) > 6)) keep.push(p); }
      pts.push(...keep);
    }
    const st = (2 * PR) / (PS - 1);
    for (const p of pts) {
      const d = new Float32Array(PS * PS); let mean = 0;
      for (let j = 0; j < PS; j++) for (let i = 0; i < PS; i++) { const v = s[Math.round(p.y - PR + j * st) * w + Math.round(p.x - PR + i * st)]; d[j * PS + i] = v; mean += v; }
      mean /= d.length; let n = 0; for (let i = 0; i < d.length; i++) { d[i] -= mean; n += d[i] * d[i]; }
      n = Math.sqrt(n) || 1; for (let i = 0; i < d.length; i++) d[i] /= n; p.d = d;
    }
    return pts;
  }
  function match(P, Q) {
    const best = (p, L) => { let b = -2, s = -2, k = -1; for (let j = 0; j < L.length; j++) { const d = L[j].d; let v = 0; for (let i = 0; i < d.length; i++) v += p.d[i] * d[i]; if (v > b) { s = b; b = v; k = j; } else if (v > s) s = v; } return { k, b, s }; };
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const r = best(P[i], Q); if (r.k < 0 || r.b < .7 || (1 - r.b) > .8 * (1 - r.s)) continue;
      if (best(Q[r.k], P).k !== i) continue;
      out.push([P[i], Q[r.k]]);
    }
    return out;
  }

  // ---------- Phép chiếu 3x3 ----------
  function solve(M, b) { // khử Gauss có chọn trụ
    const n = b.length, a = M.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      if (Math.abs(a[p][c]) < 1e-12) return null; [a[c], a[p]] = [a[p], a[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
    }
    return a.map((r, i) => r[n] / r[i]);
  }
  function homography(pairs) {
    // Chuẩn hóa tọa độ để hệ phương trình ổn định.
    const norm = pts => { let mx = 0, my = 0; pts.forEach(p => { mx += p.x; my += p.y; }); mx /= pts.length; my /= pts.length; let d = 0; pts.forEach(p => d += Math.hypot(p.x - mx, p.y - my)); const s = Math.SQRT2 / ((d / pts.length) || 1); return { mx, my, s }; };
    const n1 = norm(pairs.map(p => p[0])), n2 = norm(pairs.map(p => p[1]));
    const N = Array.from({ length: 8 }, () => new Array(8).fill(0)), v = new Array(8).fill(0);
    for (const [a, b] of pairs) {
      const x = (a.x - n1.mx) * n1.s, y = (a.y - n1.my) * n1.s, u = (b.x - n2.mx) * n2.s, w = (b.y - n2.my) * n2.s;
      for (const [r, t] of [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -w * x, -w * y], w]])
        for (let i = 0; i < 8; i++) { v[i] += r[i] * t; for (let j = 0; j < 8; j++) N[i][j] += r[i] * r[j]; }
    }
    const h = solve(N, v); if (!h) return null;
    const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    // H = T2^-1 · Hn · T1
    const T1 = [n1.s, 0, -n1.s * n1.mx, 0, n1.s, -n1.s * n1.my, 0, 0, 1], T2i = [1 / n2.s, 0, n2.mx, 0, 1 / n2.s, n2.my, 0, 0, 1];
    const mul = (A, B) => { const o = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return o; };
    const H = mul(T2i, mul(Hn, T1)); return H.map(x => x / H[8]);
  }
  const apply = (H, x, y) => { const z = H[6] * x + H[7] * y + H[8]; return { x: (H[0] * x + H[1] * y + H[2]) / z, y: (H[3] * x + H[4] * y + H[5]) / z }; };
  function ransac(pairs, tol) {
    if (pairs.length < 8) return null;
    let best = null, bestN = 0;
    for (let it = 0; it < 1500; it++) {
      const s = new Set(); while (s.size < 4) s.add(Math.floor(Math.random() * pairs.length));
      const H = homography([...s].map(i => pairs[i])); if (!H) continue;
      let n = 0; for (const [a, b] of pairs) { const q = apply(H, a.x, a.y); if (Math.hypot(q.x - b.x, q.y - b.y) < tol) n++; }
      if (n > bestN) { bestN = n; best = H; }
    }
    if (!best) return null;
    let inl = pairs.filter(([a, b]) => { const q = apply(best, a.x, a.y); return Math.hypot(q.x - b.x, q.y - b.y) < tol; });
    for (let k = 0; k < 2; k++) { const H = homography(inl); if (!H) break; best = H; inl = pairs.filter(([a, b]) => { const q = apply(best, a.x, a.y); return Math.hypot(q.x - b.x, q.y - b.y) < tol; }); }
    return { H: best, inliers: inl.length, total: pairs.length };
  }

  // Ảnh chụp có thể chứa thêm mặt bàn, tờ giấy chiếm một phần: thử nhiều tỉ lệ, giữ phép chiếu có nhiều cặp khớp nhất.
  async function align(orig, ow, oh, photo, pw, ph) {
    const O = grayOf(orig, ow, oh, AW), FO = features(O);
    let best = null;
    for (const k of [1, 1.25, .85, 1.55, 1.9, .7]) {
      await nextTick();
      const w = Math.round(Math.min(AW * k, pw * 1.2)); if (w < 300) continue;
      const P = grayOf(photo, pw, ph, w), FP = features(P), r = ransac(match(FO, FP), 3.5);
      if (r && (!best || r.inliers > best.inliers)) best = { ...r, sx: pw / w };
      if (best && best.inliers > 120 && best.inliers > best.total * .5) break;
    }
    if (!best || best.inliers < 25) return null;
    // Chuyển về: tọa độ bản gốc (độ rộng AW) → điểm ảnh gốc của ảnh chụp.
    const H = best.H.slice(); for (let i = 0; i < 6; i++) H[i] *= best.sx;
    return { H, inliers: best.inliers, total: best.total };
  }

  // ---------- Trải phẳng ảnh chụp lên khung bản gốc ----------
  function warp(photo, pw, ph, H, W, Hh) {
    const sw = Math.min(pw, 2400), sh = Math.round(sw * ph / pw), k = sw / pw, sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
    const sg = sc.getContext('2d', { willReadFrequently: true }); sg.drawImage(photo, 0, 0, sw, sh);
    const sd = sg.getImageData(0, 0, sw, sh).data, out = document.createElement('canvas'); out.width = W; out.height = Hh;
    const og = out.getContext('2d'), od = og.createImageData(W, Hh), mask = new Uint8Array(W * Hh), f = AW / W;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const q = apply(H, x * f, y * f), u = q.x * k, v = q.y * k, o = (y * W + x) * 4;
      if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) { od.data[o] = od.data[o + 1] = od.data[o + 2] = 255; od.data[o + 3] = 255; continue; }
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i0 = (y0 * sw + x0) * 4, i1 = i0 + 4, i2 = i0 + sw * 4, i3 = i2 + 4;
      for (let c = 0; c < 3; c++) od.data[o + c] = (sd[i0 + c] * (1 - fx) + sd[i1 + c] * fx) * (1 - fy) + (sd[i2 + c] * (1 - fx) + sd[i3 + c] * fx) * fy;
      od.data[o + 3] = 255; mask[y * W + x] = 1;
    }
    og.putImageData(od, 0, 0);
    return { canvas: out, mask };
  }

  // Chuẩn hóa độ sáng cục bộ: (giá trị – trung bình vùng) / (độ lệch vùng + hằng số) để bóng đổ, ánh đèn không thành "khác biệt".
  function localNorm(a, w, h) {
    const r = Math.round(w / 45), m = boxBlur(a, w, h, r), sq = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) sq[i] = (a[i] - m[i]) ** 2;
    const sd = boxBlur(sq, w, h, r), o = new Float32Array(a.length), s = boxBlur(a, w, h, 1);
    for (let i = 0; i < a.length; i++) o[i] = (s[i] - m[i]) / (Math.sqrt(sd[i]) + 18);
    return o;
  }

  const LIMIT = .02;   // tỉ lệ điểm ảnh khác rõ trong một ô con để coi là ô sai
  // Bản gốc có thể bị xoay (VD: PDF khổ dọc chứa giấy khen nằm ngang): không căn được thì thử xoay 90°, 270°, 180°.
  function rotated(src, w, h, deg) {
    const c = document.createElement('canvas'), q = deg % 180 !== 0; c.width = q ? h : w; c.height = q ? w : h;
    const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(src, -w / 2, -h / 2, w, h); return c;
  }
  async function compareScan(photo, pw, ph, orig0, ow0, oh0) {
    let orig = orig0, ow = ow0, oh = oh0, al = await align(orig, ow, oh, photo, pw, ph);
    for (const deg of [90, 270, 180]) {
      if (al) break;
      const r = rotated(orig0, ow0, oh0, deg), a = await align(r, r.width, r.height, photo, pw, ph);
      if (a) { al = a; orig = r; ow = r.width; oh = r.height; }
    }
    if (!al) return { verdict: 'unsure', reason: 'Không căn được ảnh chụp với bản gốc (ảnh quá mờ, quá nghiêng, thiếu nhiều phần, hoặc không phải cùng một tờ giấy).' };
    await nextTick();
    const W = GW, Hh = Math.round(GW * oh / ow), wp = warp(photo, pw, ph, al.H, W, Hh);
    const O = grayOf(orig, ow, oh, W), U = grayOf(wp.canvas, W, Hh, W), a = localNorm(O.g, W, Hh), b = localNorm(U.g, W, Hh);
    await nextTick();
    const B = Math.round(W / 32), S = 4, cov = wp.mask.reduce((n, v) => n + v, 0) / wp.mask.length, blocks = [];
    for (let by = 0; by + B <= Hh; by += B) for (let bx = 0; bx + B <= W; bx += B) {
      let inside = 0; for (let y = by; y < by + B; y += 4) for (let x = bx; x < bx + B; x += 4) inside += wp.mask[y * W + x]; if (inside < (B / 4) ** 2 * .98) continue;
      // Độ lệch còn lại do giấy cong: mỗi ô tự dò vài điểm ảnh.
      let dx = 0, dy = 0, bc = 1e18;
      for (let sy = -S; sy <= S; sy++) for (let sx = -S; sx <= S; sx++) {
        if (by + sy < 0 || bx + sx < 0 || by + B + sy > Hh || bx + B + sx > W) continue;
        let c = 0; for (let y = by; y < by + B; y += 2) for (let x = bx; x < bx + B; x += 2) c += Math.abs(a[y * W + x] - b[(y + sy) * W + x + sx]);
        if (c < bc) { bc = c; dx = sx; dy = sy; }
      }
      // Đếm theo 4 ô con: sửa một chữ số nhỏ cũng đủ đậm trong ô con chứa nó.
      let ink = 0; const h2 = B >> 1, q = [0, 0, 0, 0];
      for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
        const v = a[y * W + x]; let d = 9, near = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const yy = y + dy + j, xx = x + dx + i; if (yy < 0 || xx < 0 || yy >= Hh || xx >= W) continue; const u = b[yy * W + xx], e = Math.abs(v - u); if (e < d) { d = e; near = u; } }
        if (Math.abs(v) > .9 || Math.abs(near) > .9) ink++;
        if (d > 1.1) q[(y - by >= h2 ? 2 : 0) + (x - bx >= h2 ? 1 : 0)]++;
      }
      const e = bx < B || by < B || bx + 2 * B > W || by + 2 * B > Hh; // ô sát mép: bóng, mép giấy hay gây sai lệch giả
      blocks.push({ x: bx, y: by, w: B, h: B, v: Math.max(...q) / (h2 * h2), ink: ink / (B * B), edge: e });
    }
    if (!blocks.length) return { verdict: 'unsure', reason: 'Ảnh chụp không phủ đủ tờ giấy để so.' };
    // Chất lượng căn: các ô có chữ/hoa văn mà vẫn lệch nhiều nghĩa là ảnh chưa căn được.
    const tex = blocks.filter(k => k.ink > .05 && !k.edge).map(k => k.v).sort((p, q) => p - q), med = tex.length ? tex[Math.floor(tex.length / 2)] : 0;
    const flagged = blocks.filter(k => k.v > (k.edge ? LIMIT * 4 : LIMIT));
    // Gộp các ô sai liền nhau thành vùng; bỏ ô lẻ ở sát mép ảnh chụp (thường do bóng, mép giấy).
    const regions = [];
    for (const k of flagged) {
      const r = regions.find(g => k.x <= g.x + g.w + B && k.x + k.w >= g.x - B && k.y <= g.y + g.h + B && k.y + k.h >= g.y - B);
      if (r) { const x2 = Math.max(r.x + r.w, k.x + k.w), y2 = Math.max(r.y + r.h, k.y + k.h); r.x = Math.min(r.x, k.x); r.y = Math.min(r.y, k.y); r.w = x2 - r.x; r.h = y2 - r.y; r.n++; r.peak = Math.max(r.peak, k.v); }
      else regions.push({ x: k.x, y: k.y, w: k.w, h: k.h, n: 1, peak: k.v });
    }
    const edge = r => r.x < B || r.y < B || r.x + r.w > W - B || r.y + r.h > Hh - B;
    const real = regions.filter(r => r.n >= 2 || (r.peak > LIMIT * 1.6 && !edge(r)) || r.peak > LIMIT * 6);
    const aligned = med < LIMIT * .45 && al.inliers >= 30;
    const verdict = !aligned ? 'unsure' : real.length ? 'mismatch' : cov < .85 ? 'unsure' : 'match';
    return {
      verdict, regions: real, blocks, coverage: cov, origCanvas: orig, ow, oh, quality: med, inliers: al.inliers, W, H: Hh, warped: wp.canvas, orig: O,
      reason: !aligned ? 'Ảnh bị mờ, lóa hoặc nhăn nên chưa so được chắc chắn.' : verdict === 'unsure' ? 'Ảnh chụp thiếu một phần tờ giấy.' : '',
    };
  }
  // Vẽ khung đỏ lên ảnh (đã trải phẳng hoặc bản gốc) theo các vùng khác.
  function marked(src, W, H, regions) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(src, 0, 0, W, H);
    g.lineWidth = Math.max(3, W / 300);
    for (const r of regions) { const p = W / 120; g.fillStyle = 'rgba(220,30,30,.18)'; g.fillRect(r.x - p, r.y - p, r.w + 2 * p, r.h + 2 * p); g.strokeStyle = '#d61f1f'; g.strokeRect(r.x - p, r.y - p, r.w + 2 * p, r.h + 2 * p); }
    return c;
  }
  window.FTSAlign = { compareScan, marked };
})();
