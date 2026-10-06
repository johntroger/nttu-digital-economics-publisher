# Bước 24 — Nhập kho đã duyệt vào staging

## Phạm vi được duyệt

Đưa 40 bài đã duyệt về nội dung và thiết kế ở Bước 22–23 vào D1/R2 staging. Mỗi bài có phiên bản mới, caption, ảnh vuông, căn cứ tài liệu và biên nhận phê duyệt gắn với checksum. Giữ lịch dừng và không tạo yêu cầu đăng Facebook, thông báo Telegram hoặc lịch ngày thật.

## Cách nhập

`scripts/cloud-batch-import.mjs` là công cụ quản trị chạy trên máy người quản lý, từ chối CI và chỉ chấp nhận database staging đã cấu hình. Kiểm tra hai biên nhận duyệt, batch và manifest; đối chiếu từng caption, ảnh đầy đủ và bản thu nhỏ trước upload. Sao lưu toàn bộ D1 vào thư mục tmp riêng tư trước thay đổi.

Lệnh vận hành là `npm run cloud:import:batch`, với `STAGING_D1_DATABASE_ID` được đặt rõ ràng cho staging và phiên Wrangler của người quản lý đã đăng nhập. Không chạy hai tiến trình import cùng lúc: CLI R2 không có conditional put. Metadata phiên bản mới giữ concept/angle theo tiêu đề và mục tiêu biên tập để phục vụ xoay tua sau này.

Ảnh dùng khóa theo SHA-256 trong bucket R2 riêng tư. Tài nguyên có sẵn được đọc lại, không ghi đè; chỉ upload sau khi xác nhận object chưa tồn tại. Tài nguyên mới có trạng thái pending cho tới khi đọc lại bytes và checksum đạt. Tiến trình bị dừng có thể tiếp tục dùng tài nguyên đã kiểm tra; không xóa tài nguyên hoặc lịch sử cũ. Giới hạn số file và dung lượng thư viện hiện có vẫn áp dụng.

Sau khi kiểm tra ảnh, tài liệu và logo từ R2, nhập caption bằng file SQL nguyên tử. Guard kiểm tra staging đang dừng, không có bảo trì hoặc công việc đăng chưa giải quyết, đúng phiên bản cha, ảnh không bị chặn và nguồn hiện hành không bị chặn. Guard hoặc bất kỳ câu lệnh nào thất bại thì toàn bộ cập nhật caption bị hoàn tác. Ảnh đã upload trước đó vẫn được giữ trong thư viện để có thể tiếp tục nhập.

Mỗi bài thêm một phiên bản; giữ phiên bản trước, facts và nguồn cũ. Phiên bản mới gắn nguồn theo trang, ảnh và check_version sau các trigger; biên nhận cloud lưu đúng body, caption, checksum ảnh, footer và snapshot nguồn. Metadata ghi rõ phê duyệt từ Bước 22 hay 23. Đây là chuyển dấu duyệt của người quản lý, không phải AI tự phê duyệt. Status phiên bản vẫn là `needs_review`, ready=false và không thêm content_checks cho phép đăng.

Batch ID và fingerprint cố định giúp chạy lại không tạo 40 phiên bản trùng. Nếu dùng lại batch ID với phê duyệt khác thì dừng. Replay vẫn kiểm tra checksum tài nguyên và bản active; không khôi phục đè lên bản đã được sửa sau nhập.

## Kiểm thử

Các kiểm thử mới trong `tests/cloud-batch-import.test.mjs` kiểm tra giữ lịch sử, gắn đủ 40 dấu duyệt, xung đột phiên bản, lịch không dừng, nguồn/ảnh bị chặn, lỗi giữa chừng, phê duyệt thay đổi và chạy lại. Mô phỏng riêng dùng 40 caption thật cho 30 ngày: đúng một bài/ngày, ba lần thử cách nhau năm phút và dùng bài dự phòng cùng nhóm trong ngày lỗi. Chỉ bản sao trong fixture được giả định ready; D1 staging không được cấp ready.

Kiểm thử điều phối D1/workerd có sáu tình huống tích hợp đạt, không gọi Facebook hoặc Telegram. TypeScript và 264 kiểm thử Node đạt; kiểm thử ảnh bắt buộc tiếp tục chạy trước push. Các file SQL snapshot, object đọc lại và bằng chứng chi tiết nằm trong tmp bị Git ignore.

## Nghiệm thu remote

Nghiệm thu ngày 06/10/2026 lúc 08:09:09 UTC: 40 bài active có caption hoàn chỉnh, ảnh và dấu duyệt current; structurallyReviewable=40, reviewed=40, issues=0. Cả 40 PNG và 16 object tài liệu/logo đã được đọc lại từ R2 và khớp SHA-256. Đã kiểm tra khóa ngoại và liên kết nguồn/ảnh/check_version, cũng như facts khóa 2026 và thời lượng 3,5 năm bằng điều kiện eligibility của domain.

Status phiên bản còn `needs_review`, ready=0; paused=1, publish_jobs=0, publications=0. Lịch sử riêng của bài kiểm thử kỹ thuật trước đó vẫn có đúng một bài đã đăng. Không có bảng mô phỏng fixture trong D1 remote. Không gửi Telegram và không gọi API đăng Facebook ở bước này.

Sáu endpoint catalog/audit/workflow/script/ảnh từ chối truy cập ẩn danh (401); bearer chỉ dành cho health không đọc được catalog. Rà soát nội dung bằng cùng dịch vụ catalog/review trên snapshot D1 thật và object đọc lại từ R2. Chưa thao tác qua trình duyệt đã đăng nhập; người quản lý có thể mở giao diện staging để xem kho mới.

Bằng chứng riêng tư: `tmp/step24/import/evidence.json`, `tmp/step24/audit-evidence.json`, SQL trước/sau nhập và các object readback. Snapshot đầu tiên trước mọi upload được giữ tại `tmp/step24/import/before.sql`; lần tiếp tục có thêm snapshot có timestamp. Đã giữ nguyên caption và PNG được duyệt; chỉ bổ sung metadata và tạo phiên bản cloud.

File import D1 dùng cơ chế import nguyên tử của Cloudflare; tham khảo [Cloudflare về cải tiến atomic import](https://blog.cloudflare.com/building-d1-a-global-database/). Rollback được kiểm thử độc lập bằng lỗi chèn giữa batch trên schema tương ứng.

## Bước tiếp theo

Sau nghiệm thu Bước 24, đề xuất Bước 25 triển khai bộ đăng theo lịch thật cùng cơ chế đối soát kết quả, giữ lịch dừng trong lúc kiểm thử. Việc viết bước mới và đăng bài thử tiếp theo cần phê duyệt riêng.
