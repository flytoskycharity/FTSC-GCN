// Khối "Hệ sinh thái Hệ thống từ thiện Fly To Sky" – 12 nền tảng chính thức.
// Tệp dùng chung, giống hệt nhau ở mọi website của Fly To Sky (Workspace, Tra cứu GCN, Tuyển dụng,
// Ký điện tử, Megastory, Tủ sách Bồ Câu Trắng, Chạm Cộng đồng). Sửa danh sách ở một nơi rồi chép sang các repo.
// Tự chứa: HTML + CSS (tiền tố fe-), không phụ thuộc thư viện. Ảnh favicon nằm ở <base>/<id>.png (128×128).

export const ECOSYSTEM = [
  { id: 'volunteer', title: 'Tuyển dụng & phát triển nguồn nhân lực', desc: 'Hệ thống tuyển dụng và phát triển nguồn nhân lực Hệ thống từ thiện Fly To Sky', url: 'https://volunteer.flytoskycharity.vn' },
  { id: 'web', title: 'Trang thông tin chính thức', desc: 'Trang thông tin chính thức của Fly To Sky', url: 'https://flytoskycharity.vn' },
  { id: 'workspace', title: 'FTS Workspace', desc: 'Nền tảng quản lý và vận hành nội bộ Nhóm từ thiện Fly To Sky', url: 'https://workspace.flytoskycharity.vn' },
  { id: 'certificates', title: 'Tra cứu Giấy chứng nhận', desc: 'Cổng tra cứu thông tin Giấy chứng nhận của Hệ thống từ thiện Fly To Sky & thông tin quyên góp, sao kê công khai', url: 'https://certificates.flytoskycharity.vn' },
  { id: 'benvung360', title: 'Bền vững 360°', desc: 'Thông tin chuyên ngành, nghiên cứu, phân tích, giải pháp và dịch vụ về phát triển bền vững tại Việt Nam và quốc tế', url: 'https://benvung360.com.vn' },
  { id: 'tinhnguyen', title: 'Bền vững 360° | Tình nguyện', desc: 'Không gian thông tin và kết nối tri thức về hoạt động tình nguyện, thiện nguyện và phát triển cộng đồng', url: 'https://tinhnguyen.benvung360.com.vn' },
  { id: 'impactlab', title: 'FTS Impact Lab', desc: 'Định hướng · Thiết kế · Đo lường tác động', url: 'https://impact.flytoskycharity.vn' },
  { id: 'kydientu', title: 'Ký điện tử Fly To Sky', desc: 'Nền tảng ký điện tử của Hệ thống từ thiện Fly To Sky', url: 'https://kydientu.flytoskycharity.vn' },
  { id: 'megastory', title: 'Fly To Sky | Impact Megastory', desc: 'Hồ sơ giới thiệu năng lực Hệ thống từ thiện Fly To Sky', url: 'https://info.flytoskycharity.vn' },
  { id: 'chamcongdong', title: 'Chạm Cộng đồng', desc: 'Dự án thiện nguyện đưa tình nguyện viên đến gần hơn với đời sống địa phương thông qua trải nghiệm', url: 'https://chamcongdong.flytoskycharity.vn' },
  { id: 'khuyendoc', title: 'Tủ sách Bồ Câu Trắng', desc: 'Dự án khuyến đọc của Fly To Sky', url: 'https://khuyendoc.flytoskycharity.vn' },
  { id: 'smileclass', title: 'Smile Class', desc: 'Hệ thống Quản lý vận hành Dự án Lớp học miễn phí vì cộng đồng Smile Class', url: 'https://quanlysmileclass.flytoskycharity.vn' },
];

// Giữ liền cụm từ khi xuống dòng ("Tủ sách / Bồ Câu Trắng", không tách "Bồ Câu / Trắng").
const KEEP = ['Hệ thống từ thiện Fly To Sky', 'Fly To Sky', 'Bồ Câu Trắng', 'Giấy chứng nhận', 'nguồn nhân lực', 'Ký điện tử', 'Bền vững 360°', 'Cộng đồng', 'Smile Class', 'Impact Megastory', 'Impact Lab', 'FTS Workspace', 'Tình nguyện', 'sao kê', 'Tủ sách', 'Tra cứu', 'Đo lường tác động', 'Thiết kế', 'Định hướng', 'tình nguyện viên', 'phát triển', 'quyên góp', 'sao kê công khai', 'ký điện tử', 'Lớp học'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kw = s => { let out = esc(s); for (const k of KEEP) out = out.split(esc(k)).join('\u0000' + esc(k) + '\u0001'); return out.replace(/\u0000/g, '<span class="fe-nw">').replace(/\u0001/g, '</span>'); };
const host = it => it.show || it.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const ARROW = '<svg class="fe-go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

export const ECOSYSTEM_CSS = `.fe{padding:64px 0;background:#f4f7fd;color:#0e1b3d;font-family:inherit}
.fe *{box-sizing:border-box}
.fe-in{width:min(1200px,100% - 40px);margin-inline:auto}
.fe-head{text-align:center;margin:0 auto 30px;max-width:760px}
.fe-head h2{margin:0 0 8px;font-size:clamp(22px,2.8vw,32px);line-height:1.25;color:#0e1b3d;text-wrap:balance}
.fe-head p{margin:0;color:#5a6788;font-size:.98em}
.fe-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}
.fe-card{position:relative;display:flex;gap:12px;align-items:flex-start;height:100%;padding:14px 12px 13px 14px;background:#fff;border:1px solid #e3e8f3;border-radius:16px;text-decoration:none;color:inherit;transition:transform .15s,box-shadow .15s,border-color .15s}
a.fe-card:hover{transform:translateY(-2px);box-shadow:0 12px 26px -14px rgba(5,34,139,.35);border-color:#c9d5f2}
a.fe-card:focus-visible{outline:3px solid #1565d8;outline-offset:2px}
.fe-card.fe-here{background:#eef3fe;border-color:#bccdf3}
.fe-ic{flex:none;width:46px;height:46px;border-radius:12px;display:block;box-shadow:0 6px 14px -8px rgba(8,31,102,.45);background:#fff}
.fe-tx{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
.fe-tx b{font-size:.96em;line-height:1.3;font-weight:800;color:#0e1b3d;text-wrap:pretty}
.fe-tx small{font-size:.84em;line-height:1.45;color:#5a6788;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fe-url{margin-top:auto;padding-top:2px;font-size:.74em;letter-spacing:-.01em;font-weight:700;color:#05228b;overflow-wrap:normal;word-break:normal}
.fe-here .fe-url{color:#15803d}
.fe-go{display:none}
a.fe-card:hover b{color:#05228b}
.fe-nw{white-space:nowrap}
@media (max-width:1100px){.fe-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:820px){.fe-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.fe{padding:44px 0}.fe-in{width:calc(100% - 24px)}.fe-head{margin-bottom:20px}.fe-grid{gap:10px}
.fe-card{flex-direction:column;align-items:center;text-align:center;gap:8px;padding:14px 8px 12px;border-radius:14px}
.fe-ic{width:48px;height:48px;border-radius:12px}.fe-tx{padding:0;align-items:center;gap:2px}.fe-tx b{font-size:.86em;padding-right:0}
.fe-tx small{display:none}.fe-url{font-size:.7em;max-width:100%}.fe-go{display:none}}
@media (max-width:340px){.fe-url{display:none}}`;

// here: id nền tảng hiện tại (đánh dấu "Bạn đang ở đây"); base: thư mục ảnh favicon; withStyle: kèm <style>.
export function ecosystemSection(here = '', { base = '/brand/eco/', withStyle = true, title = 'Hệ sinh thái Hệ thống từ thiện Fly To Sky', lead = 'Các nền tảng chính thức của Fly To Sky – bấm để truy cập.' } = {}) {
  const card = it => {
    const isHere = it.id === here;
    const body = `<img class="fe-ic" src="${esc(base + it.id + '.png')}" alt="" width="52" height="52" loading="lazy" decoding="async"><span class="fe-tx"><b>${kw(it.title)}</b><small>${kw(it.desc)}</small><span class="fe-url">${isHere ? 'Bạn đang ở đây' : esc(host(it)).replace(/^([^.]+)\.(?=[^.]+\.[^.]+)/, '$1.<wbr>')}</span></span>`;
    return `<li>${isHere ? `<div class="fe-card fe-here" aria-current="page" title="${esc(it.desc)}">${body}</div>` : `<a class="fe-card" href="${esc(it.url)}" target="_blank" rel="noopener" title="${esc(it.desc)}">${body}${ARROW}</a>`}</li>`;
  };
  return `<section class="fe" id="he-sinh-thai" aria-labelledby="feTitle">${withStyle ? `<style>${ECOSYSTEM_CSS}</style>` : ''}<div class="fe-in"><div class="fe-head"><h2 id="feTitle">${kw(title)}</h2><p>${esc(lead)}</p></div><ul class="fe-grid">${ECOSYSTEM.map(card).join('')}</ul></div></section>`;
}
