import {initializeDatabase} from '../../_lib/db.js';
import {json} from '../../_lib/util.js';
import {canonical} from '../../_lib/workspace-registry.js';

export async function onRequestPost({env,request}) {
  if (!env.FEDERATION_KEY || request.headers.get('x-fts-federation-key') !== env.FEDERATION_KEY) return json({error:'Unauthorized'},401);
  const {token} = await request.json().catch(()=>({}));
  if (!/^[a-f0-9]{32}$/.test(token||'')) return json({error:'Mã xác minh không hợp lệ.'},422);
  try {
    await initializeDatabase(env);
    const row = await canonical(env,token);
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS workspace_registry(token TEXT PRIMARY KEY,code TEXT NOT NULL COLLATE NOCASE,confirmed_at TEXT NOT NULL)').run();
    await env.DB.prepare('INSERT INTO workspace_registry(token,code,confirmed_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(token) DO UPDATE SET code=excluded.code,confirmed_at=excluded.confirmed_at').bind(token,row.code).run();
    return json({ok:true,status:row.status});
  } catch {return json({error:'Chưa đồng bộ được với Workspace.'},503);}
}
