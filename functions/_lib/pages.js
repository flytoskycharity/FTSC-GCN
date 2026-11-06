import { loadSettings, initializeDatabase } from './db.js';
import { pageCtx, render404 } from './render.js';
import { html } from './util.js';

// Bọc trang công khai: nạp cài đặt, dựng ngữ cảnh, báo lỗi thân thiện.
export const pageRoute = (path, fn) => async ({ request, env, params }) => {
  const settings = await loadSettings(env);
  const x = pageCtx(settings, request, typeof path === 'function' ? path(params) : path);
  try {
    if (env.DB) await initializeDatabase(env);
    const out = await fn({ request, env, params, x, settings });
    return out instanceof Response ? out : html(out, 200, { 'Cache-Control': 'public, max-age=0, must-revalidate' });
  } catch (e) {
    console.error(e);
    return html(render404(x), 500);
  }
};
