# Bước 17 — Sao lưu cloud và khôi phục vào kho riêng

Phê duyệt: 05/10/2026. Đã triển khai và nghiệm thu staging.

Giao diện Sao lưu: tạo snapshot các bảng nghiệp vụ D1 trong một batch transaction,
sao chép PDF/logo/ảnh R2 và font/OFL riêng từng file, ghi manifest sau khi mọi file
được đọc lại đúng SHA-256. Có thể tiếp tục bản đang tạo và kiểm tra lại từng file.
Tải ZIP lưu trữ không nén về máy; bản trong cùng tài khoản Cloudflare chưa phải
bản ngoài điểm hỏng. Cần chép ZIP sang nơi riêng. Không thêm lịch tự động ở bước này.

Giới hạn staging: 10 bản, snapshot JSON tối đa 1 MiB, 5.000 hàng mỗi bảng,
100 MiB tài nguyên gốc + font. Không tự xóa bản cũ. Không sao lưu credential hoặc
session; tài khoản/token kết nối ngoài chưa được thiết lập. Từ chối database có
page connection/job, pending file, tài nguyên thiếu hoặc sai checksum, bảo trì.
Chỉ snapshot dữ liệu đã lưu; sửa đang nằm trong form chưa thuộc snapshot.

Khôi phục gói ZIP đã giải nén bằng Node CLI vào thư mục tmp mới: dựng schema từ
mã nguồn tin cậy, nhập dữ liệu bằng bind parameters, kiểm foreign key/integrity,
chép tài nguyên, cách ly mọi phiên bản, dừng lịch. Giữ lịch sử/receipt nhưng chúng
không còn hiện hành. Không thực thi SQL từ gói, không phục hồi secrets và không
đổi binding D1/R2 staging. Chưa triển khai chuyển kho phục hồi lên cloud; việc đó
cần thao tác vận hành và phê duyệt riêng. Đây là khôi phục đầy đủ dữ liệu cloud
vào SQLite cô lập để chứng minh gói dùng được, không phải rollback hệ thống thật.

UI giữ palette campus xanh #07559D, nền #F2F6FA, chữ #253347, trắng #FFFFFF,
nhãn #8B751D. Danh sách theo thời điểm, tiến độ file và nút tiếp tục/kiểm tra/tải;
form một cột trên mobile, không hiển thị nội dung snapshot trong danh sách.

D1 batch có giao dịch theo tài liệu chính thức; không dùng dump() vì chỉ hỗ trợ
database alpha. Snapshot giới hạn dưới 50 queries/invocation, sao chép một file
mỗi request để tránh gom toàn kho trong bộ nhớ Worker 128 MiB. Tham khảo:
https://developers.cloudflare.com/d1/worker-api/d1-database/
https://developers.cloudflare.com/d1/platform/limits/
https://developers.cloudflare.com/workers/platform/limits/

Kiểm thử phải có: snapshot bất biến khi biên tập sau đó, resume/đồng thời/CAS,
file hỏng/thiếu/pending, manifest, quota, auth/CSRF, D1/R2 thực tế cục bộ, ZIP đọc
bằng thư viện độc lập và restore đủ dữ liệu/ảnh/nguồn, quarantine, không ghi đè.

Nghiệm thu cục bộ: 9 kiểm thử chuyên biệt sao lưu/khôi phục đạt; runtime Worker
D1/R2 thực tế cục bộ áp dụng đủ 12 migrations và hoàn tất sao lưu/đối chiếu.
19 kiểm tra giao diện desktop/mobile đạt. ZIP tải từ giao diện được Python
zipfile kiểm CRC độc lập và khôi phục SQLite cô lập, giữ lịch sử và cách ly
mọi phiên bản. Đã nghiệm thu trên staging thật.


Nghiệm thu cuối: 211/211 kiểm thử local và 9/9 kiểm tra ảnh đạt. CI Windows và
Ubuntu đạt (175 portable tests); runtime Worker/D1/R2 chạy trên Ubuntu và local.
Đã sửa Git checkout Windows đổi CRLF của OFL bằng thuộc tính eol=lf, giữ checksum.

Bản staging được triển khai qua GitHub Actions, 12 migrations. Kiểm tra 36
đường dẫn không đăng nhập trả 401; health bearer không truy cập kho riêng.
21 tài nguyên gốc, 13 PDF nguồn chuẩn giữ nguyên checksum; lịch dừng, publish 501.

Đã tạo bản thật backup-0b849c33-4755-4b24-9441-7082e6acc478 qua phiên Google owner:
40 bài, 40 phiên bản, 21 tài nguyên, 27 file (13.131.989 byte nội dung).
Đã đối chiếu 27 file và manifest, tải ZIP 13.143.737 byte vào Downloads.
Python zipfile kiểm CRC và giải nén độc lập thành công. CLI khôi phục vào
tmp/step-17/restores/restored-aa933d38-2774-44cd-ac4e-cdfd7a837cd5:
40 bài/40 phiên bản/21 tài nguyên; integrity=ok, foreign_key_check không có lỗi,
paused=true, quarantined=true, remoteModified=false. Không đưa kho phục hồi lên cloud.

Bằng chứng riêng tư (không đưa GitHub): tmp/step-17/browser-results.json,
remote-evidence.json, real-restore-result.json, staging-backup-complete.png.
ZIP nằm ở C:/Users/trant/Downloads/backup-0b849c33-4755-4b24-9441-7082e6acc478.zip.
Chưa thiết lập sao lưu theo lịch/retention/xóa bản; dừng tại Bước 17 để chờ phê duyệt bước kế tiếp.
