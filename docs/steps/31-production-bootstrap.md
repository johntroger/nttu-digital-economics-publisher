# Bước 31 — Chuẩn bị production riêng

Ngày 07/10/2026, người quản lý chấp nhận tạm thời Bước 30 và yêu cầu tiến hành bước tiếp theo. Đích chính thức đã xác nhận: https://www.facebook.com/NganhKinhTeSoNTTU. Không suy ra Page ID số từ tên đường dẫn; chưa có phê duyệt bật đăng chính thức.

## Phạm vi

Tạo bộ chuẩn bị cấu hình và Worker bootstrap riêng: nttu-publisher-production, D1 nttu-publisher-production, R2 nttu-publisher-production-assets. Cấu hình không tái dùng database staging, không có cron, không có secret Meta/Google/Telegram và không tự kế thừa dashboard variables. Worker chỉ trả health mô tả phase bootstrap; health không xác nhận database, login, publisher hoặc scheduler hoạt động. Những đường dẫn khác trả 503. Không có handler scheduled.

Mã nằm trên nhánh riêng để tránh pipeline main tự triển khai thay đổi vào staging có lịch đang bật. Tài nguyên staging và nội dung đã duyệt giữ nguyên trong bước này. Các kiểm thử chặn dùng nhầm môi trường, bật lịch ngoài ý muốn, truyền release sai và truy cập đường dẫn ghi dữ liệu.

## Trình tự triển khai tiếp

1. Kiểm tra CI nhánh và cấu hình bootstrap.
2. Tạo D1/R2 riêng, xác minh ID/tên thực tế; cấu hình bootstrap không phải schema nghiệp vụ production.
3. Triển khai bootstrap chỉ khi tài nguyên và phiên bản đã xác minh; không gắn token Page.
4. Bước tiếp theo xây runtime/schema production, Google owner login và giao diện. Phải sửa các ràng buộc môi trường trong catalog/auth/Meta/daily/backup/presence/Telegram, không chỉ đổi TRIAL_PAGE.
5. Kết nối Page chính thức chỉ đọc, nhập kho và rà soát, chuẩn bị monitor/backup production.
6. Nghiệm thu trước khi xin phê duyệt riêng ngày bắt đầu bật lịch 10:00, một bài tự động/ngày. Không cho hai môi trường đăng cùng Page.

Chưa coi bootstrap là ứng dụng production dùng được; chưa chuyển fanpage hoặc bật đăng.

## Tài nguyên đã tạo

D1 production ID: 09cdecc7-36a2-4196-950e-ef68b1ecd834 (APAC), tên nttu-publisher-production. Bucket nttu-publisher-production-assets đã tạo với Standard storage. Hai tài nguyên mới đang trống; không sao chép database hoặc secret staging. Cần triển khai/kiểm tra bootstrap và nghiệm thu CI trước khi chốt bước.
