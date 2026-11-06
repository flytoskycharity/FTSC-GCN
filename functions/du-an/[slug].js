import { pageRoute } from '../_lib/pages.js';
import { renderCampaign, render404 } from '../_lib/render.js';
import { campaignBySlug } from '../_lib/campaigns.js';
import { html } from '../_lib/util.js';

export const onRequestGet = pageRoute(p => '/du-an/' + p.slug, async ({ env, x, params }) => {
  const c = env.DB ? await campaignBySlug(env, params.slug) : null;
  return c ? renderCampaign(x, c) : html(render404(x), 404);
});
