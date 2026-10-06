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

Người quản lý đã gia hạn token qua Access Token Debugger
và cập nhật Secret trực tiếp trên Cloudflare. Kiểm tra Graph thật lúc 11:13:52 ngày
06/10/2026 giờ Việt Nam đạt: PAGE token đúng App 1125636386458970 và Trang Tập Viết
551227411605506, đủ pages_read_engagement/pages_manage_posts. Token hết hạn
10:27:17 ngày 05/12/2026; quyền dữ liệu hết hạn 10:27:17 ngày 04/01/2027 (giờ Việt Nam).
Bản xem trước đã chuẩn bị và người quản lý đã phê duyệt đăng ngay đúng một bài này.
Bằng chứng riêng: tmp/step-21/staging-token-renewed.png. Không đọc/lưu token trong chat.
Pre-push đạt 256 Node/SQLite/HTTP tests, 9 kiểm tra ảnh, TypeScript và repository
guard. Release b8e5727e594a2b0cf3f6bd657397831f3e288668 qua CI Windows/Ubuntu,
native trial trên Ubuntu và deploy thành công, Actions run 37412035994.
Nghiệm thu staging ngày 06/10/2026: migration 15, 49 đường dẫn private trả 401,
40 đề cương, checksum 13 PDF/21 tài nguyên gốc giữ nguyên, 0 publications/jobs,
lịch vẫn dừng. Tại phiên owner, đã dựng/lưu PNG và snapshot bài thử request
e6de2e57-0f09-41c6-94ce-4143cb065db8.
Bằng chứng riêng: tmp/step-21/remote-evidence.json và staging-trial-preview.png.
Bước 21 đã nghiệm thu đăng thật ngày 06/10/2026 sau phê duyệt cụ thể. POST ảnh
thành công, GET đọc lại xác nhận caption/UUID/footer và thời gian; state=published.
Post ID 551227411605506_1139280348454275, photo ID 1139280325120944; ảnh checksum
a31f8d9e736260693de4f4cd1de7c79b81722f2ef00aa8e8b757916312a17a79.
Receipt singleton giữ nút gửi lại bị khóa. Tab Lịch sử hiển thị bài và liên kết
Facebook; Telegram đã tiếp nhận tin thành công lần 1, message_id=5, state=delivered.
Không xác nhận người quản lý đã đọc tin. Kho 40 đề cương không bị tiêu, 0 daily
publications/jobs, application_state.paused_by_user=1. Không bật lịch hằng ngày.
Bằng chứng riêng: tmp/step-21/publication-evidence.json và staging-trial-published.png.
Bước 21 hoàn tất phạm vi token và đăng thử một bài; chưa nghiệm thu vận hành tự động.
Không bắt đầu Bước 22 khi chưa có phê duyệt riêng.
