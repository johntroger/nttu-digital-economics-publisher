# Bước 38 — Chuẩn bị gửi và hồ sơ thử production

Người quản lý phê duyệt code Bước 38, giao chọn bài để lập hồ sơ. Chọn P01 «Một bảng doanh thu có thể kể điều gì?»; nội dung và thiết kế đã duyệt, không phụ thuộc bài trước. Chưa có phê duyệt đăng Facebook.

## Phần đã xây dựng

- POST `/api/production/send-preflight` chỉ nhận versionId; owner session, CSRF, đúng origin và JSON giới hạn 1 KB. Không nhận thời gian, token, URL hoặc đích từ caller.
- Dry-run chỉ SELECT, không dùng tick/heartbeat, không ghi permit/job/intent/evidence/slot/publication. Transport giới hạn GET tới debug_token và me trên Graph; chặn POST ngay tại capability.
- Dùng cùng identity, biên nhận duyệt, nguồn/facts, checksum và byte R2, Meta GET như adapter live. Đối chiếu lần nữa sau I/O; nguồn, version, cấu hình, operation generation, token hoặc ngày thay đổi làm hồ sơ thất bại.
- Chỉ tính hash đối với bài được chọn, dùng cùng phép đối chiếu trong live adapter. Projection riêng và projection cả kho cho kết quả cùng bài giống nhau.
- Hồ sơ gồm caption có separator/footer, ảnh/checksum/byte count, version/checkVersion/receiptDigest, Page cố định, release, dấu vân tay kết nối, revision, thời điểm đề xuất gần nhất theo server clock Việt Nam. Đề xuất sau ít nhất hai phút, làm tròn lên phút; hồ sơ hết hiệu lực trước thời điểm thử hoặc sau năm phút. Đây không phải lịch hoặc quyền đăng.
- Hàm cấp permit và kích hoạt thử một lần chỉ có thể dùng sau phê duyệt owner khớp hash còn hạn, deployment gate riêng và SQL fences. **Không có route HTTP cấp permit/kích hoạt/đối soát trong bản này**. Các hàm chỉ được gọi trong fixture/native test, không gọi production.
- Thử một lần xác nhận thành công tự tắt config và pause trong cùng batch finalizer; kết quả unknown vẫn giữ khóa Page, pause không gỡ khóa, chỉ bằng chứng GET tương quan mới hoàn tất. Giữ nguyên hành vi lượt thường trong Bước 37.
- Không có migration mới; schema vẫn 14, không thêm credential hay cron job, không đổi staging hoặc nguồn Telegram.

## Kiểm thử trước triển khai

TypeScript, 405/405 kiểm thử local và 13 kiểm tra ảnh đạt. Native compiled workerd/D1/R2: tám kịch bản, gồm dry-run 18 SELECT, không ghi quyền/job và thử một lần tự đóng; tất cả Graph được giả lập, 0 Meta POST thật. Nguồn/ảnh thay đổi, caller-selected time, CSRF/origin, hồ sơ hết hạn, phê duyệt sai hash, race/dedupe, unknown và đối soát đều được kiểm tra. Kiểm tra toàn bộ 40 bài xác nhận projection riêng và projection cả kho cho cùng kết quả sau khi chuẩn hóa thứ tự sources/facts.

## Nghiệm thu cloud

CI Windows/Ubuntu và native đạt tại [run 37628440406](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37628440406). Runtime đã triển khai là `7aadfc165dfd51692aeeedb34cf2f5cc9507c170`, Cloudflare version `cf0da429-a4db-4a81-9cc4-7ab0d7b49b69`. Commit tài liệu tiếp theo không thay runtime này. Draft [PR 10](https://github.com/johntroger/nttu-digital-economics-publisher/pull/10) chưa merge.

Dashboard Billing xác nhận **Workers Free đang Active**. API settings có usage_model standard, không có cpu_ms override; subscription API thiếu quyền nên bằng chứng gói lấy từ dashboard, không suy diễn từ usage_model. Không nâng gói hoặc thực hiện thanh toán.

Số đo thực ngày 07/10/2026, telemetry đã lọc bỏ headers/token/logs:

| Request | CPU | Wall time |
| --- | ---: | ---: |
| Dry-run trước tối ưu, lượt đầu ghi nhận | 44 ms | 1.599 ms |
| Dry-run trước tối ưu, lượt warm ghi nhận | 25 ms | 1.225 ms |
| Dry-run sau tối ưu | **23 ms** | **818 ms** |
| Preview cả kho sau tối ưu | 35 ms | 185 ms |
| Trang quản lý sau tối ưu | 20 ms | 440 ms |
| Preflight trạng thái | 5 ms | 188 ms |
| Đọc ảnh | 3 ms | 144 ms |

Đường dry-run dùng 18 SELECT theo bộ đếm và native test; đây không phải chỉ số query do telemetry Cloudflare trả về. Số mẫu CPU còn ít, không đủ kết luận phân phối cold/warm. CPU và thời gian chờ mạng là hai chỉ số khác nhau; chưa đo Meta POST thật.

**Chưa đạt nghiệm thu tài nguyên:** 23 ms vượt ngân sách Free 10 ms. Việc request trả thành công không bảo đảm vận hành ổn định trong ngân sách. Preview và trang quản lý cũng cần xử lý. Tham chiếu: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) và [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Snapshot cuối ngày 07/10: 40 bài, 56 assets, schema 14; permit/job/intent/publication/slot đều 0, config publisher tắt, application paused, publisher heartbeat0. Telegram HTTP heartbeat475; không gửi thêm tin kiểm thử trong bước này. Secret PRODUCTION_PUBLISHER_TOKEN chưa được tạo. Staging giữ release `556db22c45e1dcdc76b9628a51415730d007da42` và lịch 10:00 trên Tập Viết.

## Quyết định còn chờ

Người quản lý đã chọn giữ Workers Free ngày 08/10/2026 và yêu cầu xem phương án xử lý. Đã lập [thiết kế Free F1–F4](38-resource-acceptance-plan.md), bắt đầu bằng phân trang/tải theo tab và đo nền, sau đó chia chuẩn bị và publisher thành các giai đoạn có kiểm soát. Chưa được duyệt code thiết kế này; không phát sinh phí, không triển khai kiến trúc mới hoặc chuyển bước tiếp theo.

## Điều kiện trước thử thật

Chỉ sau khi kiểm tra CPU, UI và dữ liệu cloud đạt mới trình hồ sơ còn hiệu lực để người quản lý duyệt cụ thể bài, ảnh/version/hash, Page và thời điểm. Hồ sơ/screenshot ngày 07/10 đã hết hạn, không dùng làm quyền đăng ngày 08/10; phải tạo lại trước review thử thật.

Còn phải triển khai và nghiệm thu giao diện owner cấp/kích hoạt/pause/đối soát, trạng thái quản lý và giám sát khi có lượt thử được cấp quyền hợp lệ, nguồn publisher riêng và đo đường gửi thật theo phê duyệt cụ thể. Các helper kiểm thử chưa thay thế các giao diện vận hành này. Chưa bật lịch thường 10:00, chưa cấp publisher token hoặc nguồn kích hoạt ngoài. Phê duyệt code không tự cấp phê duyệt đăng.


## Tiếp nối F1 (08/10/2026)

Đã hoàn tất phạm vi giao diện đọc và số đo F1; số đo Bước38 phía trên là lịch sử trước tối ưu. Runtime/kiểm thử/CPU mới và các giới hạn còn mở nằm trong [báo cáo F1](38-f1-free-management.md). Chưa sửa dry-run 23 ms hoặc mở cửa publisher; F2–F4 chờ phê duyệt riêng.


## Tiếp nối F2 (08/10/2026)

Trạng thái và số đo phía trên ghi nhận khi hoàn tất giai đoạn này. F2 nay đã hoàn tất phần chuẩn bị theo bốn request; xem [báo cáo F2](38-f2-free-preparation.md). F3–F4 vẫn chờ phê duyệt; publisher chưa được mở.
