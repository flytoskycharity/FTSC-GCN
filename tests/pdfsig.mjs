// Kiểm tra bộ đọc chữ ký số PDF với các tệp mẫu (chứng thư thử nghiệm, không phải chứng thư thật).
import fs from 'node:fs';
import assert from 'node:assert';
import { verifyPdf } from '../functions/_lib/pdfsig.js';
const f = n => fs.readFileSync(new URL(`./fixtures/${n}.pdf`, import.meta.url));
const good = await verifyPdf(f('good'), 'FLY TO SKY|5901213612');
assert.ok(good.ok && good.signatures[0].trustedRoot && good.signerMatch, 'tệp ký đúng');
assert.equal((await verifyPdf(f('tampered'))).signatures[0].integrity, false, 'phát hiện sửa nội dung');
assert.equal((await verifyPdf(f('appended'))).modifiedAfter, true, 'phát hiện thêm nội dung sau khi ký');
const self = await verifyPdf(f('selfsigned'), 'FLY TO SKY');
assert.ok(!self.signatures[0].trustedRoot && self.signerMatch === false, 'chứng thư tự ký không tin cậy');
console.log('OK – kiểm tra chữ ký số PDF đạt');
