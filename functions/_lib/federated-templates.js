// Các phiên bản phôi đã cấp giữ nguyên ảnh, chữ ký và con dấu kể cả khi nguồn đổi mẫu.
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), b => b.toString(16).padStart(2, '0')).join('');
}

export async function syncTemplates(env, base, source) {
  if (!Array.isArray(source.templates)) return; // tương thích với đầu nguồn phiên bản cũ
  const images = new Map();
  async function copy(path) {
    if (!path) return '';
    if (images.has(path)) return images.get(path);
    if (!/^\/(media\/uploads|brand|images)\/[\w/.-]+$/.test(path) || path.includes('..')) throw new Error('Đường dẫn ảnh phôi Tủ sách không hợp lệ.');
    const r = await fetch(base + path, {redirect: 'error', headers: path.startsWith('/media/') ? {'x-fts-federation-key': env.FEDERATION_KEY} : {}});
    if (!r.ok) throw new Error('Không tải được ảnh phôi Tủ sách (' + r.status + ').');
    const bytes = await r.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 12e6) throw new Error('Kích thước ảnh phôi không hợp lệ.');
    const key = 'templates/tusach/' + await digest(bytes);
    if (!await env.MEDIA.head(key)) await env.MEDIA.put(key, bytes, {httpMetadata: {contentType: r.headers.get('content-type') || 'application/octet-stream'}});
    images.set(path, '/media/' + key);
    return images.get(path);
  }
  const statements = [env.DB.prepare('UPDATE templates SET enabled=0 WHERE campaign_id=-1 AND enabled=1')];
  for (const t of source.templates) {
    const gift = t.gift_kind === 'items' ? 'items' : 'money';
    const fields = t.fields.map(f => ({...f, key: f.key === 'position' ? 'org' : f.key, sourceAnchor: true}));
    const values = [t.name, await copy(t.background), t.width, t.height, JSON.stringify(fields), gift, await copy(source.signature), await copy(source.stamp)];
    const revision = await digest(new TextEncoder().encode(JSON.stringify([t.id,...values])));
    statements.push(env.DB.prepare(`INSERT INTO templates(campaign_id,name,background,width,height,fields,gift_kind,signature,stamp,sync_revision)
      VALUES(-1,?,?,?,?,?,?,?,?,?) ON CONFLICT(sync_revision) DO UPDATE SET enabled=1`).bind(...values,revision));
  }
  await env.DB.batch(statements);
}
