import {loadSettings} from './db.js';

export async function canonical(env, token) {
  const settings = await loadSettings(env);
  const source = settings.sources?.workspace;
  if (!source?.url || source.enabled === false) throw Error('Workspace chưa bật liên thông.');
  const origin = new URL(source.url);
  if (origin.protocol !== 'https:') throw Error('Địa chỉ Workspace không hợp lệ.');
  const res = await fetch(new URL('/api/public/certificate?token='+token,origin), {redirect:'error',signal:AbortSignal.timeout(7000)});
  if (!res.ok) throw Error('Workspace chưa xác nhận giấy.');
  const c = await res.json();
  if (!['issued','revoked'].includes(c.status) || !c.number || !c.name) throw Error('Hồ sơ không hợp lệ.');
  return {source:'workspace',sourceLabel:'FTS Workspace',type:c.kind,code:c.number,name:c.name,project:c.title,
    date:c.date,amountText:c.reason,status:c.status==='issued'?'valid':'revoked',url:new URL('/xac-minh/'+token,origin).href,documents:[]};
}
