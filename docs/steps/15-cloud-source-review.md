# Bước 15 — Đối chiếu nguồn và rà soát trên cloud

Người dùng cho phép triển khai bước tiếp theo ngày 05/10/2026. Đang thực hiện.

Phạm vi: registry metadata của 13 PDF đã nhập và xác nhận OWNER-2026 (khóa 2026,
3,5 năm); chọn tài liệu/trang/mục/nhận định/cách áp dụng khi lưu caption; mở PDF
private đúng trang; kiểm tra bài/toàn kho và ghi nhận năm mục rà soát bằng Google owner.
Không tự đọc hiểu để gán căn cứ, không tự phê duyệt nhận định, không bật ready/Meta/lịch.

Registry chỉ chứa ID, tên, số trang và checksum đã kiểm ở local; không chứa PDF hoặc
nội dung tài liệu. Tài liệu trong R2 phải đúng registry và checksum; upload cùng mã nguồn
nhưng bytes khác không được dùng thay tài liệu chuẩn. Mỗi version giữ nguồn riêng.
Sửa/xóa căn cứ, caption hoặc khôi phục tạo bản mới và cần chọn ảnh/rà soát lại.

Giữ thiết kế campus của các bước trước: xanh #07559D, nền #F2F6FA, chữ #253347,
nhãn #8B751D, form trắng #FFFFFF. Segoe UI cho form và Bahnschrift cho tiêu đề.
Trong editor, form căn cứ và kết quả kiểm tra đặt ngay dưới caption; review sát ảnh.
Thông tin căn cứ xếp dọc, căn trái; mobile một cột. Kho có nút Kiểm tra toàn kho.
Giữ bố cục đã dùng để công việc học thuật dễ đối chiếu; không thêm trang dashboard trang trí.

Kiểm tra cấu trúc không chứng minh nguồn hỗ trợ nhận định. Rà soát phải đọc nguồn,
kiểm nội dung và xem ảnh. Chặn đề cương, thiếu căn cứ/ghi chú/ảnh, sai trang, file thay đổi,
ảnh sai phiên bản, nguồn blocked và caption trùng nguyên văn kho hoặc lịch sử.
Bài giới thiệu ngành cần PDF CTĐT + OWNER-2026. Mỗi bài cần ít nhất một PDF chuẩn.

Review cloud là receipt riêng bất biến, gắn version/check/ảnh/footer/checksum nguồn,
người rà soát và thời điểm; retry dùng request ID, kiểm CAS trong D1 batch. Không ghi
content_checks/ready của publisher khi chưa hoàn thành luồng xuất bản cloud.
Audit kiểm bytes R2 lại; nguồn/ảnh hỏng khiến receipt cũ không còn hiện hành.

Kiểm thử yêu cầu: giới hạn trang, thiếu/sai checksum, nguồn riêng mỗi version,
review idempotent/CAS, nguồn và ảnh hỏng sau review, duplicate lịch sử, auth/CSRF,
D1/R2 runtime, giao diện desktop/mobile; CI Windows/Ubuntu và staging health/private.
Không nhập nội dung fixture hoặc review thử vào database thật.

Audit toàn kho preload nguồn/ảnh/binding/receipt thay vì query cho từng bài, kiểm thử
giới hạn <=12 query cho 40 bài. Cache trong lượt chỉ giữ kết quả checksum, không giữ
bytes của mọi ảnh/PDF. Không cache toàn vẹn qua các request.
Cloudflare Free hiện giới hạn 50 D1 query/invocation; nguồn:
https://developers.cloudflare.com/d1/platform/limits/ (kiểm tra 05/10/2026).

Kiểm thử trước deploy: TypeScript và 195 Node/SQLite/HTTP tests đạt. Lượt sandbox
đầu bị chặn HTTP loopback (EACCES); chạy lại với quyền loopback đạt toàn bộ, không
đổi mã ứng dụng vì lỗi sandbox. Workers bundle chạy 11 migration, D1/R2 review CAS,
nguồn/ảnh, OAuth regression đạt. 13 ca Chrome GUI đạt; đã xem form căn cứ mobile
và panel review desktop. Sau bổ sung race source/image block có 196 tests.
Viewer PDF đã kiểm bằng Chrome headed với profile fixture, cửa sổ ngoài màn hình:
mở trang 1, số trang bằng registry (13), HTTP owner 200, anonymous 401. Đã xem
screenshot nguồn/rà soát; renderer native dùng extension frame, không phải embed
trong main DOM. Playwright headless không hỗ trợ PDF navigation theo tài liệu:
https://playwright.dev/docs/api/class-page. Inline chỉ dành PDF chuẩn checksum-pinned;
library download vẫn attachment/sandbox, auth + no-store + nosniff giữ nguyên.
Deployment đang thực hiện.

Rà soát đồng thời: một receipt/version/check, mọi request ID đều có mapping fingerprint
bất biến đến receipt. Dùng lại request ID với payload khác bị từ chối, kể cả request
thứ hai trong cuộc đua. Nguồn xác nhận/chữ và metadata PDF có revision riêng; API
không cho client ghi đè registry. Dependency registry fixture chỉ tồn tại trong hàm
test/service, không được lấy từ HTTP hoặc biến môi trường.

Nguồn hoặc ảnh bị blocked sau audit cũng được kiểm lại trong SQL batch; không tạo
receipt và không ghi đè blocked. Một lượt recheck giải quyết trường hợp receipt mới
commit giữa hai query audit. Receipt chỉ hiện hành khi nguồn vẫn verified. Caption
lịch sử được tách phần footer bằng delimiter cuối trước khi so trùng, giữ hiệu lực
ngay cả khi hotline/footer cũ khác bản hiện tại. Form bị khóa khi đang mở phiên bản
để thao tác nhanh không bị mất phần nhập trong lúc API chưa trả dữ liệu.
