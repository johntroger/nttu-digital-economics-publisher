# Bước 18 — Telegram và hàng chờ thông báo

Phê duyệt 06/10/2026: người quản lý chọn kết nối Telegram và hàng chờ.
Đã triển khai nền trên staging; đang chờ hoàn tất cấu hình để nghiệm thu gửi thật.
Facebook vẫn dừng.

Tab Cảnh báo có trạng thái, tin kiểm thử, lấy mã chat từ /start và thử lại
sau khi sửa kết nối. Giữ palette campus #07559D/#F2F6FA/#253347/#FFFFFF,
Segoe UI/Bahnschrift, bố cục một cột trên mobile, trạng thái bằng chữ.
Token không nhập trên form; TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID lưu Secret
Worker, biến TELEGRAM_ENABLED=true bật gửi. Chỉ hỗ trợ chat cá nhân có ID dương.
Không cho nhập người nhận hoặc nội dung tin tùy ý từ trình duyệt.

Migration 13 tạo transport runtime và nhật ký attempt. D1 batch conditional
claim giữ một request đang bay; lưu intent trước sendMessage và receipt khi
Telegram trả message_id hợp lệ, chat khớp. Tries và event_id bền vững, sự kiện
test dùng UUID idempotent. Cron mỗi 5 phút gửi tối đa một tin; nút kiểm thử thử
xử lý hàng chờ ngay, không đảm bảo tin vừa thêm đứng đầu. Trần backoff một giờ,
429 đợi retry_after (tối đa một ngày). 400/401/403/404 có phản hồi lỗi hợp lệ
chuyển needs_action; timeout/redirect/phản hồi không đủ/5xx là delivery_unknown.
Intent mất tiến trình có thời hạn 60 giây, sau đó chờ thêm 5 phút trước thử mới.
Có thể lặp thông báo cùng event_id sau mất phản hồi; không cam kết exactly-once.
Delivered nghĩa API tiếp nhận, không chứng minh người nhận đã đọc.

Mỗi event pin fingerprint đích từ lần thử đầu. Đổi bot/chat không tự chuyển tin
cũ sang người nhận mới; needs_action. Sửa lỗi cùng đích có thể yêu cầu thử lại.
Không lưu token, URL API có token, exception hay description của Telegram vào
DB/response/log. Fetch endpoint cố định, redirect manual, timeout 10s và giới
hạn response 32 KiB; plain text, không parse_mode. Mọi mutation owner/Origin/CSRF.
Health bearer không có quyền đọc/gửi Telegram. getUpdates limit10, không offset,
chỉ trả ID chat cá nhân gửi /start, không trả tên/nội dung các tin khác.

Sao lưu nội dung vẫn gồm notification_outbox, loại hai bảng transport khỏi gói
để giữ schema nội dung v12 và gói Bước 17 tương thích. Khôi phục cách ly mọi tin
chưa delivered, không khôi phục token hoặc quyền gửi. Migration mới không đổi
schema_migrations sáu migration gốc. Nguồn chuẩn/ảnh/bản sao hiện có giữ nguyên.

Kiểm thử: 9 Telegram tests đạt (claim đồng thời, idempotent, timeout/crash,
cooldown/rate limit, permanent failure, đổi đích, auth/CSRF, không lộ token),
9 backup regression đạt; 21 GUI checks desktop/mobile đạt; D1/R2/workerd local
13 migrations đạt, Telegram transport giả lập. Chưa đủ chứng minh bot thật.
Chưa nối publication/stock/sự cố từ cloud publisher chưa xây; chỉ nền hàng chờ
và template. Chưa có monitor bên ngoài Cloudflare. Không triển khai Bước 19.

Nguồn chính thức:
- https://core.telegram.org/bots/tutorial
- https://core.telegram.org/bots/api#sendmessage
- https://core.telegram.org/bots/api#getupdates
- https://core.telegram.org/bots/faq

## Nghiệm thu nền đã đạt

220/220 Node tests, 21/21 GUI checks và 9/9 kiểm tra ảnh đạt. CI Windows/Ubuntu
và native Workers Telegram fetch đạt. Đã khôi phục lại ZIP thật Bước 17 bằng
mã mới, đủ 40 bài/40 phiên bản/21 tài nguyên, integrity/foreign keys đạt.
Staging release ae08c3f2ae896bb7c9a029020256f7bc1e3b7920 qua GitHub Actions;
13 migrations, 40 private paths không đăng nhập trả 401, health bearer không
được đọc Telegram. Dữ liệu gốc giữ nguyên checksum, lịch dừng, publish 501.
Đã gọi getUpdates thật qua phiên Google owner và nhận mã chat cá nhân /start.
Token không đọc/đưa vào chat hoặc Git. Chờ người quản lý lưu TELEGRAM_CHAT_ID,
TELEGRAM_ENABLED=true và kiểm tra tin thật; chưa có receipt gửi thật.
Bằng chứng riêng: tmp/step-18/browser-results.json, telegram-desktop.png,
telegram-mobile.png, remote-evidence.json. Không coi thử giả lập là live pass.
