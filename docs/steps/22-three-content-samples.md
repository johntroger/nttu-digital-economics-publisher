# Bước 22 — Gói duyệt ba bài mẫu

Phê duyệt của người quản lý: bắt đầu Bước 22 bằng ba bài mẫu. Phạm vi là
hoàn thiện và trình duyệt caption, căn cứ, ảnh; chưa mở rộng thành 40 bài hoàn chỉnh.

Chọn P02 (kiểm chứng kết quả AI), P04 (CV có sản phẩm minh chứng), P05 (giới thiệu
ngành khóa 2026) từ bộ nháp Bước 7. Dùng lại nội dung có căn cứ và bộ dựng ảnh;
không tạo bài trùng mới chỉ để có thêm ID. Định hướng thiết kế kế thừa
`07-design-philosophy.md`: ảnh vuông, chữ rõ, logo chuẩn trong dải trắng, màu theo chủ đề.

Đã đọc trực tiếp CAREER-08 trang PDF 13/15, CAREER-09 trang PDF 13, BM03 trang
PDF 8, BM11 trang PDF 1/2. BM11 còn ghi khóa 2025/04 năm: ghi nguồn OWNER-2026
riêng cho đính chính 3,5 năm; không sửa PDF hoặc gán xác nhận cho thông tin cũ.
Không tái sử dụng các khẳng định lương, dự báo hay cam kết việc làm từ cẩm nang.

Dựng lại PNG từ logo gốc để khắc phục hai tài sản ảnh cũ thiếu dải logo.
Caption qua composeCaption: footer, TikTok, hashtag và đường phân cách đúng một lần.
`scripts/build-sample-review.mjs` kiểm tra checksum nguồn/caption/ảnh/renderer,
ba logo, trạng thái pending và nội dung khác nhau trước khi tạo gói duyệt.
Gói này chỉ kiểm tra trùng giữa ba mẫu, chưa xác nhận đối chiếu toàn bộ lịch sử cloud.

Lệnh: `npm run samples`, `node scripts/build-sample-review.mjs`,
`npm run test:images`. HTML tự chứa ảnh ở `assets/samples/step22/review.html`;
caption/căn cứ ở `content/samples/step22-review.md`. HTML và ảnh không đưa lên GitHub.

Không ghi dữ liệu cloud, thay đổi xét duyệt, gọi Gemini, gửi Telegram hoặc đăng Facebook.
Lịch cloud giữ nguyên trạng thái dừng. Ba mẫu chờ người quản lý duyệt trước bước kế tiếp.

Nghiệm thu local ngày 06/10/2026: TypeScript đạt; 256 Node/SQLite/HTTP tests đạt;
9 kiểm tra Pillow đạt (kích thước, vị trí/tỷ lệ logo, tương phản, dấu tiếng Việt,
tràn chữ và tái lập pixel). Bộ HTTP cần chạy ngoài sandbox vì loopback bị EACCES;
kiểm tra ảnh dùng thư mục tạm trong workspace. Không có thay đổi ứng dụng cloud.
Trình duyệt kiểm thử chặn giao thức file://, nên chưa nghiệm thu bố cục HTML trên
trình duyệt; cung cấp Markdown caption/căn cứ và PNG trực tiếp để người quản lý duyệt.
