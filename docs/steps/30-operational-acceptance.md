# Bước 30 — Nghiệm thu vận hành và chuẩn bị chuyển fanpage

Người quản lý phê duyệt ngày 07/10/2026. Phạm vi là nghiệm thu hệ thống trên Tập Viết (Page ID 551227411605506), sửa lỗi thông báo trạng thái, kiểm thử lỗi bằng giả lập và chuẩn bị hướng dẫn vận hành. Lịch thật vẫn bật, một bài/ngày lúc 10:00 Asia/Ho_Chi_Minh. Chưa được chuyển sang fanpage chính thức.

## Kết quả đã có

| Hạng mục | Bằng chứng | Kết quả |
|---|---|---|
| Phiên bản trước nghiệm thu | CI 37556808246; release a6e8a15269e38896845b42f6e0b09c4b335b6ca1 | 325 kiểm thử Node, 13 kiểm tra ảnh; CI Windows/Ubuntu và Worker/D1 đạt |
| Điều phối và tình huống lỗi | 84 kiểm thử thuộc daily, presence, backup, Telegram, workflow, monitor | Đạt; API bên ngoài được giả lập |
| Caption và ảnh đã duyệt | Bản xuất D1 hiện tại đối chiếu batch và dịch vụ audit | 40 caption khớp, 40 ảnh có liên kết; không sửa nội dung |
| Kho còn sử dụng | Loại bài đã đăng theo lịch và thử nội dung | 29 bài theo lịch, 9 bài dự phòng |
| Chống tái sử dụng | R01 xuất hiện trong lịch sử đã đăng | Audit báo DUPLICATE_PUBLISHED_CAPTION cho R01; đây là chặn đúng, không phải cần duyệt lại |
| Lịch đang bật | cloud_daily_config.enabled=1; paused_by_user=0; test_publish_at=null | Đúng; revision=3; không có công việc chưa rõ kết quả tại thời điểm chụp |
| Kiểm tra bài lịch sử | Lượt 08:00 ngày 07/10 | Ba bài đọc được; chỉ ghi nhận quan sát |
| Thông báo | Outbox tại thời điểm chụp | 5 thông báo delivered; không có sự cố monitor đang mở |
| Nguồn kích hoạt độc lập | cron-job.org tự kích hoạt lúc 08:37, 08:38, 08:39 | Ba workflow thành công; độ trễ ghi nhận 13, 71, 69 giây |
| Giám sát chính | MONITOR_EXTERNAL_PRIMARY=true; chủ tài khoản xác nhận trả lịch về 30 phút | Đã cấu hình; chưa nghiệm thu đủ chu kỳ 30 phút |
| Phục hồi hiện trạng | Gói phục hồi cục bộ và CLI restore cô lập | 40 bài, 80 phiên bản, 59 tài nguyên, 40 biên nhận duyệt; 65 file được kiểm SHA-256 |

Bằng chứng riêng tư nằm trong tmp/step30; không đưa SQL, PDF, logo, ZIP hoặc token vào GitHub. Bản xuất SQL giữ nguyên dữ liệu cloud. Gói phục hồi dùng bản sao với trạng thái dừng; dữ liệu thật không bị thay đổi. 58 tài nguyên dùng bytes lưu trước đã đối chiếu SHA-256 với metadata hiện tại; một tài nguyên thiếu được đọc từ R2. Đây không phải một lần đọc mới toàn bộ R2. Khôi phục giữ lịch sử đăng hằng ngày, mặc định tắt đăng và cách ly nội dung. Lịch sử thử nội dung/kỹ thuật và điều khiển vận hành còn được giữ riêng trong SQL gốc; định dạng backup nghiệp vụ hiện có không khôi phục các bảng thử/điều khiển đó.

## Lỗi tìm thấy và sửa

Trang chưa đăng nhập ghi cố định “Lịch đăng Facebook đang dừng” dù lịch thật đang bật. Thay bằng “Đăng nhập để xem trạng thái lịch đăng Facebook.” Không đọc/truyền trạng thái riêng tư cho khách chưa đăng nhập.

Guard triển khai chỉ cho phép đúng thay đổi chuỗi HTML này trong worker. Bất kỳ thay đổi logic worker, lịch, schema hoặc backend khác vẫn bị chặn khi lịch bật. Hai kiểm thử hồi quy kiểm tra lời nhắc trong cả hai cấu hình gate và giới hạn của guard. Nhóm auth/deployment có 27 kiểm thử đạt trước push; kiểm tra đầy đủ tiếp tục chạy qua pre-push và CI.

## Điều kiện còn chờ nghiệm thu thật

- Hai lượt cron-job.org theo lịch 30 phút: kiểm tra nguồn, thời điểm yêu cầu, thời điểm bắt đầu, kết quả và checkpoint. Không dùng TEST RUN thay cho lượt theo lịch.
- Lượt đăng 10:00 ngày 07/10: một publication đúng ngày Việt Nam, snapshot khớp caption/ảnh đã duyệt, Telegram delivered, lịch sử và giao diện thống nhất. Không tạo thêm bài thử để thỏa điều kiện này.
- Giao diện sau đăng nhập Google: kho, lịch, lịch sử, thông báo, ảnh và footer; phiên đã hết hạn, cần người quản lý đăng nhập lại.
- Lỗi lời nhắc được triển khai và kiểm tra trực tiếp trên trang đăng nhập; lịch vẫn bật sau triển khai.
- Lưu bản phục hồi hiện tại ở nơi riêng tư độc lập với máy tính. Gói cục bộ giúp phục hồi nhưng chưa đủ chống mất máy; chưa cấu hình sao lưu định kỳ/retention.

Không đánh dấu Bước 30 đạt toàn bộ khi các điều kiện này còn chờ. Ba lượt thử một phút chỉ chứng minh nguồn tự kích hoạt, không chứng minh vận hành ổn định dài hạn hoặc SLA 30 phút.

## Trước khi chuyển fanpage chính thức

1. Chốt nghiệm thu thật và phê duyệt riêng việc chuyển Page.
2. Hiện adapter/gate vẫn giới hạn Tập Viết bằng TRIAL_PAGE. Cần bước phát triển riêng cho cấu hình production; không chỉ thay Page ID/secret trong staging.
3. Xác minh Page chính thức, token/quyền ứng dụng Meta và thời hạn bằng kết nối thật; không suy ra đủ quyền từ fanpage thử.
4. Tách môi trường, tài nguyên và lịch sử production; nhập các phiên bản đã được phép dùng, loại nội dung đã dùng theo chính sách thống nhất với người quản lý.
5. Đối chiếu image/footer/nguồn khóa 2026, chương trình 3,5 năm và thông tin liên hệ. Việc chuyển môi trường không cấp quyền sửa nội dung đã duyệt.
6. Giữ lịch production mặc định tắt, kiểm tra read-only; chỉ bật sau phê duyệt ngày bắt đầu và việc đăng lên Page chính thức.
7. Kiểm tra giám sát, thông báo, phục hồi và bản sao độc lập cho môi trường mới.

Hướng dẫn thao tác hằng ngày và xử lý sự cố: [docs/operations.md](../operations.md).
