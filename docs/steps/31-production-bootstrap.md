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

D1 production ID: 09cdecc7-36a2-4196-950e-ef68b1ecd834 (APAC), tên nttu-publisher-production. Bucket nttu-publisher-production-assets đã tạo với Standard storage. Hai tài nguyên mới đang trống; không sao chép database hoặc secret staging.

## Nghiệm thu bootstrap

331/331 kiểm thử Node, 13 kiểm tra ảnh và TypeScript đạt qua pre-push. CI 37561315839 đạt trên Windows/Linux, gồm smoke Worker/D1 staging hiện có. 4 kiểm thử riêng của bootstrap kiểm tra cách ly cấu hình và đóng đường ghi dữ liệu; thêm 5 yêu cầu HTTP workerd cục bộ đạt.

Triển khai đầu bị từ chối quyền Worker; người quản lý đã bấm Allow để cấp lại phiên Cloudflare với quyền triển khai cần thiết. Bootstrap được triển khai từ commit 5744794974788b7044e0532894cc929cb68fbbdb vào https://nttu-publisher-production.nttu-kts-johntroger.workers.dev, Cloudflare version 1b446b1b-d24c-4fcd-97ae-60f1a016adaf. Kiểm tra trực tiếp lúc 09:23 ngày 07/10/2026: health 200 đúng SHA/phase bootstrap, publishingEnabled=false, schedulerImplemented=false, databaseChecked=false; root, login và hai đường dẫn đăng/bật lịch trả 503. Điều này chỉ nghiệm thu bootstrap, không chứng minh schema hoặc publisher production hoạt động.

Staging vẫn release 556db22c45e1dcdc76b9628a51415730d007da42, publishingEnabled=true, paused=false. Draft PR #2 giữ riêng thay đổi khỏi main; chưa merge và chưa triển khai backend production. Các bằng chứng riêng nằm trong tmp/step31-*.json, không chứa token. Bước 32 đề xuất: schema/runtime production, Google owner login và giao diện quản lý, lịch vẫn tắt; chờ phê duyệt trước khi bắt đầu.
