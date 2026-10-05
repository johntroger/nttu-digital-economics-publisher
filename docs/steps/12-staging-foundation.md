# Bước 12 — nền staging Cloudflare

Phê duyệt: người dùng yêu cầu thực hiện bước 12. Ngày: 05/10/2026.
Trạng thái: nền staging đã triển khai trên Cloudflare, D1 hoạt động và đã quan sát cron thật.
Địa chỉ: https://nttu-publisher-staging.nttu-kts-johntroger.workers.dev/health.
Chủ tài khoản đã tạo/xác minh Cloudflare, cung cấp token trực tiếp vào GitHub và phê duyệt
cụ thể variables/secret/subdomain. Chưa bắt đầu bước 13 hoặc bật lịch đăng Facebook.

## Phạm vi đã xây

- Wrangler 4.147.0 cố định trong lockfile. Worker riêng `src/cloud/worker.ts`, không đưa
  Node SQLite/Python/filesystem của GUI local lên Workers.
- `npm run cloud:prepare` sinh cấu hình staging và migration trong `tmp/cloud`.
  Sáu migration nghiệp vụ giữ nguyên bản gốc/checksum, migration thứ bảy chỉ tạo bản ghi
  hoạt động staging. Database mới trống, tất cả môi trường bắt đầu paused.
- Public `/health` chỉ liveness và release SHA, không truy vấn database hay cung cấp dữ liệu
  bài viết. GET `/api/staging/status` cần secret riêng để kiểm tra D1/pause/heartbeat.
  Secret này chỉ cho đọc trạng thái nền, không thay đăng nhập Google của GUI.
- Cron `*/5 * * * *` (UTC) chỉ ghi hoạt động mỗi 5 phút vào D1 để nghiệm thu nền staging.
  Giao lại cùng lượt/đến sai thứ tự
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

Strict TypeScript, **171/171 Node/SQLite/HTTP** và **135/135 portable** đạt.
14 ca mới kiểm tra cấu hình, quyền đọc, schema/pause, cron, duplicate/out-of-order,
pause thay đổi giữa đọc/ghi, giới hạn endpoint, checksum migration, chặn đích sai và
chờ health khi DNS chưa sẵn sàng. Pre-push tiếp tục chạy 9/9 kiểm thử ảnh.

`npm run test:cloud` đã đạt với Wrangler/workerd và D1 local thật:
bundle dry-run → áp dụng 7 migration → HTTP health/status → gọi scheduled handler →
đọc lại heartbeat từ D1 → xác nhận endpoint đăng vẫn bị chặn.
Smoke local là bằng chứng riêng; nghiệm thu cloud dựa endpoint và cron thật ở mục sau.
Pre-push tiếp tục kiểm tra ảnh và toàn bộ test local. Không sửa GUI nên không chạy lại
42 ca trình duyệt đã đạt ở bước 10.

## Thiết lập thực tế và cách tái triển khai

1. Đã hoàn tất: chủ tài khoản đăng ký Cloudflare và xác minh email.
   Không cần gửi mật khẩu hoặc token vào hội thoại. Không mua gói hoặc bật R2 ở bước này.
2. Đã đăng nhập đúng owner email qua OAuth. Đã tạo D1 `nttu-publisher-staging` vùng APAC,
   đã áp dụng đầy đủ 7 migration remote; không nhập kho/tài liệu riêng.
   Không tạo tài nguyên production hoặc R2.
   Quyền OAuth hiện hành tạo được D1 nhưng truy cập Workers subdomain còn HTTP403;
   pipeline dùng API token Workers Scripts/D1 do owner tạo, không sao chép OAuth vào GitHub.
3. Đã thiết lập GitHub Actions repository variables/secrets dành riêng staging. Variables:
   `STAGING_D1_DATABASE_ID`, `STAGING_WORKER_URL` (Workers.dev staging),
   `CLOUDFLARE_ACCOUNT_ID`. Secrets: `CLOUDFLARE_API_TOKEN` giới hạn account và quyền
   Workers Scripts Edit, D1 Edit, Account Settings Read; `STAGING_HEALTH_TOKEN`
   32 byte ngẫu nhiên dạng hex.
   Token triển khai không chứa quyền Meta hoặc tài khoản Google. Không dùng GitHub
   environment secrets vì private repository trên GitHub Free không hỗ trợ tính năng này.
   Không đặt credential production vào pipeline staging; trước production chốt lại phạm vi
   secret/release theo gói GitHub thực tế, không tự nâng gói.
4. Đã bật repository variable `STAGING_DEPLOY_ENABLED=true` sau phê duyệt cụ thể.
   Main sau CI đạt tự triển khai staging và kiểm tra endpoint/SHA. Pipeline Actions là
   đầu mối deploy duy nhất, không bật thêm Workers Builds.
5. Đã quan sát cron thật ở **07:35:31 UTC / 14:35:31 Việt Nam ngày 05/10/2026**.
   Khi kiểm tra 07:36:29 UTC: heartbeatCount=1, D1 checked=true, paused=true;
   health/private status=200, anonymous status=401, endpoint publish=501.
   Chỉ gửi GET status; không gửi yêu cầu kích hoạt cron remote hoặc dựa cron trên máy.
   Bằng chứng local không chứa token: `tmp/cloud/remote-evidence.json` (được cập nhật mỗi lần đọc).
   Cron chạy trong Cloudflare, độc lập server local/máy cá nhân. Chưa nghiệm thu luồng đăng.

Lần deploy đầu đã tải Worker/migration nhưng job kết luận failure khi địa chỉ mới chưa
truy cập được trong khoảng chờ ngắn. Sau đó endpoint hoạt động và cron ghi D1. Đã sửa
verification chờ tối đa 5 phút, vẫn bắt buộc đúng SHA/pause/privacy; không coi lỗi mạng là
thành công hoặc hạ yêu cầu kiểm tra. Hai test bổ sung chứng minh retry và timeout chặn sai.
Theo dõi pipeline hiện hành: https://github.com/johntroger/nttu-digital-economics-publisher/actions.

Dừng staging tự triển khai: đặt `STAGING_DEPLOY_ENABLED=false` (không gỡ Worker/cron đã có).
Dừng cron nền: cấu hình crons=[] rồi triển khai SHA đã kiểm thử. Không có endpoint resume
publishing và không có token Meta trên Worker này.

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
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments

CI commit nền ban đầu đã thành công cả Ubuntu/Windows, Ubuntu gồm smoke Workers/D1:
https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37276368952.

Automatic approval review đã từ chối helper cấu hình Workers subdomain, GitHub variables
và tạo/mã hóa/lưu `STAGING_HEALTH_TOKEN`, với lý do chưa có trusted authorization cho
payload secret cụ thể và đích GitHub. Helper không chạy ở lần bị từ chối. Sau đó người dùng
đã phê duyệt cụ thể subdomain `nttu-kts-johntroger`, variables staging và tạo/lưu
`STAGING_HEALTH_TOKEN` vào repository private `johntroger/nttu-digital-economics-publisher`.
Helper chỉ chạy sau phê duyệt đó và đã lưu secret bằng sealed-box vào GitHub.
Không còn vướng mắc approval ở phần setup này; giá trị secret không in ra hoặc commit.

Phạm vi bước 13 đề xuất: đăng nhập Google owner và chuyển API/giao diện quản lý lên staging,
giữ kho/đăng bài dừng. Chỉ code bước đó sau phê duyệt mới của người dùng.
