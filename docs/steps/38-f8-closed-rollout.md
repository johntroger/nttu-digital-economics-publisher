# F8 — triển khai production ở trạng thái đóng

Ngày 11/10/2026. Chủ dự án phê duyệt F8 sau khi F7 hoàn tất. Phạm vi thực hiện: backup mới, kiểm thử phục hồi, triển khai management và runner, migration 15/16, kiểm tra đăng nhập và dữ liệu. Chưa cấp quyền đăng Facebook, bật lịch hoặc chuyển credential sang GitHub.

## Kết quả

Runtime production là `9ce88cc7be80755a6b4c57a95a94964c79de2e1e`, đúng release F7 đã qua CI Windows/Linux và nghiệm thu CPU. Không đổi mã runtime, không merge main, không chạy lại CI. Hai script quản trị F8 và hồ sơ local không thuộc bundle runtime đã triển khai.

Backup database production mới nằm tại `tmp/step38/f8/backup/production-schema14.sql`, SHA256 `df2c5330dcc86981a1fefad600afa0897eaba53cabcac567a65a1591bb0422e2`. Đây là backup database mới; không tuyên bố là gói ảnh/PDF mới. Giữ các bản sao media và gói phục hồi thật đã có. Snapshot settings lưu tên secret, không lưu giá trị secret.

Phục hồi SQLite trong RAM: integrity_check đạt, foreign_key_check không lỗi, 40 bài/56 tệp. Migration 14→16 và rollback 16→15 đạt, dữ liệu được bảo vệ giữ nguyên checksum. Không rollback database thật để thử.

Management triển khai đóng trước migration; migration thật đưa schema lên 16; runner riêng triển khai đóng, không secret outbound. Sau rollout đối chiếu 8 bảng posts, post_versions, content_entries, cloud_library, cloud_reviews, jobs, attempts, usage với backup: dữ liệu giữ nguyên. Secret của management giữ nguyên danh sách tên; không đọc hoặc copy giá trị.

Hai Worker không có cron. DAILY_PUBLISHING_ENABLED, PRODUCTION_PUBLISHER_ENABLED, PRODUCTION_RUNNER_ENABLED đều false; config enabled=0, paused_by_user=1. Permits/jobs/intents/publications đều 0. Runner claim/status trả 503 khi chưa cấp quyền vận hành. Không gửi Facebook hoặc Telegram để kiểm thử.

Đăng xuất rồi đăng nhập Google thực lại sau triển khai, đúng owner tranthanhtung37@gmail.com, vào được giao diện production. Lịch hiển thị Chưa bật, 10:00 Việt Nam, một bài/ngày. Đối chiếu UI 40/40 bài khớp biên nhận duyệt, gồm 30 chính và 10 dự phòng; chưa lưu lịch hoặc quyền đăng. Lịch Tập Viết và tác vụ cron-job.org không được sửa trong F8.

Quota D1 trước backup: 933.248 rowsRead/12.102 rowsWritten ngày UTC; analytics có thể trễ. R2 Standard 143 object/52.731.235 byte, Infrequent Access 0. GitHub UI vừa đọc lại: Free, 1.084,3/2.000 phút, storage 0/0,5GB, budget Actions toàn tài khoản 0USD, Stop usage Yes; giữ số API cũ bảo thủ 1.184 phút, không giảm usage vì UI thấp hơn. F8 không chạy GitHub Actions mới. Chưa áp owner policy tháng; chưa có hard stop R2 được xác minh.

## Bằng chứng giữ lại

`tmp/step38/f8/backup-restore.json`, `rollout.json`, `preflight.json`, `google-and-budget-acceptance.json`, `production-schedule-closed.png`, `github-billing-overview.png`, `github-budget-closed.png`, cấu hình đóng và backup thật. File tạm/cache của từng lượt chạy được dọn bởi run-clean; phục hồi dùng RAM, không tạo database fixture trên đĩa.

## F9 — chuẩn bị quyền vận hành, cần phê duyệt bước mới

Chốt policy tháng UTC/release sau đọc quota mới; cấu hình GitHub environment production-runner và các capability/credential tối thiểu cho runner/scheduler. Cần xác nhận riêng khi chuyển credential sang đích mới. Chuẩn bị hồ sơ một bài thử gồm mã, phiên bản, caption, ảnh và Page ID 817593604765443. Giữ cổng gửi và lịch tắt trong bước chuẩn bị này.

Chỉ đăng bài kiểm thử thật khi chủ dự án duyệt hồ sơ bài và thời điểm gửi. Chỉ bật lịch 10:00 một bài/ngày sau khi bài thử xác nhận thành công và được duyệt lịch. Thay đổi giám sát tiết kiệm quota cũng cần phạm vi được duyệt; không dùng HTTP 204 làm bằng chứng bài đã đăng.
