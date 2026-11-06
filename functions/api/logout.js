import { clearSession } from '../_lib/auth.js';
import { json } from '../_lib/util.js';

export const onRequestPost = () => json({ ok: true }, 200, { 'Set-Cookie': clearSession() });
