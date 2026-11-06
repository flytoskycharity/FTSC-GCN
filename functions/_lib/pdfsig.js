// Kiểm tra chữ ký số trong tệp PDF (PAdES / adbe.pkcs7.detached) theo cùng nguyên tắc với công cụ của
// Trung tâm Chứng thực điện tử quốc gia (NEAC): tài liệu không bị sửa sau khi ký, chữ ký khớp chứng thư số,
// chứng thư được cấp bởi tổ chức cung cấp dịch vụ chứng thực trong chuỗi tin cậy.
// Chạy được trên Cloudflare Workers (WebCrypto), không dùng thư viện ngoài.
// Giới hạn: không tra cứu trực tuyến tình trạng thu hồi (OCSP/CRL) của chứng thư.

const OID = {
  '1.2.840.113549.1.7.2': 'signedData',
  '1.2.840.113549.1.9.3': 'contentType', '1.2.840.113549.1.9.4': 'messageDigest', '1.2.840.113549.1.9.5': 'signingTime',
  '1.3.14.3.2.26': 'SHA-1', '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512',
  '1.2.840.113549.1.1.1': 'rsa', '1.2.840.113549.1.1.5': 'rsa-SHA-1', '1.2.840.113549.1.1.11': 'rsa-SHA-256', '1.2.840.113549.1.1.12': 'rsa-SHA-384', '1.2.840.113549.1.1.13': 'rsa-SHA-512',
  '1.2.840.10045.2.1': 'ec', '1.2.840.10045.4.3.2': 'ecdsa-SHA-256', '1.2.840.10045.4.3.3': 'ecdsa-SHA-384', '1.2.840.10045.4.3.4': 'ecdsa-SHA-512',
  '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521',
  '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.12': 'T', '0.9.2342.19200300.100.1.1': 'UID', '1.2.840.113549.1.9.1': 'E',
};

// ---------- Đọc DER (ASN.1) ----------
function node(b, p) {
  const tag = b[p];
  let len = b[p + 1], hdr = 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[p + 2 + i]; hdr = 2 + n; }
  return { tag, start: p, hs: p + hdr, end: p + hdr + len, constructed: !!(tag & 0x20) };
}
function kids(b, n) { const out = []; for (let p = n.hs; p < n.end;) { const c = node(b, p); out.push(c); p = c.end; } return out; }
const raw = (b, n) => b.subarray(n.start, n.end);
const val = (b, n) => b.subarray(n.hs, n.end);
function oid(b, n) {
  const v = val(b, n), out = [Math.floor(v[0] / 40), v[0] % 40];
  let x = 0;
  for (let i = 1; i < v.length; i++) { x = x * 128 + (v[i] & 0x7f); if (!(v[i] & 0x80)) { out.push(x); x = 0; } }
  return out.join('.');
}
// Đọc byte thành chuỗi latin1 (mỗi byte một ký tự), không phụ thuộc TextDecoder.
const latin1 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return s; };
const hex = u => Array.from(u, x => x.toString(16).padStart(2, '0')).join('');
function str(b, n) {
  const v = val(b, n);
  if (n.tag === 0x1e) { let s = ''; for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode(v[i] * 256 + v[i + 1]); return s; }
  if (n.tag === 0x0c) return new TextDecoder().decode(v);
  return String.fromCharCode(...v);
}
function time(b, n) {
  const s = str(b, n);
  const m = n.tag === 0x17 ? s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/) : s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?/);
  if (!m) return null;
  const y = n.tag === 0x17 ? (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]) : Number(m[1]);
  return new Date(Date.UTC(y, m[2] - 1, m[3], m[4], m[5], m[6] || 0)).toISOString();
}
function name(b, n) {
  const o = {};
  for (const rdn of kids(b, n)) for (const atv of kids(b, rdn)) {
    const [t, v] = kids(b, atv), k = OID[oid(b, t)] || oid(b, t);
    o[k] = o[k] ? o[k] + ', ' + str(b, v) : str(b, v);
  }
  return o;
}
const same = (a, c) => a.length === c.length && a.every((x, i) => x === c[i]);

function parseCert(b, n) {
  const [tbs, sigAlg, sig] = kids(b, n);
  let t = kids(b, tbs), i = 0;
  if (t[0].tag === 0xa0) i = 1;
  const serial = val(b, t[i]), issuer = t[i + 2], validity = kids(b, t[i + 3]), subject = t[i + 4], spki = t[i + 5];
  const alg = kids(b, kids(b, spki)[0]);
  return {
    der: raw(b, n), tbs: raw(b, tbs), sigAlg: OID[oid(b, kids(b, sigAlg)[0])] || oid(b, kids(b, sigAlg)[0]), sig: val(b, sig).subarray(1),
    serial: hex(serial), issuerDer: raw(b, issuer), subjectDer: raw(b, subject), issuer: name(b, issuer), subject: name(b, subject),
    notBefore: time(b, validity[0]), notAfter: time(b, validity[1]),
    spki: raw(b, spki), keyType: OID[oid(b, alg[0])], curve: alg[1] && alg[1].tag === 0x06 ? OID[oid(b, alg[1])] : '',
    ski: (() => { // Subject Key Identifier (2.5.29.14) nếu có
      const ext = t.find(x => x.tag === 0xa3); if (!ext) return '';
      for (const e of kids(b, kids(b, ext)[0])) { const c = kids(b, e); if (oid(b, c[0]) === '2.5.29.14') return hex(val(b, node(b, c[c.length - 1].hs))); }
      return '';
    })(),
  };
}

// Chữ ký ECDSA trong DER (SEQUENCE{r,s}) → dạng r||s mà WebCrypto cần.
function ecRaw(der, size) {
  const n = node(der, 0), [r, s] = kids(der, n), out = new Uint8Array(size * 2);
  const put = (v, off) => { v = v.subarray(Math.max(0, v.length - size)); out.set(v, off + size - v.length); };
  put(val(der, r), 0); put(val(der, s), size);
  return out;
}
async function verifyWith(cert, algName, hash, data, sig) {
  if (cert.keyType === 'ec' || /^ecdsa/.test(algName)) {
    const curve = cert.curve || 'P-256', size = { 'P-256': 32, 'P-384': 48, 'P-521': 66 }[curve];
    const key = await crypto.subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve: curve }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash }, key, ecRaw(sig, size), data);
  }
  const key = await crypto.subtle.importKey('spki', cert.spki, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
}
const hashOf = alg => (String(alg).match(/SHA-(1|256|384|512)/) || [])[0] || 'SHA-256';

// Tên chuỗi gốc tin cậy của Việt Nam (Root CA quốc gia do NEAC quản lý) và các nhà cung cấp dịch vụ chứng thực công cộng.
const VN_ROOT = /Vietnam National Root CA|Viet Nam National Root CA|National Root CA.*Viet ?Nam|Root CA.*(Ministry of Information|Bo Thong tin|NEAC)/i;

async function checkOne(bytes, br) {
  const [a, l1, c, l2] = br;
  const out = { byteRange: br, coversWholeFile: c + l2 === bytes.length };
  // Nội dung chữ ký nằm giữa hai đoạn được ký: <hex...>
  const hexStr = latin1(bytes.subarray(a + l1, c)).replace(/[<>\s]/g, '');
  const der = new Uint8Array(hexStr.length / 2 | 0);
  for (let i = 0; i < der.length; i++) der[i] = parseInt(hexStr.substr(i * 2, 2), 16);
  const ci = kids(der, node(der, 0));
  if (OID[oid(der, ci[0])] !== 'signedData') throw new Error('Không phải chữ ký PKCS#7');
  const sd = kids(der, kids(der, ci[1])[0]);
  const certNode = sd.find(x => x.tag === 0xa0);
  const certs = certNode ? kids(der, certNode).filter(x => x.tag === 0x30).map(x => parseCert(der, x)) : [];
  const si = kids(der, sd[sd.length - 1])[0];
  const f = kids(der, si);
  let i = 1;
  const sid = f[i++], digAlg = OID[oid(der, kids(der, f[i++])[0])];
  let attrs = null;
  if (f[i].tag === 0xa0) attrs = f[i++];
  const sigAlg = OID[oid(der, kids(der, f[i++])[0])] || '', sig = val(der, f[i]);
  // Tìm chứng thư của người ký
  let signer;
  if (sid.tag === 0x30) { const [, ser] = kids(der, sid); signer = certs.find(x => x.serial === hex(val(der, ser))); }
  else signer = certs.find(x => x.ski === hex(val(der, sid)));
  if (!signer) throw new Error('Không có chứng thư số của người ký trong tệp');
  const hash = hashOf(digAlg);
  // 1. Toàn vẹn: băm phần tài liệu được ký, so với giá trị trong chữ ký
  const signed = new Uint8Array(l1 + l2); signed.set(bytes.subarray(a, a + l1)); signed.set(bytes.subarray(c, c + l2), l1);
  const digest = new Uint8Array(await crypto.subtle.digest(hash, signed));
  let md = null, signingTime = null;
  if (attrs) for (const at of kids(der, attrs)) {
    const [t, set] = kids(der, at), k = OID[oid(der, t)], v = kids(der, set)[0];
    if (k === 'messageDigest') md = val(der, v);
    if (k === 'signingTime') signingTime = time(der, v);
  }
  out.integrity = !!md && same(Array.from(md), Array.from(digest));
  // 2. Chữ ký khớp chứng thư: ký trên tập thuộc tính (đổi thẻ [0] thành SET)
  let data;
  if (attrs) { data = Uint8Array.from(raw(der, attrs)); data[0] = 0x31; } else { data = signed; out.integrity = true; }
  out.signatureValid = await verifyWith(signer, sigAlg, hash, data, sig).catch(() => false);
  // 3. Chuỗi chứng thư: người ký → nhà cung cấp (CA) → gốc
  const chain = [signer];
  let cur = signer, chainOk = true;
  for (let k = 0; k < 6; k++) {
    if (same(Array.from(cur.issuerDer), Array.from(cur.subjectDer))) break; // tự ký = gốc
    const up = certs.find(x => same(Array.from(x.subjectDer), Array.from(cur.issuerDer)));
    if (!up) break;
    const okUp = await verifyWith(up, cur.sigAlg, hashOf(cur.sigAlg), cur.tbs, cur.sigAlg.startsWith('ecdsa') ? cur.sig : cur.sig).catch(() => false);
    if (!okUp) { chainOk = false; break; }
    chain.push(up); cur = up;
  }
  const top = chain[chain.length - 1];
  out.chain = chain.map(x => x.subject.CN || x.subject.O || '');
  out.chainOk = chainOk;
  out.rootName = top.issuer.CN || top.issuer.O || '';
  out.trustedRoot = chainOk && VN_ROOT.test(out.rootName + ' ' + (top.subject.CN || ''));
  out.signer = { name: signer.subject.CN || '', org: signer.subject.O || '', unit: signer.subject.OU || '', uid: signer.subject.UID || '', title: signer.subject.T || '', place: [signer.subject.L, signer.subject.ST].filter(Boolean).join(', ') };
  out.ca = signer.issuer.CN || signer.issuer.O || '';
  out.notBefore = signer.notBefore; out.notAfter = signer.notAfter; out.signingTime = signingTime; out.algorithm = hash;
  out.certValidAtSigning = !signingTime || (signingTime >= signer.notBefore && signingTime <= signer.notAfter);
  out.ok = out.integrity && out.signatureValid && chainOk && out.certValidAtSigning;
  return out;
}

// Trả về danh sách chữ ký trong tệp và kết luận chung.
export async function verifyPdf(input, expectSigner = '') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const text = latin1(bytes);
  if (!text.startsWith('%PDF')) return { isPdf: false, signatures: [], ok: false, summary: 'Tệp không phải PDF.' };
  const sigs = [];
  for (const m of text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)) {
    const br = m.slice(1, 5).map(Number);
    if (br[2] + br[3] > bytes.length || br[0] + br[1] > br[2]) { sigs.push({ ok: false, error: 'Vùng ký không hợp lệ' }); continue; }
    try { sigs.push(await checkOne(bytes, br)); } catch (e) { sigs.push({ ok: false, error: e.message }); }
  }
  if (!sigs.length) return { isPdf: true, signatures: [], ok: false, summary: 'Tệp PDF không có chữ ký số.' };
  // Tài liệu bị sửa sau chữ ký cuối cùng nếu chữ ký cuối không phủ hết tệp.
  const last = sigs.reduce((x, y) => ((y.byteRange?.[2] || 0) > (x.byteRange?.[2] || 0) ? y : x));
  const modifiedAfter = !last.coversWholeFile;
  const ok = sigs.every(s => s.ok) && !modifiedAfter;
  const summary = ok
    ? (sigs.every(s => s.trustedRoot) ? 'Chữ ký số hợp lệ, tài liệu nguyên vẹn từ khi ký, chứng thư thuộc chuỗi tin cậy quốc gia.' : 'Chữ ký số hợp lệ, tài liệu nguyên vẹn từ khi ký. Chứng thư không thuộc chuỗi gốc quốc gia đã biết – cần kiểm tra lại tại NEAC.')
    : modifiedAfter && sigs.every(s => s.ok) ? 'Tài liệu đã bị thêm hoặc sửa nội dung sau khi ký.' : 'Chữ ký số không hợp lệ hoặc tài liệu đã bị sửa sau khi ký.';
  // Người ký có đúng đơn vị cấp giấy (VD: Fly To Sky, MST 5901213612)?
  let signerMatch = null;
  if (expectSigner) {
    const re = new RegExp(String(expectSigner).split('|').map(x => x.trim()).filter(Boolean).map(x => x.replace(/[.*+?^${}()[\]\\]/g, '\\$&')).join('|') || '$^', 'i');
    signerMatch = sigs.some(s => s.ok && re.test(JSON.stringify(s.signer || {})));
  }
  return { isPdf: true, signatures: sigs.map(s => { const { byteRange, ...rest } = s; return rest; }), modifiedAfter, ok, signerMatch, summary };
}

export async function sha256Hex(bytes) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); }
