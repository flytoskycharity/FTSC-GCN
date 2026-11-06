import { pageRoute } from '../_lib/pages.js';
import { renderLookup } from '../_lib/render.js';

export const onRequestGet = pageRoute('/tra-cuu', ({ request, x }) => renderLookup(x, (new URL(request.url).searchParams.get('q') || '').slice(0, 80)));
