# Bước 20: xác minh kết nối fanpage thử

Phạm vi được phê duyệt: kết nối Trang thử và kiểm tra quyền bằng Graph API.
Không đăng bài, không bật lịch, không gọi Gemini và không chuyển sang fanpage chính.

## Cấu hình và giao diện

Worker staging nhận META_APP_SECRET và META_PAGE_ACCESS_TOKEN bằng Secret;
META_APP_ID, META_PAGE_ID, META_API_VERSION và META_CONNECTION_PURPOSE=test bằng Text.
Không nhập token qua giao diện hoặc lưu vào repository, localStorage, lịch sử hay backup.
Phiên bản Graph phải cấu hình rõ ràng; không tự đoán phiên bản mới nhất.

Trong tab Lịch đăng, phần Kết nối fanpage thử hiển thị cấu hình công khai và nút
kiểm tra. Chỉ phiên Google owner được đọc/gọi; POST cần Origin và CSRF hợp lệ.
Worker gọi GET debug_token bằng thông tin ứng dụng, rồi GET me bằng Page token
và appsecret_proof HMAC-SHA256. Chỉ hai endpoint Graph cố định, không theo redirect.
Timeout 10 giây/lượt gọi, giới hạn phản hồi 32 KiB. Không trả lỗi nguyên văn của Meta.

Kiểm tra token loại PAGE, đúng ứng dụng, chưa hết hạn, có pages_read_engagement
và pages_manage_posts, granular scope phù hợp nếu có, và đúng Page ID cấu hình.
pages_show_list dùng khi người quản lý lấy Page token qua Graph API Explorer.
Receipt chỉ lưu mã kết quả, thông tin Trang/quyền/thời hạn và fingerprint cấu hình.
Đổi cấu hình hoặc sau 10 phút thì kết quả không còn được coi là xác minh hiện tại.
UUID lặp lại dùng receipt cũ; kiểm tra mới cần UUID mới. Lượt GET đồng thời có thể
lặp, nhưng chỉ lưu một receipt cho cùng request. Không cam kết đúng một lần gọi mạng.

Migration 0014_meta.sql là bảng vận hành riêng, bất biến. Không đưa receipt hay
fingerprint vào backup nội dung; business schema v12 giữ tương thích khôi phục.
Kết quả xác minh chỉ chứng minh kết nối đọc và scope được cấp, không chứng minh
đã đăng thành công. publishingEnabled=false và lịch vẫn dừng ở mọi kết quả.

## Kiểm thử và nghiệm thu

10 kiểm thử Meta đạt: sai app/loại token/Trang/quyền, hết hạn, provider lỗi,
redirect, dữ liệu không hợp lệ, chống lộ secret, receipt/idempotency, auth/CSRF
và loại dữ liệu vận hành khỏi backup. HMAC được đối chiếu độc lập với Node crypto.
24 kiểm tra giao diện cloud đạt, có desktop/mobile và vô hiệu hóa xác minh khi
token cấu hình thay đổi. Bằng chứng riêng: tmp/step-20/browser-results.json.

Runtime Workers/D1/R2 và native fetch đã đạt sau bổ sung appsecret_proof.
Pre-push đạt 247 Node/SQLite/HTTP tests, 9 kiểm tra ảnh và TypeScript/repository
guard. Release dde79e2b7d83890bb8c1a24fe23c5f11fcf1d6cb qua CI Windows/Ubuntu
và deploy staging thành công, Actions run 37410103574.

Nghiệm thu remote giữ nguyên 40 đề cương, 21 tài nguyên và checksum 13 PDF;
44 đường dẫn private trả 401 cho ẩn danh, health bearer không đọc được owner
routes. Migration 14 có trên D1, không có bảng fixture, 0 publications/jobs,
lịch dừng và publish endpoint vẫn 501. Bằng chứng: tmp/step-20/remote-evidence.json.

Kiểm tra Graph thật ngày 06/10/2026 ban đầu chặn META_PAGE_MISMATCH đúng thiết kế.
Người quản lý đối chiếu GET me?fields=id,name và xác nhận Page ID thực của Trang
Tập Viết là 551227411605506, rồi tự sửa biến Text trong Cloudflare. Kiểm tra lại
lúc 10:46 giờ Việt Nam thành công: token loại PAGE thuộc App 1125636386458970,
đúng Trang, có pages_read_engagement/pages_manage_posts. Không đăng bài.
Token có hạn đến 12:00 ngày 06/10/2026 giờ Việt Nam, quyền dữ liệu có hạn đến
10:27:17 ngày 04/01/2027. Cần cấu hình token phù hợp vận hành trước thử đăng/lịch.
Bằng chứng riêng: tmp/step-20/staging-meta-verified.png; screenshot không chứa token.
Bước 20 đạt phạm vi kết nối đọc và kiểm tra quyền, chưa chứng minh đăng thành công.

Người quản lý xác nhận Trang thử Tập Viết, ID 551227411605506, đã tạo ứng dụng
Meta và lưu hai Secret/bốn biến Text trực tiếp vào Worker. Chưa lưu credentials
Meta vào GitHub. Việc kiểm tra thật chỉ thực hiện từ phiên owner trên staging.
Không bắt đầu Bước 21 khi chưa có phê duyệt riêng.
