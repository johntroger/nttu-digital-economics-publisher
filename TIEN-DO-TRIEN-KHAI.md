# Tiến độ và cổng phê duyệt triển khai

Ngày cập nhật: 05/10/2026. Kế hoạch nền: v4.3.
Điều chỉnh caption sau bước7: thêm separator `============` trước footer;127/127 test
Node/HTTP và5 ca trình duyệt mẫu đạt. Bước8 vẫn chưa được phê duyệt hoặc bắt đầu.
Theo yêu cầu người dùng: code từng bước, kiểm thử bước hiện tại, báo cáo rồi dừng;
chỉ code bước kế tiếp sau khi có phê duyệt rõ từ chủ tài khoản. Sửa lỗi trong bước đang làm
và kiểm thử lại thuộc phạm vi bước đó. Không tự coi im lặng là phê duyệt.

| Bước | Phạm vi | Kiểm thử | Phê duyệt |
|---|---|---|---|
| 1 | Khung TypeScript/HTTP local, policy thời gian, schema lõi | 21/21 test đạt tại mốc bước 1; tiếp tục đạt trong bộ 42 test | Đã duyệt chuyển bước 2 |
| 2 | Nguồn/facts/checks, kho nháp, eligibility/stock/reserve, footer | 42/42 test tại mốc bước 2; tiếp tục đạt trong bộ 66 test | Đã duyệt chuyển bước 3 |
| 3 | Claim/intent/ownership/pause/maintenance và snapshot local | 66/66 test tại mốc bước 3; tiếp tục đạt trong bộ 89 test | Đã duyệt chuyển bước 4 |
| 4 | Evidence intake/finalizer/publication/usage/day guard/outbox local | 89/89 test tại mốc bước 4; tiếp tục đạt trong bộ 116 test | Đã duyệt chuyển bước 5 |
| 5 | Điều phối lịch/retry/reserve/queue với adapter giả lập local | 116/116 tại mốc bước 5; tiếp tục đạt trong bộ 120 test | Đã duyệt chuyển bước 6 |
| 6 | GUI local xem kho/lịch/lịch sử/cảnh báo và chạy demo giả lập | 120/120 tại mốc bước6; 14 ca trình duyệt tiếp tục đạt | Đã duyệt chuyển bước7 |
| 7 | Năm mẫu P02/P04/P05/P06/P08, ba bố cục ảnh vuông, đối chiếu nguồn và preview GUI | Strict và125/125 Node/HTTP;9/9 dựng ảnh;14+5 ca trình duyệt đạt; QA1080/360/caption mobile | Được yêu cầu “phê duyệt bước 7”; hoàn tất, dừng chờ người quản lý xem mẫu và duyệt bước8 |
| 8 — đề xuất | Lưu, chỉnh sửa và quản lý phiên bản caption–ảnh/kiểm định trong kho local | Chưa xây/chưa chạy | Chưa có |
| Các bước sau | Biên tập/ảnh, Google auth, Meta/Telegram live, cloud/GitHub/backup/restore | Chưa xây/chưa chạy | Phạm vi được trình trước từng bước |

Báo cáo: docs/steps/01-foundation.md, docs/steps/02-content-catalog.md,
docs/steps/03-claims-intent.md, docs/steps/04-evidence-finalization.md, docs/steps/05-local-workflow.md, docs/steps/06-local-ui.md và docs/steps/07-content-samples.md.
Kho local: 40 đề cương nháp, 0 bài đủ điều kiện đăng; không coi đề cương là caption/ảnh hoàn chỉnh.
Đã có năm bản mẫu caption/PNG riêng đang chờ owner xem, chưa nhập/promote ready cho kho.
Đã có giao diện quản lý và luồng chạy giả lập local; chưa có khả năng đăng fanpage thật.
Không tạo repository remote, cấu hình tài khoản, lấy secrets hay deploy trong bước1.
Các trạng thái “chưa có code” trong bộ thiết kế v4.3 mô tả mốc trước triển khai;
tiến độ thực tế hiện hành theo tài liệu này và báo cáo từng bước.

## Mốc hiện hành — bước 8 (05/10/2026)

Đã hoàn tất bước 8 theo phê duyệt. Kho 40 bài hiện có 5 caption/ảnh đã nhập và 35 đề cương;
0 bài đủ điều kiện đăng. Có chỉnh sửa, phiên bản, dựng ảnh và ghi nhận rà soát local.
135/135 kiểm thử mã nguồn, 8 editor + 14 giao diện + 5 mẫu trình duyệt, 9/9 kiểm thử ảnh đạt.
Chi tiết: docs/steps/08-local-editor.md. Các bảng bước 7 phía trên mô tả mốc trước bước 8.
Dừng trước bước tiếp theo; chưa nối dịch vụ thật hoặc triển khai cloud/GitHub.

## Mốc hiện hành — bước 9 (05/10/2026)

Đã hoàn tất quản lý căn cứ theo tài liệu/trang, mở PDF local, lưu nguồn theo phiên bản,
kiểm định từng bài/toàn bộ 40 bài, chặn caption trùng nguyên văn và nguồn thay đổi.
145/145 kiểm thử mã nguồn, 35/35 ca trình duyệt và 9/9 kiểm thử ảnh đạt.
Báo cáo: docs/steps/09-source-review.md. Không tự viết thêm bài hoặc bật readiness/lịch đăng.
Dừng chờ phê duyệt bước 10: sao lưu/xuất và khôi phục kho local.
Các mốc bước 7–8 phía trên là lịch sử; nguồn theo trang nay đã có thể nhập cho tất cả bài.

## Mốc hiện hành — bước 10 (05/10/2026)

Đã hoàn tất sao lưu/kiểm tra/khôi phục kho local theo phê duyệt. Gói đầy đủ database,
ảnh, PDF nguồn, logo/font/renderer và content gốc. Khôi phục tạo kho riêng paused/quarantined,
giữ kho gốc và lịch sử. Đã tạo gói thực tế đầu tiên cho kho đang dùng.
154/154 kiểm thử mã nguồn, 42/42 ca trình duyệt và 9/9 kiểm thử ảnh đạt.
Báo cáo: docs/steps/10-local-backups.md. Dừng trước bước 11 (đề xuất GitHub và CI).
Chưa nghiệm thu sao lưu mã hóa/cloud/production hoặc lịch sao lưu tự động.

## Mốc hiện hành — bước 11 (05/10/2026)

Đã tạo Git local/main và repository GitHub riêng tư johntroger/nttu-digital-economics-publisher,
đẩy mã nguồn, thiết lập CI Node24 trên Ubuntu/Windows. 157/157 kiểm thử mã nguồn local,
9/9 ảnh và 121/121 portable đạt; CI thật hai nền tảng đã thành công.
Pre-push kiểm tra đầy đủ local; repository guard chặn file riêng và credential phổ biến.
PDF/logo gốc/ảnh mẫu/database/backup/tài khoản không đưa vào repository.
Báo cáo: docs/steps/11-github-ci.md. Dừng trước bước 12: đề xuất chuẩn bị staging cloud.
GitHub quản lý mã nguồn/CI; ứng dụng chưa chạy cloud hoặc đăng Facebook thật.

## Mốc hiện hành — bước 12 (05/10/2026)

Được phê duyệt và đã xây nền Worker staging, chuẩn bị schema D1 riêng, heartbeat không đăng,
status riêng có secret, CI smoke cloud local và pipeline staging sau CI mặc định chưa bật.
171/171 Node/SQLite/HTTP, 135/135 portable và smoke Wrangler/workerd/D1 local đạt.
CI kiểm tra Ubuntu/Windows đạt. Cloudflare Worker và D1 staging riêng đã triển khai thật;
cron độc lập máy cá nhân đã ghi heartbeat lúc14:35:31VN ngày05/10. Health/D1=200,
anonymous status=401, endpoint đăng=501. Đã sửa chờ health của địa chỉ mới tối đa5phút.
Setup secrets/variables/subdomain đã được người dùng duyệt cụ thể sau yêu cầu auto-review.
Chưa đưa GUI/kho private lên cloud và chưa đăng Facebook. Không chuyển bước13.
Chi tiết: docs/steps/12-staging-foundation.md. Tài liệu/logo/database private vẫn local.
