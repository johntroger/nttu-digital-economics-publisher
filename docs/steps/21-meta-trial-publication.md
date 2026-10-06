# Bước 21: thời hạn token và đăng thử một bài

Phê duyệt: xử lý thời hạn token và xây dựng luồng đăng thử một bài trên Tập Viết.
Chưa bật lịch tự động, chưa chuyển fanpage chính và chưa dùng Gemini.

## Thiết kế

Giao diện Lịch đăng dựng ảnh PNG 1080×1080 bằng renderer/font/logo chuẩn hiện có,
lưu vào thư viện riêng tư và tạo snapshot caption/footer/checksum. Bài kỹ thuật
có mã kiểm thử UUID riêng, không tiêu bài trong kho 40 đề cương. Hiển thị đầy đủ
caption và ảnh; nút gửi yêu cầu người quản lý xác nhận xem trước. Chỉ Google owner,
Origin/CSRF hợp lệ mới được chuẩn bị/gửi/đối chiếu. Không nhập token trong GUI.

Đích gửi cố định Page ID 551227411605506; purpose=test, staging/lịch dừng và không
bảo trì. Không nhận URL đích, caption hay ảnh tùy ý trong lệnh gửi. Snapshot bất biến.
Token được kiểm tra lại bằng debug_token/me trước gửi; phải đúng app/Trang, đủ scope,
và token/quyền dữ liệu không hết hạn trong 24 giờ tiếp theo. Giá trị expires=0
chỉ nghĩa Meta không công bố hạn cố định; không cam kết token vĩnh viễn.

Migration 0015_meta_trial.sql là singleton vận hành, tối đa một bài thử trong kho.
UPDATE có điều kiện nhận quyền gửi, ghi intent trước network. POST ảnh multipart
đến /PAGE/photos bằng Page bearer và appsecret_proof; không mở public R2 URL.
Timeout 15 giây, giới hạn JSON 32 KiB, chặn redirect. GET đọc lại post ID đúng
Trang, caption UUID/footer và thời gian trước khi ghi published/outbox nguyên tử.
Nếu thiếu receipt, mất phản hồi, lỗi đọc lại hoặc lỗi lưu DB: giữ intent/unknown,
không POST lại và không thử bài khác. Lỗi Meta xác định giữ rejected, không tự retry.
Đối chiếu chỉ GET theo ID bài ghim đúng Trang, không có thao tác gửi hoặc xóa.

Lịch sử thử hiển thị riêng trong tab Lịch sử; không tạo readiness, publish_jobs,
daily usage hoặc publications của kho nội dung. Các receipt thử không nằm trong
backup business schema v12, cùng các bảng vận hành Meta/Telegram. Khôi phục vẫn
cách ly, không khôi phục secrets/quyền gửi. Cần giữ D1 gốc để bảo toàn receipt thử;
không chuyển bản khôi phục sang cùng đích Facebook để tự thử lại bài chưa đối chiếu.

Cron heartbeat đọc receipt Meta hiện tại, cảnh báo Telegram khi thời hạn token
hoặc quyền dữ liệu còn không quá ba ngày; deduplicate theo Page ID/thời hạn.
Đổi cấu hình vô hiệu receipt cũ. Không tự tạo token hay tự gia hạn; người quản lý
gia hạn/lấy Page token qua công cụ Meta rồi lưu Secret trực tiếp vào Cloudflare.
Không lưu user token vào repository và không tạo credential thường trực qua GUI.

## Kiểm thử và tình trạng

9 kiểm thử luồng thử, 10 kiểm thử Meta và 9 backup đạt. Bao gồm send đồng thời,
timeout, crash sau intent, readback sai caption, giữ rejected, chặn Page khác,
token ngắn hạn, ảnh hỏng, bảo trì, replay và cảnh báo thời hạn không lặp.
26 kiểm tra GUI cloud đạt trên desktop/mobile. Ảnh ba logo đã xem trực tiếp.
D1/R2 local và native workerd multipart POST/readback/receipt đạt bằng transport
Meta giả lập nội bộ, không có bài hoặc tin Telegram thật từ test harness.
Bằng chứng riêng: tmp/meta-trial-unit-step21.log, cloud-runtime-step21.log,
meta-trial-native-final-step21.log và tmp/step-21/browser-results.json.

Chưa nghiệm thu đăng thật. Token hiện tại hết hạn 12:00 ngày 06/10/2026 giờ Việt Nam;
đang hướng dẫn người quản lý dùng Access Token Debugger. Cần cấu hình token phù hợp,
xác minh lại, dựng bản xem trước staging và phê duyệt bài cụ thể trước gửi Facebook.
CI/pre-push/deploy và nghiệm thu remote sẽ cập nhật sau thực hiện. Không bắt đầu
Bước 22 khi chưa có phê duyệt riêng.
