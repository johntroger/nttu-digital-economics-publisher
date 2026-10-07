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

SESSION_SIGNING_KEY đã tạo riêng và lưu trực tiếp vào Worker, không lưu nội dung khóa trong Git. Bằng chứng riêng ở tmp/step32-*; không dùng preview hay token mô phỏng làm nghiệm thu remote.

## Nghiệm thu triển khai thật — 07/10/2026

- Code release 9db340f33e5ff74965d554e950af9fe2821cf030, Worker version 16cfbc36-0e3c-4ed6-9a64-ef95318f64f9. CI 37563242898 đạt trên Windows/Ubuntu, 338 kiểm thử và 13 kiểm tra ảnh; native production smoke đạt.
- Mười migration áp dụng lên đúng D1 production. Truy vấn remote chỉ đọc xác nhận posts/library/publications/page_connections đều bằng 0, chỉ có application_state production paused=1, control enabled=0 và Page ID null; foreign_key_check không có lỗi.
- Health remote xác nhận databaseChecked/loginConfigured true, publisher/scheduler false. Sáu đường dẫn riêng từ chối cả khách và bearer giả bằng 401 (12 kiểm tra). OAuth redirect dùng đúng callback production.
- Google login thật vào đúng tài khoản tranthanhtung37@gmail.com, tải dữ liệu cloud thành công. Sáu mục giao diện và làm mới dữ liệu hoạt động. Đăng xuất trở về màn hình đăng nhập; đăng nhập lại thành công.
- Desktop và mobile 390px đã kiểm tra trên production thật; không tràn ngang (scrollWidth 375px). Ảnh nghiệm thu riêng: tmp/step32-production-desktop.png và tmp/step32-production-mobile.png.
- Staging giữ release 556db22c45e1dcdc76b9628a51415730d007da42 và lịch bật, paused=false. Không sửa lịch hoặc phát sinh bài thử trong Bước 32.

Bước 32 hoàn tất trong phạm vi giao diện và dữ liệu nền. Kho chưa nhập; Facebook, Telegram và giám sát production chưa nghiệm thu. Production vẫn khóa đăng tự động.

Bước tiếp theo đề xuất là nhập và đối chiếu kho production (caption/ảnh/PDF/logo/biên nhận), vẫn khóa đăng; cần phê duyệt riêng.
