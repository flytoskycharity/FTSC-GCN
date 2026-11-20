// Quyên góp hiện vật: danh mục hiện vật của dự án, chuẩn hóa danh sách người gửi khai, tổng hiện vật đã nhận.
import { clip } from './util.js';

const int = v => Math.max(0, Math.min(1e7, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0)));

// Danh mục trong admin, mỗi dòng: "Tên hiện vật | đơn vị | mục tiêu (không bắt buộc)". VD: "Sách thiếu nhi | cuốn | 5000".
export function parseItemTypes(text) {
  return String(text || '').split(/\r?\n/).map(l => l.split('|').map(x => x.trim())).filter(p => p[0])
    .slice(0, 30).map(([name, unit = '', goal = '']) => ({ name: clip(name, 80), unit: clip(unit, 20) || 'cái', goal: int(goal) }));
}

// Danh sách hiện vật: [{name, unit, qty, note}] – bỏ dòng trống, tối đa 20 dòng.
export function cleanItems(list) {
  return (Array.isArray(list) ? list : []).map(i => ({
    name: clip(String(i?.name ?? '').replace(/[<>]/g, ''), 80).trim(), unit: clip(String(i?.unit ?? '').replace(/[<>]/g, ''), 20).trim() || 'cái',
    qty: int(i?.qty), note: clip(String(i?.note ?? '').replace(/[<>]/g, ''), 200).trim(),
  })).filter(i => i.name && i.qty > 0).slice(0, 20);
}
export const parseItems = s => { try { return cleanItems(JSON.parse(s || '[]')); } catch { return []; } };

// "50 cuốn Sách thiếu nhi, 2 bộ Máy tính để bàn" – ghi trên Giấy xác nhận.
export const itemsText = list => list.map(i => `${i.qty.toLocaleString('vi-VN')} ${i.unit} ${i.name}`).join(', ');

// Tổng hiện vật đã nhận (theo kiểm đếm thực tế) của một dự án, gộp theo tên + đơn vị.
export async function receivedTotals(env, campaignId) {
  const { results } = await env.DB.prepare("SELECT received_items FROM donations WHERE campaign_id=? AND kind='items' AND status='paid'").bind(campaignId).all();
  const m = new Map();
  for (const r of results || []) for (const i of parseItems(r.received_items)) {
    const k = (i.name + '|' + i.unit).toLowerCase(), cur = m.get(k);
    if (cur) cur.qty += i.qty; else m.set(k, { ...i, note: '' });
  }
  return [...m.values()];
}

// Mã quyên góp hiện vật ghi ngoài kiện hàng: HV + số thứ tự.
export const itemCode = id => 'HV' + String(id).padStart(5, '0');
