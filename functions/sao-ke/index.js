import { pageRoute } from '../_lib/pages.js';
import { renderStatement } from '../_lib/render.js';

export const onRequestGet = pageRoute('/sao-ke', ({ x }) => renderStatement(x));
