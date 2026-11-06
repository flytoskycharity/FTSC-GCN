import { pageRoute } from '../_lib/pages.js';
import { renderCampaignList } from '../_lib/render.js';
import { publicCampaigns } from '../_lib/campaigns.js';

export const onRequestGet = pageRoute('/du-an', async ({ env, x }) => renderCampaignList(x, env.DB ? await publicCampaigns(env) : []));
