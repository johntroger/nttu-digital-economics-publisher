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

Runtime cloud đang được kiểm thử lại sau bổ sung appsecret_proof trước triển khai.
CI/pre-push và nghiệm thu Graph thật được ghi nhận sau khi thực hiện; kiểm thử
giả không thay thế xác minh Meta thật. Chưa nghiệm thu hoàn tất Bước 20.

Người quản lý xác nhận Trang thử Tập Viết, ID 100071169616416, đã tạo ứng dụng
Meta và lưu hai Secret/bốn biến Text trực tiếp vào Worker. Chưa lưu credentials
Meta vào GitHub. Việc kiểm tra thật chỉ thực hiện từ phiên owner trên staging.
Không bắt đầu Bước 21 khi chưa có phê duyệt riêng.
