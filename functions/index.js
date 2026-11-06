import { pageRoute } from './_lib/pages.js';
import { renderHome } from './_lib/render.js';
import { publicCampaigns } from './_lib/campaigns.js';
import { raisedOf, FUND_SLUG } from './_lib/db.js';
import { getNews } from './_lib/news.js';
import { syncKhuyendoc } from './_lib/external.js';

export const onRequestGet = pageRoute('/', async ({ env, x, settings, waitUntil }) => {
  if (!env.DB) return renderHome(x, [], null, []);
  // Cập nhật tiến độ dự án Tủ sách Bồ Câu Trắng tối đa mỗi 30 phút, chạy nền.
  const sync = syncKhuyendoc(env, settings).catch(() => {});
  if (waitUntil) waitUntil(sync);
  const fundRow = await env.DB.prepare("SELECT * FROM campaigns WHERE slug=? AND status='open'").bind(FUND_SLUG).first();
  const [campaigns, news] = await Promise.all([publicCampaigns(env), getNews(env, settings, waitUntil)]);
  const fund = fundRow ? { ...fundRow, raised: await raisedOf(env, fundRow) } : null;
  return renderHome(x, campaigns, fund, news);
});
