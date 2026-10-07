# Bước 32 — Dữ liệu, Google owner và giao diện production

Người quản lý phê duyệt Bước 32 ngày 07/10/2026. Phạm vi: schema production riêng, đăng nhập Google cho tranthanhtung37@gmail.com và giao diện xem kho/lịch/lịch sử/thông báo/kết nối. Không nhập kho, không nối Meta hoặc Telegram, không triển khai publisher và không bật lịch. Nhánh codex/step32-production-management kế thừa bootstrap Bước 31, giữ riêng khỏi main/staging.

## Thay đổi

Mười migration gồm sáu schema nghiệp vụ đã có, định danh production, caption keys, metadata R2 và biên nhận duyệt nguồn. Không có seed staging. application_state chỉ có production, paused=1. production_identity gắn D1 ID 09cdecc7-36a2-4196-950e-ef68b1ecd834, bất biến; production_control khóa enabled=0, Page ID null, connection_verified=0. Worker kiểm tra định danh/số migration/trạng thái trước đọc dữ liệu; cấu hình sai trả 503. Kho, tài liệu và lịch sử production khởi đầu trống.

Tái sử dụng luồng Google đã kiểm thử, mở origin production chỉ khi APP_ENV=production, INTEGRATION_MODE=management và DAILY_PUBLISHING_ENABLED=false. Issuer JWT và callback gắn đúng origin, khóa session riêng, chỉ email owner đã xác minh được vào. HTML/JS quản lý và API yêu cầu cookie owner; bearer giám sát không mở dữ liệu. Logout kiểm tra Origin/CSRF. CSS/font công khai; không đưa tài liệu hoặc ảnh nội dung vào assets.

Giao diện Work Sans/xanh NTTU, responsive, có sáu mục quản lý và nút làm mới/đăng xuất. Hiển thị dữ liệu production thực tế, trạng thái kho chưa nhập và các kết nối chưa xác minh. Không có nút bật/đăng/edit. Caption dùng textContent; footer/separator chung đã chốt. Xem hướng thiết kế trong 32-design-direction.md.

## Kiểm thử trước triển khai

- TypeScript và 14 kiểm thử tập trung (7 production management, 7 auth staging) đạt.
- Mười migration áp dụng lên D1/workerd cục bộ thành công; SQLite integrity/foreign keys đạt.
- Native smoke chạy bundle production và toàn bộ schema trên workerd: owner/session, ASSETS, API riêng, lịch tắt, logout CSRF, OAuth form/exchange và chặn khi unpause. Provider response giả lập, không gửi token thật hoặc bài Facebook.
- Harness ban đầu tự theo redirect OAuth; đã sửa redirect=manual và chạy lại native smoke đạt.
- Bản preview giao diện dùng fixture trống: sáu mục điều hướng đạt, desktop/mobile 390px đã kiểm tra trực quan; không tràn ngang toàn trang. Đây là kiểm tra bố cục, không phải bằng chứng Google live hoặc dữ liệu cloud.
- CI thêm native production smoke trên Ubuntu bên cạnh kiểm thử staging hiện hành.

## Cấu hình dịch vụ thật

Người quản lý xác nhận thêm callback production vào OAuth Client hiện có, giữ callback staging, và lưu GOOGLE_CLIENT_SECRET trực tiếp trong Worker production. SESSION_SIGNING_KEY production cần tạo riêng, không đọc/copy khóa staging. Client ID công khai được cấu hình theo tài khoản đã cung cấp; không lưu secret trong Git hoặc báo cáo.

Phải kiểm tra CI đầy đủ, áp dụng schema đúng D1 production, triển khai management Worker, kiểm tra dữ liệu/API riêng và Google login thật trước khi chốt toàn bộ bước. Bằng chứng riêng ở tmp/step32-*; chưa coi preview hay token mô phỏng là nghiệm thu remote. Lịch đăng staging vẫn bật trên Tập Viết; không đưa endpoint tắt staging vào bước này.

Bước tiếp theo đề xuất là nhập và đối chiếu kho production (caption/ảnh/PDF/logo/biên nhận), vẫn khóa đăng; cần phê duyệt riêng.
