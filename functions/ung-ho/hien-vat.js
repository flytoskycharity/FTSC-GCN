import { pageRoute } from '../_lib/pages.js';
import { renderItemsDonate } from '../_lib/render.js';
import { itemTargets } from '../_lib/campaigns.js';

// Quyên góp hiện vật. /ung-ho/hien-vat?du-an=<slug> chọn sẵn dự án; ?gui=<mã bí mật> bổ sung thông tin bưu gửi.
export const onRequestGet = pageRoute('/ung-ho/hien-vat', async ({ env, x, request }) => {
  const q = new URL(request.url).searchParams, slug = q.get('du-an') || '';
  let targets = env.DB ? await itemTargets(env) : [];
  // Bổ sung bưu gửi vẫn mở được dù dự án đã đóng nhận hiện vật.
  if (q.has('gui') && !targets.length && env.DB) targets = (await env.DB.prepare('SELECT * FROM campaigns WHERE items_accept=1 LIMIT 1').all()).results || [];
  return renderItemsDonate(x, targets, (targets.find(t => t.slug === slug) || targets[0])?.id, q.has('gui'));
});
