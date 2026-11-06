import { pageRoute } from '../_lib/pages.js';
import { renderDonate } from '../_lib/render.js';
import { donationTargets, benefitsOf } from '../_lib/campaigns.js';

// Quyên góp: Quỹ chung các dự án hoặc một dự án đang mở. /ung-ho?du-an=<slug> chọn sẵn dự án.
export const onRequestGet = pageRoute('/ung-ho', async ({ env, x, request, settings }) => {
  const targets = env.DB ? await donationTargets(env) : [];
  const slug = new URL(request.url).searchParams.get('du-an') || '';
  const sel = targets.find(t => t.slug === slug) || targets[0];
  const benefits = Object.fromEntries(targets.map(t => [t.id, benefitsOf(settings, t)]));
  return renderDonate(x, targets, sel?.id, benefits);
});
