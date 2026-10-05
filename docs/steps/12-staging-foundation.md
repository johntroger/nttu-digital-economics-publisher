# Bước 12 — nền staging Cloudflare

Phê duyệt: người dùng yêu cầu thực hiện bước 12. Ngày: 05/10/2026.
Trạng thái: code và kiểm thử local hoàn tất; chưa triển khai thật vì chủ tài khoản
chưa có tài khoản Cloudflare. Bước 12 chưa được nghiệm thu cloud và chưa chuyển bước 13.

## Phạm vi đã xây

- Wrangler 4.147.0 cố định trong lockfile. Worker riêng `src/cloud/worker.ts`, không đưa
  Node SQLite/Python/filesystem của GUI local lên Workers.
- `npm run cloud:prepare` sinh cấu hình staging và migration trong `tmp/cloud`.
  Sáu migration nghiệp vụ giữ nguyên bản gốc/checksum, migration thứ bảy chỉ tạo bản ghi
  hoạt động staging. Database mới trống, tất cả môi trường bắt đầu paused.
- Public `/health` chỉ liveness và release SHA, không truy vấn database hay cung cấp dữ liệu
  bài viết. GET `/api/staging/status` cần secret riêng để kiểm tra D1/pause/heartbeat.
  Secret này chỉ cho đọc trạng thái nền, không thay đăng nhập Google của GUI.
- Cron `17 * * * *` (UTC) chỉ ghi hoạt động mỗi giờ vào D1. Giao lại cùng lượt/đến sai thứ tự
  không tăng đếm hoặc lùi thời gian. Không sử dụng `last_run_at` của luồng đăng để giả báo
  lịch đăng đã chạy. Lịch đăng 10:00 và đối chiếu 08:00 Việt Nam chưa bật.
- Staging worker từ chối local/fake/production; mọi endpoint đăng, GUI, tài liệu, ảnh và
  backup chưa phục vụ trên cloud. PDF/logo/kho private chưa tải lên Cloudflare.
- CI Ubuntu chạy thêm dry-run bundle và smoke Workers/D1 local. CI portable trên cả hai
  nền tảng tiếp tục chạy. Job deploy chỉ bật khi repository variable
  `STAGING_DEPLOY_ENABLED=true`, sau khi toàn bộ CI đạt, dùng chính commit SHA đã kiểm tra.
  Không cấu hình production. Workflow không hủy run đang migration/deploy.
- `npm run deploy:staging` yêu cầu D1 thật, URL staging đúng tên, commit SHA đầy đủ,
  checkout sạch và credential môi trường. Secret truyền qua file tmp ngắn hạn, xóa trong
  finally; không chuyển output CLI có thể chứa binding/secret vào log CI.
  Sau deploy kiểm tra release, D1 paused và anonymous status bị chặn.

## Kiểm thử

Strict TypeScript và **167/167 Node/SQLite/HTTP** đạt; **131/131 portable** đạt.
10 ca mới kiểm tra cấu hình, quyền đọc, schema/pause, cron, duplicate/out-of-order,
pause thay đổi giữa đọc/ghi, giới hạn endpoint, checksum migration và chặn đích sai.

`npm run test:cloud` đã đạt với Wrangler/workerd và D1 local thật:
bundle dry-run → áp dụng 7 migration → HTTP health/status → gọi scheduled handler →
đọc lại heartbeat từ D1 → xác nhận endpoint đăng vẫn bị chặn.
Đây là runtime mô phỏng trên máy, chưa chứng minh cloud chạy khi máy tính tắt.
Pre-push tiếp tục kiểm tra ảnh và toàn bộ test local. Không sửa GUI nên không chạy lại
42 ca trình duyệt đã đạt ở bước 10.

## Thiết lập còn cần làm trong chính bước 12

1. Chủ tài khoản đăng ký miễn phí tại https://dash.cloudflare.com/sign-up và xác minh email.
   Không cần gửi mật khẩu hoặc token vào hội thoại. Không mua gói hoặc bật R2 ở bước này.
2. Dùng `node node_modules/wrangler/bin/wrangler.js login` để người dùng đăng nhập/cho phép
   trên trình duyệt; xác minh đúng account. Tạo D1 riêng `nttu-publisher-staging` trên gói Free,
   lưu database ID vào cấu hình local/variable, không dùng database production.
3. Thiết lập GitHub environment `staging`. Variables:
   `STAGING_D1_DATABASE_ID`, `STAGING_WORKER_URL` (Workers.dev staging),
   `CLOUDFLARE_ACCOUNT_ID`. Secrets: `CLOUDFLARE_API_TOKEN` giới hạn account và quyền
   Workers Scripts/D1 cần thiết; `STAGING_HEALTH_TOKEN` 32 byte ngẫu nhiên dạng hex.
   Token triển khai không chứa quyền Meta hoặc tài khoản Google.
4. Chỉ sau xác minh đích/quyền mới bật repository variable `STAGING_DEPLOY_ENABLED=true`.
   Chạy workflow main đã CI đạt; kiểm tra endpoint và SHA trực tiếp. Pipeline Actions là
   đầu mối deploy duy nhất, không bật thêm Workers Builds.
5. Chờ lượt cron thật, đọc `lastScheduledAt/heartbeatCount`, ghi bằng chứng thời gian UTC
   và Việt Nam. Cloudflare cho biết cập nhật Cron có thể mất tới 15 phút; không coi deploy
   thành công là bằng chứng cron đã chạy. Sau bước này mới báo nền cloud nghiệm thu đạt.

## Giới hạn và phần việc sau

Workers/D1 có gói miễn phí nhưng vẫn phải kiểm tra quota tài khoản thực tế. Chưa tạo dịch vụ
tính phí. R2/kho ảnh, tài liệu private, Google owner auth, chuyển API GUI sang D1 async,
giao dịch claim/finalizer D1 live, Meta/Telegram và backup/monitor cloud chưa nghiệm thu.
Các kiểm thử giao dịch SQLite local không thay cho kiểm thử tranh chấp trên D1 cloud.
Nền này chuẩn bị môi trường thử, chưa phải ứng dụng đầy đủ hoặc production.

Tài liệu chính thức:
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/d1/platform/pricing/

Dừng trong bước 12 chờ thiết lập tài khoản; không yêu cầu phê duyệt lại bước đã duyệt.
