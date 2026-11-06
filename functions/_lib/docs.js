// Tệp giấy đã cấp (Giấy khen / Giấy chứng nhận / Khác): bản scan có chữ ký tay, hoặc PDF có chữ ký số.
export const DOC_KINDS = { 'giay-khen': 'Giấy khen', 'giay-chung-nhan': 'Giấy chứng nhận', khac: 'Giấy tờ khác' };
export const DOC_TYPES = { scan: 'Bản scan có chữ ký tay', digital: 'PDF có chữ ký số' };
export const docKindLabel = c => c.doc_kind?.startsWith('khac:') ? c.doc_kind.slice(5) : (DOC_KINDS[c.doc_kind] || 'Giấy chứng nhận');
export const docUrl = (c, dl) => `/api/cert-file?code=${encodeURIComponent(c.code)}&s=${c.sig}${dl ? '&dl=1' : ''}`;
export const NEAC_URL = 'https://neac.gov.vn/vi';
export const parseSig = c => { try { return c.doc_sig ? JSON.parse(c.doc_sig) : null; } catch { return null; } };
