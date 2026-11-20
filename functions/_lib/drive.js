// Giấy nhập từ hệ thống cũ chỉ có link Google Drive ("Bản gốc"). Trình duyệt không tải thẳng được tệp Drive để so ảnh,
// nên máy chủ tải về một lần (tệp phải chia sẻ "Bất kỳ ai có đường liên kết"), lưu bản sao riêng tư vào R2 rồi phục vụ lại.
const LIMIT = 20e6;
export function driveId(url) {
  const m = String(url || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{20,})/) || String(url || '').match(/docs\.google\.com\/[^?]*\/d\/([\w-]{20,})/);
  return m ? m[1] : '';
}
const sniff = b => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 ? 'application/pdf'
  : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png'
  : b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 ? 'image/webp' : '';

// Trả về { body, mime } hoặc null nếu tệp không công khai / không phải PDF hay ảnh.
export async function driveFile(env, id) {
  const key = 'private/drive/' + id;
  const hit = await env.MEDIA.get(key);
  if (hit) return { body: hit.body, mime: hit.httpMetadata?.contentType || 'application/octet-stream' };
  let r;
  try { r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, { redirect: 'follow' }); } catch { return null; }
  if (!r.ok || Number(r.headers.get('content-length')) > LIMIT) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  const mime = bytes.length && bytes.length <= LIMIT ? sniff(bytes) : '';
  if (!mime) return null;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
  return { body: bytes, mime };
}
