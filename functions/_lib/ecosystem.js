// Khối "Hệ sinh thái Hệ thống từ thiện Fly To Sky": 8 nút dẫn tới các nền tảng chính thức.
// Tự chứa (HTML + CSS tiền tố eco-), dùng chung giữa các nền tảng; `here` là id của nền tảng hiện tại.
const I = p => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  volunteer: I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
  web: I('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  workspace: I('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
  certificates: I('<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>'),
  benvung360: I('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'),
  tinhnguyen: I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  donate: I('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
  kydientu: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
};
// 4 nền tảng có app icon riêng (bộ icon chính thức 11/2026), ảnh nằm ở /brand/eco/<id>.png của mỗi site.
const APP_ICON = { volunteer: 1, workspace: 1, certificates: 1, kydientu: 1 };
export const ECOSYSTEM = [
  { id: 'volunteer', title: 'Tuyển dụng & phát triển nguồn nhân lực', desc: 'Hệ thống tuyển dụng và phát triển nguồn nhân lực Hệ thống từ thiện Fly To Sky', url: 'https://volunteer.flytoskycharity.vn' },
  { id: 'web', title: 'Trang thông tin chính thức', desc: 'Trang thông tin chính thức của Fly To Sky', url: 'https://flytoskycharity.vn' },
  { id: 'workspace', title: 'FTS Workspace', desc: 'Nền tảng quản lý và vận hành nội bộ Nhóm từ thiện Fly To Sky', url: 'https://workspace.flytoskycharity.vn' },
  { id: 'certificates', title: 'Tra cứu Giấy chứng nhận', desc: 'Cổng tra cứu thông tin Giấy chứng nhận của Hệ thống từ thiện Fly To Sky', url: 'https://certificates.flytoskycharity.vn' },
  { id: 'benvung360', title: 'Bền vững 360°', desc: 'Thông tin chuyên ngành, nghiên cứu, phân tích, giải pháp và dịch vụ về phát triển bền vững tại Việt Nam và quốc tế', url: 'https://benvung360.com.vn' },
  { id: 'tinhnguyen', title: 'Bền vững 360° | Tình nguyện', desc: 'Không gian thông tin và kết nối tri thức về hoạt động tình nguyện, thiện nguyện và phát triển cộng đồng', url: 'https://tinhnguyen.benvung360.com.vn' },
  { id: 'donate', title: 'Ủng hộ & sao kê', desc: 'Quyên góp vào Quỹ chung hoặc dự án đang kêu gọi, xem sao kê công khai', url: 'https://certificates.flytoskycharity.vn/ung-ho', show: 'certificates.flytoskycharity.vn' },
  { id: 'kydientu', title: 'Ký điện tử Fly To Sky', desc: 'Nền tảng ký điện tử của Hệ thống từ thiện Fly To Sky', url: 'https://kydientu.flytoskycharity.vn' },
];
const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ARROW = '<svg class="eco-go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const CSS = `.eco{padding:72px 0;background:#f4f7fd}.eco-in{width:min(1200px,100% - 40px);margin-inline:auto}.eco-head{text-align:center;margin-bottom:36px}.eco-head h2{margin:0 0 8px;font-size:clamp(24px,3vw,34px);color:#0e1b3d}.eco-head p{margin:0;opacity:.7}.eco-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}.eco-card{position:relative;display:flex;gap:16px;padding:22px;background:#fff;border:1px solid #e3e8f3;border-radius:18px;text-decoration:none;color:#0e1b3d;transition:transform .15s,box-shadow .15s,border-color .15s}a.eco-card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(5,34,139,.1);border-color:#c9d5f2}.eco-card.here{background:#eef2fd;border-color:#c9d5f2}.eco-ic{flex:none;display:grid;place-items:center;width:56px;height:56px;border-radius:14px;background:#eef2fd;color:#05228b}.eco-app{flex:none;width:56px;height:56px;border-radius:14px;box-shadow:0 8px 18px -10px rgba(5,34,139,.45)}.eco-card h3{margin:0 22px 6px 0;font-size:1.05em;line-height:1.35;color:#0e1b3d}.eco-card p{margin:0 0 12px;font-size:.92em;line-height:1.5;color:#475569}.eco-url{font-size:.86em;font-weight:700;color:#05228b;word-break:break-all}.eco-card.here .eco-url{color:#15803d}.eco-go{position:absolute;top:20px;right:20px;color:#475569}@media (max-width:1080px){.eco-grid{grid-template-columns:repeat(2,1fr)}}@media (max-width:600px){.eco{padding:52px 0}.eco-grid{grid-template-columns:1fr;gap:14px}}`;

export function ecosystemSection(here = '', items = ECOSYSTEM) {
  const card = it => {
    const isHere = it.id === here;
    const body = `${APP_ICON[it.id] ? `<img class="eco-app" src="/brand/eco/${it.id}.png" alt="" width="56" height="56" loading="lazy">` : `<span class="eco-ic">${ICONS[it.id] || ''}</span>`}<span><h3>${e(it.title)}</h3><p>${e(it.desc)}</p><span class="eco-url">${isHere ? 'Bạn đang ở đây' : e(it.show || it.url.replace(/^https?:\/\//, ''))}</span></span>`;
    return isHere ? `<div class="eco-card here" aria-current="page">${body}</div>` : `<a class="eco-card" href="${e(it.url)}"${/^https?:/.test(it.url) ? ' target="_blank" rel="noopener"' : ''}>${body}${ARROW}</a>`;
  };
  return `<section class="eco" id="he-sinh-thai" aria-labelledby="ecoTitle"><style>${CSS}</style><div class="eco-in"><div class="eco-head"><h2 id="ecoTitle">Hệ sinh thái Hệ thống từ thiện Fly To Sky</h2><p>Các nền tảng chính thức của Fly To Sky – bấm để truy cập.</p></div><div class="eco-grid">${items.map(card).join('')}</div></div></section>`;
}
