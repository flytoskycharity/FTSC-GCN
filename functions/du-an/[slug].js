import { pageRoute } from '../_lib/pages.js';
import { renderCampaign, render404 } from '../_lib/render.js';
import { campaignBySlug, benefitsOf, isFund } from '../_lib/campaigns.js';
import { html } from '../_lib/util.js';

export const onRequestGet = pageRoute(p => '/du-an/' + p.slug, async ({ env, x, params, request, settings }) => {
  const c = env.DB ? await campaignBySlug(env, params.slug) : null;
  if (c && isFund(c)) return Response.redirect(new URL('/ung-ho', request.url).href, 302);
  return c ? renderCampaign(x, c, benefitsOf(settings, c)) : html(render404(x), 404);
});
