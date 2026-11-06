# Cổng tra cứu thông tin Giấy chứng nhận – Hệ thống từ thiện Fly To Sky

Website: https://certificates.flytoskycharity.vn · Trang quản trị: `/admin/`

- **Đơn vị vận hành:** Phòng Tổ chức - Hành chính Công ty & Ban Tổ chức - Hành chính Nhóm từ thiện Fly To Sky
- **Đơn vị chủ quản:** Hệ thống từ thiện Fly To Sky

Chạy trên **Cloudflare Pages** (cùng kiến trúc với Tủ sách Bồ Câu Trắng – Khuyendoc): thư mục xuất bản `public`, không cần lệnh build, API trong `functions/`, dữ liệu ở **D1**, ảnh ở **R2**. Bản cũ (Next.js trên Vercel + Google Apps Script) được lưu tham khảo trong `legacy/`.

## Tính năng
- **Tra cứu liên thông**: một ô tìm kiếm (SĐT viết kiểu nào cũng được, họ tên không dấu, mã giấy) trả về cùng lúc:
  - Giấy chứng nhận của cổng này (dữ liệu cũ từ Google Sheets + giấy cấp mới),
  - GCN ủng hộ và Giấy xác nhận tài trợ ở **Khuyendoc** (Tủ sách Bồ Câu Trắng),
  - GCN tình nguyện viên ở **FTS Workspace**.
- **Chống làm giả**: mỗi giấy có mã ngẫu nhiên và mã xác thực HMAC (`CERT_SECRET`). QR trên giấy dẫn tới `/xac-thuc/<mã>?s=<mã xác thực>`; trang xác thực lấy dữ liệu gốc từ D1, dựng lại giấy và cho tải PDF/ảnh. Giấy bị thu hồi hiển thị rõ lý do. Sửa thông tin giữ nguyên mã và lưu lịch sử.
- **Dự án kêu gọi**: trang `/du-an/<slug>` có tiến độ, đếm ngược, thông tin chuyển khoản, form ủng hộ tạo VietQR với cú pháp riêng `CÚPHÁP SĐT`.
- **Duyệt ủng hộ thủ công**: người ủng hộ tạo mã QR, chuyển khoản, bấm “Tôi đã chuyển tiền”; admin xem app ngân hàng rồi bấm **Duyệt** (Admin → Duyệt ủng hộ) để cấp GCN. Đọc sao kê tự động chỉ là tùy chọn (mặc định tắt).
- **Nhiều mẫu cho một dự án**: mẫu có “mức tiền tối thiểu”; hệ thống chọn mẫu cao nhất mà số tiền đạt tới, nhiều mẫu cùng mức thì chọn ngẫu nhiên. Trình sửa mẫu kéo thả ngay trong admin.
- **Chống làm giả bằng ảnh liền khối**: trang công khai chỉ hiện ảnh giấy đã ghép sẵn (nền + chữ + chữ ký + QR + hình chìm mã giấy thành một ảnh JPEG), cần đúng mã xác thực mới xem được. Phôi trống, chữ ký, con dấu chỉ quản trị viên xem được. Việc ghép chạy ngầm ở trình duyệt quản trị khi có giấy mới hoặc giấy vừa sửa (góc trái dưới admin báo "Đang tạo ảnh giấy: còn N").
- **Đề xuất điều chỉnh**: người nhận gửi từ trang xác thực (cần 4 số cuối điện thoại); admin duyệt ở mục Đề xuất điều chỉnh, giấy cập nhật và trang tra cứu ghi rõ thông tin cũ → mới.
- **Admin riêng** (không phải sửa mã): dự án, mẫu, giấy (cấp lẻ, cấp hàng loạt, sửa, thu hồi), duyệt ủng hộ, nhập dữ liệu cũ từ Google Sheets, cài đặt nội dung, tài khoản & nhật ký.

## Tệp giấy cấp ở nơi khác & chữ ký số
Admin → Giấy chứng nhận → Sửa → **Tệp giấy đã cấp**: chọn loại (Giấy khen / Giấy chứng nhận / Khác) và hình thức. Chỉ nhận 2 hình thức:
- **Bản scan có chữ ký tay** (ảnh JPG/PNG/WEBP hoặc PDF).
- **PDF có chữ ký số**: hệ thống kiểm tra ngay khi tải (tài liệu nguyên vẹn, chữ ký khớp chứng thư, chuỗi chứng thư lên Root CA quốc gia, chứng thư còn hiệu lực khi ký). Không hợp lệ thì từ chối.

Khi tra cứu, trang xác thực hiện tệp gốc và kết quả chữ ký số. Ở thẻ Kiểm tra giấy, người dùng tải PDF lên: hệ thống kiểm tra chữ ký số và đối chiếu với tệp gốc đã lưu (trùng khớp từng byte). PDF ký sai hoặc người ký không phải Fly To Sky được ghi vào Nhật ký xác thực.
NEAC (neac.gov.vn) không có giao diện kết nối công khai, nên hệ thống tự kiểm tra theo cùng nguyên tắc và kèm nút mở trang kiểm tra của NEAC để đối chiếu thủ công. Tình trạng thu hồi chứng thư (OCSP/CRL) chưa kiểm tra trực tuyến.

## Triển khai lần đầu trên Cloudflare
1. **Workers & Pages → Create → Pages → Connect to Git** → chọn `flytoskycharity/FTSC-GCN`.
   - Production branch: `main` · Framework preset: *None* · Build command: *(để trống)* · Build output directory: `public`.
   - Trong thời gian chuyển đổi, bản Cloudflare nằm ở nhánh `cloudflare` (nhánh `main` vẫn là bản Vercel đang chạy). Chọn Production branch `cloudflare`; sau khi tên miền đã chuyển xong và gỡ Vercel thì gộp nhánh vào `main` và đổi Production branch về `main`.
2. **Storage & Databases → D1 → Create**: tên `fts-certificates`. Bảng tự tạo ở lần chạy đầu.
3. **R2 → Create bucket**: tên `fts-certificates-media`.
4. Vào project Pages → **Settings → Bindings**:
   - D1 database: biến `DB` → `fts-certificates`
   - R2 bucket: biến `MEDIA` → `fts-certificates-media`
5. **Settings → Variables and Secrets** (Production), chọn kiểu *Secret*:
   | Biến | Bắt buộc | Ghi chú |
   |---|---|---|
   | `ADMIN_PASSWORD` | ✔ | Đăng nhập lần đầu bằng tài khoản `admin` + mật khẩu này; luôn dùng được để khôi phục. |
   | `ADMIN_SESSION_SECRET` | ✔ | Chuỗi ngẫu nhiên ≥ 32 ký tự. |
   | `CERT_SECRET` | ✔ | Chuỗi ngẫu nhiên ≥ 32 ký tự. **Đặt một lần, không đổi** (đổi sẽ làm mọi QR đã in không còn khớp). |
   | `FEDERATION_KEY` | nên có | Khóa tra cứu liên thông; đặt **cùng giá trị** ở Khuyendoc và FTS Workspace. |
   | `SYNC_KEY` | tùy chọn | Cho dịch vụ hẹn giờ gọi `/api/bank-sync?key=...`. |
6. **Deployments → Retry deployment** để nhận binding và biến mới. Mở `https://<project>.pages.dev/admin/` để kiểm tra.

## Chuyển tên miền certificates.flytoskycharity.vn sang Cloudflare
1. Trong project Pages → **Custom domains → Set up a custom domain** → nhập `certificates.flytoskycharity.vn`. Cloudflare hiển thị giá trị CNAME, dạng `<project>.pages.dev`.
2. Vào quản lý DNS tên miền tại **HostVN**, sửa bản ghi `certificates` (đang trỏ về Vercel, thường là `cname.vercel-dns.com`):
   - Loại: `CNAME` · Tên: `certificates` · Giá trị: `<project>.pages.dev` · TTL: mặc định.
   - Chỉ sửa đúng bản ghi `certificates`; **không đụng** bản ghi `@`, `www`, `MX`, `TXT` của website chính và hộp thư.
3. Chờ Cloudflare báo *Active* (vài phút đến vài giờ). Mở lại https://certificates.flytoskycharity.vn để kiểm tra.
4. Sau khi chạy ổn: gỡ tên miền khỏi project Vercel cũ và tắt Web App của Google Apps Script (khóa API cũ đã nằm công khai trong mã nguồn bản cũ).

Đường dẫn cũ `/tracuu` và `/saoke` tự chuyển sang `/tra-cuu`, `/sao-ke`.

## Chuyển dữ liệu cũ
Admin → **Nhập dữ liệu cũ**: chia sẻ Google Sheets ở chế độ “Bất kỳ ai có đường liên kết – Người xem”, nhập bảng **KEUGOI** (dự án) rồi bảng **GCN**. Mã cũ (`FT26…`, `GCN_1`…) giữ nguyên, có thêm mã xác thực; link Google Drive cũ hiện thành nút “Bản gốc”. Nhập lại nhiều lần vẫn an toàn (mã trùng tự bỏ qua).

## Liên thông (định dạng chung)
Mỗi hệ thống trả `GET <đường dẫn>?q=...` với header `x-fts-federation-key: <FEDERATION_KEY>`:
- Khuyendoc: `/api/federation/lookup`
- FTS Workspace: `/api/public/federation-certificates`
- Cổng này (cho hệ thống khác dùng): `/api/federation/lookup`

```json
{ "results": [ { "type": "Giấy chứng nhận ủng hộ", "code": "BCT-2026-1234567", "name": "…", "org": "…",
  "phone": "093****446", "project": "…", "amount": 500000, "amountText": "", "date": "2026-11-06",
  "status": "valid", "url": "https://…/xac-thuc/…", "documents": [ { "label": "Giấy xác nhận tài trợ", "url": "https://…" } ] } ] }
```

## Cấu trúc
- `functions/_lib/`: `db.js` (bảng D1, cài đặt), `auth.js` (đăng nhập, quyền), `certs.js` (mã, chữ ký, chọn mẫu, cấp giấy), `bank.js` (sao kê, nhận diện cú pháp), `federation.js` (tra cứu liên thông), `render.js` (HTML các trang), `qr.js` (QR, VietQR).
- `functions/api/admin/*`: API quản trị. `public/admin/`: giao diện quản trị.
- `public/assets/`: CSS, JS trang công khai; `cert.js` dựng giấy trên canvas và xuất PDF.

## Thử trên máy
```sh
node --no-warnings tests/dev-server.mjs   # http://localhost:8788 , admin / test-pass
node tests/smoke.mjs                      # kiểm tra nhanh các trang và API
node tests/pdfsig.mjs                     # kiểm tra bộ đọc chữ ký số PDF
```
