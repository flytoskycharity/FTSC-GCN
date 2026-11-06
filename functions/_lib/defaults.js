// Nội dung gốc của cổng. Mọi mục ở đây đều sửa được trong trang quản trị (Cài đặt).
export default {
  site: {
    title: 'Cổng tra cứu thông tin Giấy chứng nhận của Hệ thống từ thiện Fly To Sky',
    shortTitle: 'Tra cứu Giấy chứng nhận',
    kicker: 'Hệ thống từ thiện Fly To Sky',
    operator: 'Phòng Tổ chức - Hành chính Công ty & Ban Tổ chức - Hành chính Nhóm từ thiện Fly To Sky',
    owner: 'Hệ thống từ thiện Fly To Sky',
    intro: 'Tra cứu Giấy chứng nhận ủng hộ, Giấy xác nhận tài trợ và Giấy chứng nhận tình nguyện viên do Hệ thống từ thiện Fly To Sky cấp. Nhập số điện thoại, họ tên hoặc mã giấy.',
    support: 'Cần hỗ trợ, vui lòng liên hệ Zalo 0375.136.800.',
    url: 'https://certificates.flytoskycharity.vn',
    aboutUrl: 'https://info.flytoskycharity.vn/',
  },
  // Bản tin hiện ở trang chủ, đọc từ RSS của Bền vững 360°.
  news: {
    enabled: true,
    title: 'Bản tin Bền vững 360°',
    lead: 'Nghiên cứu, phân tích và giải pháp phát triển bền vững từ FTS Center for Sustainability Research & Advisory (FTS CSRA).',
    rss: 'https://benvung360.com.vn/rss.xml',
    site: 'https://benvung360.com.vn',
    count: 6,
  },
  theme: {
    primary: '#05228b', primaryDark: '#031552', accent: '#1565d8',
    paper: '#f4f7fd', tint: '#e7edfb', ink: '#0e1b3d',
    fontHeading: 'Source Serif 4', fontBody: 'Manrope',
  },
  contact: {
    phones: ['0375 136 800', '0935 939 446'],
    emails: ['lienhe@flytoskycharity.vn', 'donghanh@flytoskycharity.vn'],
    website: 'https://flytoskycharity.vn',
    links: [
      { label: 'Website Fly To Sky', href: 'https://flytoskycharity.vn' },
      { label: 'Về Fly To Sky', href: 'https://info.flytoskycharity.vn/' },
      { label: 'Bền vững 360°', href: 'https://benvung360.com.vn' },
      { label: 'Zalo Official Account', href: 'https://zalo.me/flytoskycharity' },
      { label: 'Fanpage Facebook', href: 'https://www.facebook.com/flytoskycharity' },
      { label: 'Cộng đồng Fly To Sky', href: 'https://www.facebook.com/groups/392919558235980' },
      { label: 'Tủ sách Bồ Câu Trắng', href: 'https://khuyendoc.flytoskycharity.vn' },
    ],
    offices: [
      { label: 'Văn phòng Tổng', value: '145/14/4 Thống Nhất, tổ 4, phường Diên Hồng, tỉnh Gia Lai, Việt Nam' },
      { label: 'Văn phòng đại diện tại Hà Nội', value: 'Tầng 5, số 124 ngõ 34 Hoàng Cầu, phường Ô Chợ Dừa, TP. Hà Nội, Việt Nam' },
      { label: 'Văn phòng tại TP.HCM', value: 'Số 129 Điện Biên Phủ, phường Gia Định, TP. Hồ Chí Minh, Việt Nam' },
    ],
    legalName: 'Công ty TNHH Doanh nghiệp xã hội từ thiện và hỗ trợ phát triển cộng đồng Fly To Sky',
    taxNote: 'Mã số doanh nghiệp 5901213612 do Sở Kế hoạch và Đầu tư tỉnh Gia Lai cấp',
    about: 'Hệ thống từ thiện Fly To Sky gồm Công ty TNHH Doanh nghiệp xã hội từ thiện và hỗ trợ phát triển cộng đồng Fly To Sky và Nhóm từ thiện Fly To Sky.',
    motto: 'Lan tỏa yêu thương và kết nối tới cộng đồng.',
  },
  bank: {
    name: 'Ngân hàng TMCP Quân đội - MBBank',
    bin: '970422',
    account: '9446',
    holder: 'Công ty TNHH Doanh nghiệp xã hội từ thiện và hỗ trợ phát triển cộng đồng Fly To Sky',
  },
  statement: {
    title: 'Sao kê tài khoản minh bạch',
    lead: 'Theo dõi sao kê tài khoản nhận ủng hộ, cập nhật trực tiếp từ nền tảng Thiện Nguyện.',
    embed: 'https://thiennguyen.app/doi-tac/minh-bach-tai-khoan/9446',
  },
  // Đọc sao kê tự động để cấp GCN. Dùng cùng địa chỉ dữ liệu sao kê với Khuyendoc.
  sync: { enabled: false, url: '', lookbackDays: 14, startDate: '' },
  donate: {
    amounts: [50000, 100000, 200000, 500000, 1000000, 2000000],
    minAmount: 10000,
    anonymousName: 'Nhà hảo tâm',
    title: 'Quyên góp cùng Fly To Sky',
    lead: 'Chọn Quỹ chung các dự án hoặc một dự án đang kêu gọi, nhập thông tin và quét mã QR để chuyển khoản. Ban Tổ chức xác nhận và cấp Giấy chứng nhận trong vòng 24 giờ.',
    note: 'Vui lòng giữ nguyên nội dung chuyển khoản. Chuyển xong, bạn bấm nút “Tôi đã chuyển tiền” bên dưới.',
    paidNote: 'Cảm ơn bạn đã quyên góp! Trong vòng 24 giờ, bạn vào Tra cứu, tìm theo số điện thoại hoặc họ tên để xem Giấy chứng nhận.',
    donorTypes: [
      { id: 'ca-nhan', label: 'Cá nhân' }, { id: 'to-chuc', label: 'Tổ chức' }, { id: 'doanh-nghiep', label: 'Doanh nghiệp' },
      { id: 'nhom', label: 'Nhóm cá nhân' }, { id: 'fandom', label: 'Fandom / Cộng đồng người hâm mộ' },
    ],
    benefits: [
      '0 | Giấy chứng nhận ủng hộ điện tử, có mã QR xác thực, tra cứu được ngay trên cổng',
      '0 | Theo dõi khoản ủng hộ trên sao kê công khai',
      '500000 | Có quyền yêu cầu Giấy xác nhận tài trợ theo quy định Bộ Tài chính (cấp sau 7–10 ngày)',
    ],
    confirmMin: 500000,
    confirmLabel: 'Tôi yêu cầu Giấy xác nhận tài trợ theo quy định Bộ Tài chính',
    businessNote: 'Doanh nghiệp, tổ chức cần chuyển khoản từ tài khoản của đơn vị sang tài khoản của Công ty để được cấp Giấy xác nhận tài trợ.',
    thanks: 'Cảm ơn bạn đã đồng hành cùng Fly To Sky!',
  },
  cert: {
    prefix: 'FTS',
    maskPhone: true,
    signerName: 'Lê Văn Phúc',
    signerTitle: 'Giám đốc Công ty TNHH Doanh nghiệp xã hội từ thiện và hỗ trợ phát triển cộng đồng Fly To Sky',
    signature: '',
    stamp: '',
    programText: 'Đã tham gia chương trình',
    // Người ký hợp lệ trên PDF ký số (tách bằng |): tên đơn vị hoặc mã số thuế trong chứng thư số.
    signerMatch: 'FLY TO SKY|5901213612',
  },
  // Các hệ thống khác cùng cấp giấy, tra cứu chung một lần.
  sources: {
    khuyendoc: { enabled: true, label: 'Tủ sách Bồ Câu Trắng', url: 'https://khuyendoc.flytoskycharity.vn' },
    workspace: { enabled: true, label: 'FTS Workspace', url: 'https://workspace.flytoskycharity.vn' },
  },
};
