# Bước 14 — Kho tài nguyên private trên cloud

Người dùng phê duyệt 05/10/2026. Đã triển khai và kiểm tra phạm vi Bước 14.

Phạm vi: R2 bucket staging riêng `nttu-publisher-staging-assets`, thư viện PDF/logo/ảnh,
tải lên qua Google owner + Origin/CSRF, xem/tải file sau xác thực, gắn ảnh vuông 1080 PNG
vào phiên bản mới của bài. Giữ nội dung và phiên bản cũ. Không bật Facebook, Telegram,
ready, public bucket hay tự sinh ảnh bằng AI. Không chuyển kho caption local đè lên cloud.

Thiết kế giữ giao diện Bước 13: xanh trường, nền sáng, Segoe UI/Bahnschrift. Thêm tab
Tài nguyên có biểu mẫu upload và danh sách theo loại. Editor hiển thị ảnh đang gắn và
bộ chọn ảnh từ thư viện; PDF mở trong tab riêng sau đăng nhập. Mobile một cột.

D1 chỉ lưu metadata, SHA-256, trạng thái pending/complete và object key. R2 chứa bytes.
Object key do server sinh theo loại/checksum, không nhận đường dẫn từ client. Giới hạn
256 file/100 MiB trong thư viện staging; PDF 12 MiB, logo/ảnh 5 MiB mỗi file.
Giới hạn ứng dụng không bảo đảm hóa đơn tài khoản bằng 0 khi có dịch vụ/dữ liệu khác.

Reserve metadata pending trước khi put R2; chỉ complete sau khi đọc lại và khớp SHA-256.
Retry cùng bytes tiếp tục bản pending; trùng bytes cùng loại dùng lại record, không ghi đè.
Metadata complete bất biến, không xóa file đã gắn lịch sử. Hai dịch vụ không có transaction
chung: pending là trạng thái phục hồi rõ ràng, không tuyên bố R2/D1 nguyên tử.

Chỉ chấp nhận PNG/JPEG cho logo, PNG 1080x1080 cho ảnh bài, PDF cho tài liệu. Kiểm tra
magic/header/kích thước; đây không phải kiểm định nội dung PDF hay toàn bộ pixel ảnh.
Gắn ảnh tạo version needs_review mới, không sao chép review/ready. File private không
dùng URL public; mọi đường dẫn đọc qua owner auth, no-store, nosniff, CSP riêng PDF/ảnh.

Tài nguyên ban đầu dự kiến: 13 PDF, 3 logo chuẩn và 5 ảnh vuông đã dựng local. Chỉ upload
sau khi R2 hoạt động và code được kiểm thử; không đưa những file đó vào Git/GitHub Actions.
R2 subscription/cấu hình account do owner thiết lập nếu chưa có. Không tự mua dịch vụ.

Cổng kiểm thử: input sai/oversize, SHA mismatch, pending recovery, quota/CAS/concurrency,
auth/CSRF, D1+R2 trong Workers runtime, GUI desktop/mobile, deploy và private file check thật.
Nếu R2 account chưa sẵn sàng, hoàn tất phần độc lập và báo rõ phần triển khai còn chờ.

Nguồn kỹ thuật: https://developers.cloudflare.com/r2/get-started/,
https://developers.cloudflare.com/r2/api/workers/workers-api-reference/.

Kiểm thử trước deploy 05/10/2026: TypeScript, 188 kiểm thử mã nguồn, 9 kiểm thử
Chrome desktop/mobile đạt. Đã xem screenshot giao diện tài nguyên hai kích thước.
Workers runtime local chạy 10 migration D1, R2 upload/dedup/download/attach, OAuth
form POST và chặn redirect đạt. Đây là kiểm thử local, không thay nghiệm thu remote.

Owner xác nhận đã kích hoạt R2. Bucket thật đã tạo Standard, public dev URL disabled,
không custom domain. Biến GitHub STAGING_R2_ENABLED=true đã lưu. Tổng tài nguyên đầu vào đã
kiểm checksum theo registry: 21 file, 12.571.426 bytes.

`scripts/upload-private-assets.mjs` là công cụ quản trị chạy trên máy owner với
Wrangler OAuth hiện có; từ chối CI. Reserve pending trước upload, đọc lại SHA-256
trước complete. CLI không hỗ trợ conditional put: chỉ put sau GET xác nhận 404;
không chạy hai phiên import cùng lúc. File complete thiếu trên R2 thì dừng, không
ghi đè sửa âm thầm. Evidence/input/readback chỉ nằm trong tmp bị Git ignore.
Không thay caption, review, lịch hay cấu hình đăng khi nhập tài nguyên.

Nghiệm thu remote 05/10/2026: release 459866cc4dc36cebba18be4fc9e078a504796c24,
CI Windows/Ubuntu và deploy success:
https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37293218181.
Đã nhập đủ 13 PDF, 3 logo và 5 PNG mẫu; tất cả R2 readback khớp SHA-256. Metadata
D1 đủ 21 record complete, đúng checksum/loại/bytes. Kiểm 24 endpoint private
(21 file, library, catalog, manager.js) ẩn danh đều 401; bearer health không đọc
được library. Health 200 đúng release, D1 private status 200/paused=true,
publish endpoint 501. Bucket dev URL disabled, không custom domain.

Công cụ import đã sửa khác biệt CLI thật: D1 --file dùng bulk import, có progress
và không trả SELECT rows. Dùng --command qua argv trực tiếp, parser chỉ nhận JSON
kết quả hợp lệ, thêm regression test. Bộ mã nguồn sau sửa có 189 kiểm thử.
Không thay Worker runtime trong bản sửa công cụ nhập; CI vẫn kiểm tra/deploy SHA mới.

Giới hạn còn lại: upload/preview/gắn ảnh đã kiểm Chrome + D1/R2 local; người quản lý
chưa xác nhận thao tác trên giao diện remote sau Bước 14. Chưa đưa kiểm định nguồn
theo trang, dựng ảnh/chỉnh logo, backup cloud, Gemini, Telegram hay Meta lên cloud.
File lưu thành công không chứng minh nội dung/thiết kế đã được phê duyệt. Bước 15
chỉ bắt đầu sau phê duyệt riêng; đề xuất chuyển kiểm định nguồn và bài lên giao diện cloud.
