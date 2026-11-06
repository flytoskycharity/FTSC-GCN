/**
 * GOOGLE APPS SCRIPT BACKEND - FLY TO SKY
 * Hỗ trợ phân loại Hiện kim (Số tiền) và Chương trình (Văn bản)
 */

function doGet(e) {
  return ContentService.createTextOutput("API Fly To Sky is running...")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    // 1. Parse JSON từ body (Dùng text/plain để tránh lỗi CORS OPTIONS)
    const body = JSON.parse(e.postData.contents);
    const { query, auth, action } = body;

    // 2. Xác thực Secret Key từ Script Properties
    const secretKey = PropertiesService.getScriptProperties().getProperty('API_SECRET_KEY');
    if (auth !== secretKey) {
      return createResponse({ success: false, message: "Unauthorized: Mã xác thực không chính xác" });
    }

    if ((action || "").indexOf("admin") === 0) {
      return createResponse(handleAdminRequest(body));
    }

    // 3. Điều hướng API
    // action = "getCampaigns": lấy danh sách dự án đang kêu gọi từ sheet KEUGOI
    // mặc định hoặc action = "search": tra cứu GCN như hiện tại
    if (action === "getCampaigns") {
      return createResponse({
        success: true,
        data: getKeuGoiCampaigns()
      });
    }

    // 4. Kiểm tra độ dài từ khóa
    if (!query || query.trim().length < 2) {
      return createResponse({ success: false, message: "Vui lòng nhập từ khóa dài hơn" });
    }

    const searchTerm = query.trim();
    const normalizedSearch = removeVietnameseTones(searchTerm);
    const phoneSearch = normalizePhone(searchTerm);

    // 5. Kết nối Database (Google Sheets)
    // Nên đổi "DATA" thành tên sheet chứa dữ liệu GCN của bạn nếu không dùng sheet đang mở.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data.shift(); // Loại bỏ hàng tiêu đề

    // 6. Logic tìm kiếm trên 3 cột: Mã GCN (0), Họ tên (1), SĐT (5)
    const results = data.reverse().filter(row => {
      const maGCN = row[0] ? row[0].toString().toLowerCase() : "";
      const hoTen = row[1] ? row[1].toString() : "";
      const sdt = row[5] ? row[5].toString() : "";

      const matchMa = maGCN === searchTerm.toLowerCase();
      const matchSdt = phoneSearch !== "" && normalizePhone(sdt) === phoneSearch;
      const matchTen = removeVietnameseTones(hoTen).includes(normalizedSearch);

      return matchMa || matchSdt || matchTen;
    }).map(row => ({
      maGCN: row[0] || "—",
      hoTen: row[1] || "N/A",
      chienDich: row[2] || "N/A",
      ngayUngHo: row[3] instanceof Date ? Utilities.formatDate(row[3], "GMT+7", "dd/MM/yyyy") : row[3],
      soTien: row[4], // QUAN TRỌNG: Để nguyên giá trị (số hoặc chữ) để Frontend xử lý
      sdt: displayPhone10(row[5]),
      linkGCN: row[6] || ""
    }));

    return createResponse({
      success: true,
      count: results.length,
      data: results
    });

  } catch (error) {
    return createResponse({ success: false, message: "Lỗi hệ thống: " + error.toString() });
  }
}

/**
 * Lấy dữ liệu các dự án đang kêu gọi từ sheet KEUGOI.
 *
 * Cấu trúc gợi ý:
 * A TrangThai | B TenDuAn | C ThoiGianBatDau | D ThoiGianKetThuc |
 * E CuPhapUngHo | F SoTienKeuGoi | G SoTienDaNhan | H GhiChu
 */
function getKeuGoiCampaigns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("KEUGOI");
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  values.shift(); // bỏ hàng tiêu đề

  const now = new Date();

  return values
    .filter(row => {
      const trangThai = (row[0] || "").toString().trim().toLowerCase();
      const tenDuAn = (row[1] || "").toString().trim();
      const thoiGianKetThuc = toDateObject(row[3]);

      // Không hiển thị dòng trống hoặc dòng bị đánh dấu ẩn/ngưng
      if (!tenDuAn) return false;
      if (["ẩn", "an", "hide", "ngưng", "ngung", "dừng", "dung", "off"].includes(trangThai)) return false;

      // Nếu có thời gian kết thúc và đã hết hạn thì không hiển thị
      if (thoiGianKetThuc && thoiGianKetThuc.getTime() < now.getTime()) return false;

      return true;
    })
    .map(row => {
      const soTienKeuGoi = parseMoney(row[5]);
      const soTienDaNhan = parseMoney(row[6]);
      const tienDo = soTienKeuGoi > 0
        ? Math.min(100, Math.round((soTienDaNhan / soTienKeuGoi) * 1000) / 10)
        : 0;

      return {
        tenDuAn: row[1] || "—",
        thoiGianBatDau: formatDateTimeForClient(row[2]),
        thoiGianKetThuc: formatDateTimeForClient(row[3]),
        cuPhapUngHo: row[4] || "",
        soTienKeuGoi: soTienKeuGoi,
        soTienDaNhan: soTienDaNhan,
        tienDo: tienDo,
        ghiChu: row[7] || ""
      };
    });
}

function toDateObject(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  // Hỗ trợ nhập chuỗi dạng dd/MM/yyyy HH:mm hoặc dd/MM/yyyy
  if (typeof value === "string") {
    const text = value.trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const year = Number(match[3]);
      const hour = Number(match[4] || 0);
      const minute = Number(match[5] || 0);
      return new Date(year, month, day, hour, minute, 0);
    }

    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function formatDateTimeForClient(value) {
  const date = toDateObject(value);
  if (!date) return "";
  return Utilities.formatDate(date, "GMT+7", "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const cleaned = value.toString().replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

/**
 * HÀM PHỤ TRỢ (HELPER FUNCTIONS)
 */

function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Loại bỏ dấu tiếng Việt để tìm kiếm chính xác
function removeVietnameseTones(str) {
  str = (str || "").toString().toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); 
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); 
  return str;
}

// Chuẩn hóa số điện thoại về dạng 0xxx
function normalizePhone(phone) {
  if (!phone) return "";

  // Xóa khoảng trắng, dấu chấm, dấu gạch, ngoặc...
  // Ví dụ: "03 86523563" -> "0386523563"
  let p = phone.toString().replace(/\D/g, '');

  // Chuẩn hóa đầu số Việt Nam
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  if (p.startsWith('84') && p.length >= 10) p = '0' + p.slice(2);

  // Trường hợp người dùng nhập 9 số, không có số 0 đầu
  // Ví dụ: "386523563" -> "0386523563"
  if (/^[1-9]\d{8}$/.test(p)) p = '0' + p;

  return p;
}

function displayPhone10(phone) {
  var p = normalizePhone(phone || "");
  if (p.length > 10) p = p.slice(-10);
  while (p.length < 10) p = "0" + p;
  return p;
}

// ==================== QUẢN TRỊ ====================
// Chạy initializeFirstSuperadmin() một lần trong Apps Script sau khi đặt
// INITIAL_SUPERADMIN_EMAIL, INITIAL_SUPERADMIN_NAME và INITIAL_SUPERADMIN_PASSWORD
// trong Script Properties. Mật khẩu đầu tiên bắt buộc phải được đổi khi đăng nhập.
var ADMIN_HEADERS = ["AdminID", "Email", "HoTen", "MatKhauHash", "Salt", "Role", "PhamVi", "TrangThai", "NgayTao", "LanDangNhapCuoi", "GhiChu", "MustChangePassword", "PasswordChangedAt"];
var GCN_HEADERS = ["Mã GCN", "Họ tên", "Chiến dịch", "Ngày ủng hộ", "Số tiền", "Số điện thoại", "Link GCN"];
var CAMPAIGN_HEADERS = ["HienThi", "TenDuAn", "ThoiGianBatDau", "ThoiGianKetThuc", "CuPhapUngHo", "SoTienKeuGoi", "SoTienDaNhan", "MoTa", "GhiChu"];
var ADMIN_SESSION_TTL = 21600;

function handleAdminRequest(body) {
  var action = body.action;
  if (action === "adminLogin") return adminLogin(body.email, body.password);
  if (action === "adminChangePassword") return adminChangePassword(body.token, body.currentPassword, body.newPassword);

  var session = requireAdminSession(body.token);
  if (session.mustChangePassword) return { success: false, mustChangePassword: true, message: "Bạn cần đổi mật khẩu trước khi tiếp tục." };

  if (action === "adminListCertificates") return adminListRows(getGcnSheet(), GCN_HEADERS, body.page, { reverse: true, query: body.query, type: "certificates" });
  if (action === "adminSaveCertificate") return adminSaveCertificate(body.record, body.rowNumber);
  if (action === "adminBulkSaveCertificates") return adminBulkSaveCertificates(body.records);
  if (action === "adminListCampaigns") return adminListRows(getCampaignSheet(), CAMPAIGN_HEADERS, body.page);
  if (action === "adminSaveCampaign") return adminSaveRow(getCampaignSheet(), CAMPAIGN_HEADERS, body.record, body.rowNumber);
  if (action === "adminListUsers") return adminListUsers(body.page);
  if (action === "adminSaveUser") return adminSaveUser(session, body.record, body.rowNumber, body.temporaryPassword);
  if (action === "adminResetPassword") return adminResetPassword(session, body.adminId, body.temporaryPassword);
  if (action === "adminToggleUserStatus") return adminToggleUserStatus(session, body.adminId, body.status);
  if (action === "adminLogout") { CacheService.getScriptCache().remove("admin_session_" + body.token); return { success: true }; }
  return { success: false, message: "Yêu cầu quản trị không hợp lệ." };
}

function getAdminSheet() { return getOrCreateSheet("AdminUsers", ADMIN_HEADERS); }
function getGcnSheet() { return getOrCreateSheet("GCN", GCN_HEADERS); }
function getCampaignSheet() { return getOrCreateSheet("KEUGOI", CAMPAIGN_HEADERS); }

function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function initializeFirstSuperadmin() {
  var properties = PropertiesService.getScriptProperties();
  var email = (properties.getProperty("INITIAL_SUPERADMIN_EMAIL") || "").trim().toLowerCase();
  var fullName = (properties.getProperty("INITIAL_SUPERADMIN_NAME") || "SuperAdmin").trim();
  var password = properties.getProperty("INITIAL_SUPERADMIN_PASSWORD") || "";
  if (!email || !password) throw new Error("Hãy đặt INITIAL_SUPERADMIN_EMAIL và INITIAL_SUPERADMIN_PASSWORD trong Script Properties.");
  var sheet = getAdminSheet();
  if (findAdminByEmail(email)) throw new Error("Email SuperAdmin này đã tồn tại.");
  var salt = createSalt();
  sheet.appendRow(["ADM-" + Utilities.getUuid().slice(0, 8).toUpperCase(), email, fullName, hashPassword(password, salt), salt, "SuperAdmin", "ToanHeThong", "HoatDong", new Date(), "", "Tài khoản khởi tạo", true, ""]);
  properties.deleteProperty("INITIAL_SUPERADMIN_PASSWORD");
  return "Đã tạo SuperAdmin. Mật khẩu tạm đã bị xóa khỏi Script Properties.";
}

function adminLogin(email, password) {
  var user = findAdminByEmail((email || "").trim().toLowerCase());
  if (!user || user.TrangThai !== "HoatDong") return { success: false, message: "Email, mật khẩu hoặc trạng thái tài khoản không hợp lệ." };
  if (hashPassword(password || "", user.Salt) !== user.MatKhauHash) return { success: false, message: "Email hoặc mật khẩu không chính xác." };
  var token = Utilities.getUuid() + Utilities.getUuid();
  var session = { adminId: user.AdminID, email: user.Email, hoTen: user.HoTen, role: normalizeAdminRole(user.Role), mustChangePassword: toBoolean(user.MustChangePassword) };
  CacheService.getScriptCache().put("admin_session_" + token, JSON.stringify(session), ADMIN_SESSION_TTL);
  getAdminSheet().getRange(user._rowNumber, 10).setValue(new Date());
  return { success: true, token: token, user: session, mustChangePassword: session.mustChangePassword };
}

function requireAdminSession(token) {
  if (!token) throw new Error("Phiên đăng nhập không tồn tại.");
  var cached = CacheService.getScriptCache().get("admin_session_" + token);
  if (!cached) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  var session = JSON.parse(cached);
  var user = findAdminById(session.adminId);
  if (!user || user.TrangThai !== "HoatDong") throw new Error("Tài khoản đã bị khóa hoặc không còn tồn tại.");
  session.role = normalizeAdminRole(user.Role);
  session.mustChangePassword = toBoolean(user.MustChangePassword);
  CacheService.getScriptCache().put("admin_session_" + token, JSON.stringify(session), ADMIN_SESSION_TTL);
  return session;
}

function adminChangePassword(token, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) return { success: false, message: "Mật khẩu mới phải có ít nhất 8 ký tự." };
  var session = requireAdminSession(token);
  var user = findAdminById(session.adminId);
  if (hashPassword(currentPassword || "", user.Salt) !== user.MatKhauHash) return { success: false, message: "Mật khẩu hiện tại không chính xác." };
  var salt = createSalt();
  var sheet = getAdminSheet();
  sheet.getRange(user._rowNumber, 4, 1, 2).setValues([[hashPassword(newPassword, salt), salt]]);
  sheet.getRange(user._rowNumber, 12, 1, 2).setValues([[false, new Date()]]);
  session.mustChangePassword = false;
  CacheService.getScriptCache().put("admin_session_" + token, JSON.stringify(session), ADMIN_SESSION_TTL);
  return { success: true, user: session };
}

function adminListRows(sheet, headers, page, options) {
  options = options || {};
  var pageSize = 20;
  var currentPage = Math.max(1, Number(page || 1));
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function(row, index) {
    return { row: row, rowNumber: index + 2 };
  }) : [];
  var query = (options.query || "").toString().trim();
  if (query && options.type === "certificates") {
    var normalizedQuery = removeVietnameseTones(query);
    var phoneQuery = normalizePhone(query);
    rows = rows.filter(function(item) {
      var row = item.row;
      var maGCN = (row[0] || "").toString().toLowerCase();
      var hoTen = removeVietnameseTones(row[1] || "");
      var sdt = normalizePhone(row[5] || "");
      return maGCN.indexOf(query.toLowerCase()) !== -1 ||
        hoTen.indexOf(normalizedQuery) !== -1 ||
        (phoneQuery && sdt.indexOf(phoneQuery) !== -1);
    });
  }
  if (options.reverse) rows.reverse();
  var total = rows.length;
  var from = (currentPage - 1) * pageSize;
  var data = rows.slice(from, from + pageSize).map(function(item) { return mapRow(headers, item.row, item.rowNumber); });
  return { success: true, data: data, page: currentPage, totalPages: Math.max(1, Math.ceil(total / pageSize)), total: total };
}

function adminSaveCertificate(record, rowNumber) {
  if (!record) return { success: false, message: "Dữ liệu không hợp lệ." };
  var phoneDigits = (record["Số điện thoại"] || "").toString().replace(/\D/g, "");
  if (phoneDigits.length < 2) return { success: false, message: "Số điện thoại cần nhập tối thiểu 2 số. Nếu chưa có SĐT, vui lòng nhập 00." };
  record["Số điện thoại"] = displayPhone10(record["Số điện thoại"]);
  return adminSaveRow(getGcnSheet(), GCN_HEADERS, record, rowNumber);
}

function adminBulkSaveCertificates(records) {
  if (!Array.isArray(records) || records.length === 0) return { success: false, message: "Chưa có dữ liệu để nhập hàng loạt." };
  if (records.length > 500) return { success: false, message: "Mỗi lần chỉ nên nhập tối đa 500 dòng để tránh quá tải." };

  var values = [];
  for (var i = 0; i < records.length; i++) {
    var record = records[i] || {};
    var phoneDigits = (record["Số điện thoại"] || "").toString().replace(/\D/g, "");
    if (phoneDigits.length < 2) return { success: false, message: "Dòng " + (i + 1) + ": Số điện thoại cần tối thiểu 2 số. Nếu chưa có SĐT, nhập 00." };
    record["Số điện thoại"] = displayPhone10(record["Số điện thoại"]);
    values.push(GCN_HEADERS.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
  }

  var sheet = getGcnSheet();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var startRow;
  try {
    startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, values.length, GCN_HEADERS.length).setValues(values);
  } finally { lock.releaseLock(); }

  var rows = values.map(function(row, index) { return mapRow(GCN_HEADERS, row, startRow + index); });
  return { success: true, count: rows.length, rows: rows };
}

function adminSaveRow(sheet, headers, record, rowNumber) {
  if (!record) return { success: false, message: "Dữ liệu không hợp lệ." };
  var values = headers.map(function(header) { return record[header] === undefined ? "" : record[header]; });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var savedRowNumber = rowNumber ? Number(rowNumber) : null;
  try {
    if (savedRowNumber) sheet.getRange(savedRowNumber, 1, 1, headers.length).setValues([values]);
    else {
      sheet.appendRow(values);
      savedRowNumber = sheet.getLastRow();
    }
  } finally { lock.releaseLock(); }
  return { success: true, row: mapRow(headers, values, savedRowNumber) };
}

function adminListUsers(page) {
  var result = adminListRows(getAdminSheet(), ADMIN_HEADERS, page);
  result.data = result.data.map(function(user) { delete user.MatKhauHash; delete user.Salt; return user; });
  return result;
}

function adminSaveUser(session, record, rowNumber, temporaryPassword) {
  if (!record || !record.Email || !record.HoTen || !record.Role) return { success: false, message: "Email, họ tên và quyền là bắt buộc." };
  var sheet = getAdminSheet();
  var existing = rowNumber ? findAdminById(record.AdminID) : findAdminByEmail(record.Email.toLowerCase());
  if (!rowNumber && existing) return { success: false, message: "Email này đã có tài khoản." };
  if (!rowNumber && (!temporaryPassword || temporaryPassword.length < 8)) return { success: false, message: "Mật khẩu tạm phải có ít nhất 8 ký tự." };
  var safeRecord = record;
  safeRecord.Email = record.Email.trim().toLowerCase();
  safeRecord.Role = normalizeAdminRole(record.Role);
  safeRecord.AdminID = record.AdminID || "ADM-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  safeRecord.TrangThai = record.TrangThai || "HoatDong";
  safeRecord.PhamVi = record.PhamVi || "ToanHeThong";
  if (!isSuperAdminRole(session.role) && isSuperAdminRole(safeRecord.Role)) return { success: false, message: "Chỉ SuperAdmin có quyền tạo hoặc cấp quyền SuperAdmin." };
  if (!rowNumber) {
    var salt = createSalt();
    safeRecord.MatKhauHash = hashPassword(temporaryPassword, salt);
    safeRecord.Salt = salt;
    safeRecord.NgayTao = new Date();
    safeRecord.MustChangePassword = true;
  } else {
    if (!existing) return { success: false, message: "Không tìm thấy tài khoản." };
    if (!isSuperAdminRole(session.role) && isSuperAdminRole(existing.Role)) return { success: false, message: "Admin không được chỉnh sửa tài khoản SuperAdmin." };
    if (!isSuperAdminRole(session.role) && safeRecord.TrangThai !== existing.TrangThai) return { success: false, message: "Chỉ SuperAdmin có quyền khóa hoặc mở khóa tài khoản." };
    safeRecord.MatKhauHash = existing.MatKhauHash;
    safeRecord.Salt = existing.Salt;
    safeRecord.NgayTao = existing.NgayTao;
    safeRecord.LanDangNhapCuoi = existing.LanDangNhapCuoi;
    safeRecord.MustChangePassword = existing.MustChangePassword;
    safeRecord.PasswordChangedAt = existing.PasswordChangedAt;
  }
  var saved = adminSaveRow(sheet, ADMIN_HEADERS, safeRecord, rowNumber);
  if (saved.row) { delete saved.row.MatKhauHash; delete saved.row.Salt; }
  return saved;
}

function adminResetPassword(session, adminId, temporaryPassword) {
  if (!temporaryPassword || temporaryPassword.length < 8) return { success: false, message: "Mật khẩu tạm phải có ít nhất 8 ký tự." };
  var user = findAdminById(adminId);
  if (!user) return { success: false, message: "Không tìm thấy tài khoản." };
  if (!isSuperAdminRole(session.role) && isSuperAdminRole(user.Role)) return { success: false, message: "Admin không được reset mật khẩu của SuperAdmin." };
  var salt = createSalt();
  var sheet = getAdminSheet();
  sheet.getRange(user._rowNumber, 4, 1, 2).setValues([[hashPassword(temporaryPassword, salt), salt]]);
  sheet.getRange(user._rowNumber, 12, 1, 2).setValues([[true, ""]]);
  return { success: true };
}

function adminToggleUserStatus(session, adminId, status) {
  if (!isSuperAdminRole(session.role)) return { success: false, message: "Chỉ SuperAdmin có quyền khóa hoặc mở khóa tài khoản." };
  var user = findAdminById(adminId);
  if (!user) return { success: false, message: "Không tìm thấy tài khoản." };
  if (user.AdminID === session.adminId) return { success: false, message: "Không thể khóa chính tài khoản đang đăng nhập." };
  getAdminSheet().getRange(user._rowNumber, 8).setValue(status === "Khoa" ? "Khoa" : "HoatDong");
  return { success: true };
}

function normalizeAdminRole(role) {
  return (role || "").toString().toLowerCase() === "superadmin" ? "SuperAdmin" : "Admin";
}

function isSuperAdminRole(role) {
  return normalizeAdminRole(role) === "SuperAdmin";
}

function findAdminByEmail(email) { return findAdmin(function(user) { return (user.Email || "").toString().toLowerCase() === email; }); }
function findAdminById(adminId) { return findAdmin(function(user) { return user.AdminID === adminId; }); }
function findAdmin(predicate) {
  var sheet = getAdminSheet();
  var values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, ADMIN_HEADERS.length).getValues() : [];
  for (var i = 0; i < values.length; i++) {
    var user = mapRow(ADMIN_HEADERS, values[i], i + 2);
    if (predicate(user)) return user;
  }
  return null;
}

function mapRow(headers, row, rowNumber) {
  var result = { _rowNumber: rowNumber };
  headers.forEach(function(header, index) {
    var value = row[index];
    if (value instanceof Date) result[header] = Utilities.formatDate(value, "GMT+7", "dd/MM/yyyy");
    else if (header === "Số điện thoại") result[header] = displayPhone10(value);
    else result[header] = value;
  });
  return result;
}

function createSalt() { return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""); }
function hashPassword(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "|" + password, Utilities.Charset.UTF_8);
  return bytes.map(function(byte) { var value = byte < 0 ? byte + 256 : byte; return ("0" + value.toString(16)).slice(-2); }).join("");
}
function toBoolean(value) { return value === true || value === "TRUE" || value === "true" || value === 1 || value === "1"; }
