import { pageRoute } from '../_lib/pages.js';
import { renderLookup } from '../_lib/render.js';

export const onRequestGet = pageRoute('/tra-cuu', ({ request, x }) => {
  const u = new URL(request.url);
  return renderLookup(x, (u.searchParams.get('q') || '').slice(0, 80), u.searchParams.get('tab') || '');
});
