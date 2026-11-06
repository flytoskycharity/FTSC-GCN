# Thiết lập quản trị Google Apps Script

1. Mở dự án Google Apps Script đang triển khai API, thay toàn bộ mã bằng nội dung của `code.gs` trong thư mục này.
2. Trong **Project Settings → Script properties**, thêm:
   - `API_SECRET_KEY`: giữ giá trị API đang dùng.
   - `INITIAL_SUPERADMIN_EMAIL`: email SuperAdmin đầu tiên.
   - `INITIAL_SUPERADMIN_NAME`: họ tên SuperAdmin đầu tiên.
   - `INITIAL_SUPERADMIN_PASSWORD`: mật khẩu tạm tối thiểu 8 ký tự.
3. Trong Apps Script, chọn và chạy hàm `initializeFirstSuperadmin` một lần. Cấp quyền theo yêu cầu. Hàm tự tạo sheet `AdminUsers` đúng 13 cột và xóa `INITIAL_SUPERADMIN_PASSWORD` khỏi Script Properties.
4. Deploy lại Web app thành một **version mới**, dùng cùng URL API hoặc cập nhật `NEXT_PUBLIC_APPS_SCRIPT_URL` trên Vercel nếu URL thay đổi.
5. Đăng nhập tại `/admin`. Lần đầu hệ thống bắt buộc đổi mật khẩu tạm.

Các sheet được tạo khi cần:

- `GCN`: Mã GCN, Họ tên, Chiến dịch, Ngày ủng hộ, Số tiền, Số điện thoại, Link GCN.
- `KEUGOI`: HienThi, TenDuAn, ThoiGianBatDau, ThoiGianKetThuc, CuPhapUngHo, SoTienKeuGoi, SoTienDaNhan, MoTa, GhiChu.
- `AdminUsers`: cấu trúc được yêu cầu cho quản trị viên.

Lưu ý: các thao tác quản trị xác thực bằng token phiên 6 giờ. Chỉ `SuperAdmin` có quyền khóa/mở khóa tài khoản. Admin có thể tạo tài khoản và reset mật khẩu Admin khác, nhưng không được tạo/nâng quyền, chỉnh sửa, khóa hoặc reset mật khẩu tài khoản `SuperAdmin`.
