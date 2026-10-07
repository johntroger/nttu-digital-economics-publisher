# Bước 36 — Chuẩn bị publisher production và kiểm thử giả lập

Trạng thái: người quản lý đã phê duyệt Bước 36 theo phạm vi dưới đây. Đã hoàn thành phạm vi chuẩn bị, kiểm thử và triển khai xem trước; chưa cấp quyền đăng thật. Báo cáo nghiệm thu nằm trong `36-production-publisher.md`.

## Điều kiện hiện tại

Ngày 07/10/2026 lúc 17:56 giờ Việt Nam, production HTTP có 318 heartbeat, lượt cuối hoàn tất, state=idle; tin kiểm thử Telegram delivered, tries=1, message ID 12. Lượt monitor do cron-job.org kích hoạt gần nhất lúc 17:30 thành công, checkpoint không có incident. Worker runtime ad94c090d5781e26afae57b171c2e56188e5ef10; CI commit tài liệu e7562af3a44779ebb3025706c2f8267bd7703cae cũng đạt.

Production vẫn management, paused và enabled=0. Kho 40 bài/56 assets giữ nguyên. Page chính thức đã xác minh là 817593604765443. Lịch đích 10:00 Asia/Ho_Chi_Minh, một bài tự động/ngày. Xác nhận người quản lý nhìn thấy tin PRODUCTION vẫn chưa được cung cấp trực tiếp.

Mã daily hiện tại giới hạn staging/Tập Viết và có nhiều guard SQL theo environment='staging'. production_control có CHECK(enabled=0), CHECK(connection_verified=0); productionState yêu cầu paused, page_id NULL. Vì vậy đổi Page ID hoặc bật biến môi trường không đủ và không phải quy trình chuyển production.

## Phạm vi được đề xuất

1. Thiết kế adapter môi trường cho luồng đăng: staging chỉ nhận Page 551227411605506; production chỉ nhận Page 817593604765443 và đúng database/bucket. Xác minh lại các guard sau khi tách logic để không làm rộng quyền staging.
2. Xây bộ xử lý production với các cửa kiểm soát riêng, mặc định khóa. Provider là dependency rõ ràng trong kiểm thử; giả lập không được rơi về fetch thật khi thiếu provider. Runtime management chưa gọi bộ gửi Facebook.
3. Đối chiếu đủ 40 bài với biên nhận duyệt theo phiên bản, caption/footer/nguồn/checksum ảnh. Chuẩn bị lịch 30 bài chính và 10 dự phòng dưới dạng bản xem trước; không tiêu kho, tạo publication hoặc lập lịch gửi thật trên production.
4. Kiểm thử D1/workerd cô lập cho claim, intent, evidence, finalization, lease và quyền môi trường. Nếu cần schema mới, mặc định khóa và có kiểm thử migration trên bản sao trước; không gỡ CHECK khóa hiện tại trên cloud trong bước này.
5. Thiết kế cách gọi publisher từ HTTP tick: ngân sách mỗi lượt, tách phần gửi và giao thông báo, retry ở lượt sau, heartbeat riêng; không để hai nguồn nhận cùng việc. Mốc 10:00 dùng giờ server theo Việt Nam, không dùng giờ/body do cron-job.org gửi.
6. Giữ nguồn HTTP production đang chạy Telegram, giám sát 30 phút và staging đang bật. Chỉ triển khai phần xem trước/kiểm tra nếu cần và khi kiểm thử/CI đạt; không thêm route có thể gọi POST Meta thật.

## Bộ kiểm thử bắt buộc

- Token kích hoạt không có quyền owner; sai environment/Page/database/bucket hoặc chưa có các cửa phê duyệt thì không có request Meta gửi bài.
- Bài/ảnh/nguồn/footer bị đổi sau duyệt không được chọn. Snapshot phải bất biến sau claim.
- Hai tick đồng thời hoặc gửi lặp chỉ một job được nhận; slot/Page/ngày và gate không cho đăng bài thứ hai khi đã có publication hoặc kết quả chưa rõ.
- Lỗi được xác nhận có thể thử lại: tối đa ba lần, cách năm phút; bài dự phòng chỉ sau khi kết quả bài trước đã rõ.
- Provider đã nhận rồi mất phản hồi, 5xx/timeout hoặc crash sau intent: giữ trạng thái chưa rõ, không POST lại; cần đối soát.
- Crash sau evidence thành công hoặc rollback finalizer: phục hồi từ evidence mà không gọi gửi lại.
- Tin đăng thủ công của người quản lý không tự gán vào job, tiêu slot hoặc thay snapshot.
- Kho hết/nguồn quá hạn/kết nối bị thu hồi: dừng đúng phạm vi và tạo cảnh báo.
- Native workerd/D1 chạy với provider giả lập và đếm request; không có outbound đến Meta thật trong kiểm thử giả lập. Kiểm tra ngân sách truy vấn và timeout phù hợp cấu hình cloud hiện dùng.
- Toàn bộ kiểm thử regression staging, TypeScript, kiểm tra ảnh và CI Ubuntu/Windows đạt trước triển khai phần được phép.

## Sản phẩm nghiệm thu

Mã trên nhánh riêng Bước 36 và draft PR; báo cáo kiểm thử có số outbound và trạng thái D1 trước/sau; bản xem trước lịch/caption/ảnh và bảng các cửa kiểm soát production. Phân biệt PASS giả lập với NOT_RUN đăng thật. Không cam kết exactly-once cho API bên ngoài khi phản hồi bị mất.

Bước sau cần phê duyệt riêng cho mở khả năng gửi và một bài chạy thử theo lịch gần nhất trên fanpage chính thức, chỉ rõ bài và giờ gửi. Sau khi bài thử được xác minh, lịch thường là 10:00; không chờ tới 10:00 để kiểm thử. Phê duyệt Bước 36 không thay thế phê duyệt đăng thật hoặc bật lịch chính thức.
