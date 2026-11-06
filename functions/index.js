import { pageRoute } from './_lib/pages.js';
import { renderHome } from './_lib/render.js';
import { publicCampaigns } from './_lib/campaigns.js';

export const onRequestGet = pageRoute('/', async ({ env, x }) => renderHome(x, env.DB ? await publicCampaigns(env) : []));
