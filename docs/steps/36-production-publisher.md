# Bước 36 — Bộ xử lý giả lập và bản xem trước production

Người quản lý đã phê duyệt phạm vi tại `36-production-publisher-plan.md`. Bước này chuẩn bị bộ xử lý và kiểm chứng dữ liệu; không cấp quyền đăng thật.

## Thay đổi

- Bản xem trước riêng tư `/api/production/preview`: đọc 40 phiên bản hiện tại và biên nhận Bước 22/23, đối chiếu SHA-256 body/caption/ảnh, footer, binding ảnh, rubric, nguồn và phiên bản tài liệu, ngày rà soát, xác nhận CTĐT **3,5 năm / cohort 2026**. Các trường không khớp được báo rõ. Không chuyển bài sang ready.
- Giao diện Lịch đăng có bản xem trước 30 bài chính / 10 dự phòng. Ngày bắt đầu là tham số xem trước; không được lưu vào lịch thật. Thời gian 10:00 theo Việt Nam. Caption và ảnh giữ đúng bản đã duyệt.
- Policy adapter khóa Page/database/bucket: staging chỉ Tập Viết, production chỉ Page 817593604765443, D1 09cdecc7-36a2-4196-950e-ef68b1ecd834, bucket nttu-publisher-production-assets. Cấu hình đóng gói khai báo bucket và vẫn giữ binding cố định. R2 không cung cấp API introspection tên bucket từ handle; tên binding được kiểm tra ở cấu hình triển khai, checksum bytes được kiểm tra khi đọc tệp riêng tư.
- Bộ xử lý trong `publisher-simulation.ts` chạy riêng với APP_ENV=test, mode=fake, target fixture và provider bắt buộc. Từ chối provider thiếu, binding live, credential Meta/trigger thật và tài nguyên chéo môi trường. Không có fallback fetch. Không được import vào Worker quản lý.
- Schema fixture mặc định paused, ba cửa deployment/owner/connection đóng. Snapshot job bất biến; intent trước send; bằng chứng được lưu riêng trước transaction hoàn tất. Sau rollback finalizer, lượt mới đọc evidence và hoàn tất mà không gọi send lại. Mất phản hồi hoặc không lưu được evidence: giữ intent/unknown để đối soát.
- Đối chiếu phiên bản/receipt trước claim và ngay trước intent; fence cấu hình được kiểm tra thêm ngay trước provider. Một slot/ngày, một page gate, ba lần thử cách năm phút. Bài dự phòng chỉ được chọn khi kết quả bài trước đã xác định. Bài thủ công không được phát hiện hoặc gán tự động vào job.

## Các cửa production

| Cửa | Bước 36 | Điều kiện cho bước gửi thật |
|---|---|---|
| Worker deployment | DAILY_PUBLISHING_ENABLED=false, management | Phê duyệt bước triển khai riêng |
| D1 | paused=1, enabled=0; CHECK khóa còn nguyên | Migration được thử trên bản sao và duyệt riêng |
| Chủ sở hữu | Chỉ duyệt nội dung/thiết kế | Duyệt bài, đích và giờ chạy thử cụ thể |
| Kết nối | Xác minh đọc Meta, không cấp send | Token/Page/quyền/fingerprint còn hiệu lực ngay trước gửi |
| Provider | Chỉ fake trong fixture | Adapter live có kiểm tra bytes và bằng chứng tương ứng intent |
| HTTP tick | Chỉ xử lý Telegram hiện có | Cần tích hợp publisher bằng lượt riêng, không dùng body/giờ của cron-job.org |

## Ngân sách HTTP dự kiến

Mặc định bộ xử lý chỉ có một lượt/việc gửi trong mỗi invocation. Fixture stress test có thể yêu cầu tối đa bốn lượt; HTTP thật sau này phải dùng mặc định một lượt. Provider có trần 10 giây; hết trần là unknown. Retry và reserve chạy ở invocation kế tiếp. Chưa ghép send Facebook với dispatcher Telegram trong một lượt 30 giây.

Kiểm thử kho thật: tối đa **36 câu SQL/lượt**, native D1 với fixture nhỏ: **37**. Giữ ngân sách lõi tối đa 40, dành phần còn lại cho khóa tick và kiểm tra môi trường; nếu adapter live cần thêm truy vấn phải tách preflight/giai đoạn, không tăng mặc định số lượt. [Giới hạn D1](https://developers.cloudflare.com/d1/platform/limits/) hiện nêu 50 query/invocation trên Free. [Giới hạn Workers](https://developers.cloudflare.com/workers/platform/limits/) nêu CPU HTTP Free 10 ms. Số SQL và timeout đạt trong fixture **không chứng minh CPU publisher live đạt trên cloud**; publisher chưa nằm trong runtime cloud để đo. Bước gửi thật phải đo CPU sau khi adapter live được chuẩn bị, trước khi mở cửa đăng.

Heartbeat hiện có tiếp tục đo Telegram HTTP. Heartbeat/lease/evidence publisher phải độc lập khi tích hợp; không thay heartbeat Cron cũ hoặc giả lập thành bằng chứng cloud. Chọn đúng một nguồn kích hoạt và fence D1, không chạy cùng job qua Cron lẫn HTTP.

## Kiểm thử

- Bản xem trước: 40/40 khớp duyệt; không có thay đổi D1. Body/footer/ảnh/nguồn/fact bị đổi đều không được chấp nhận; các trigger bất biến được thử trước khi cố tình gỡ riêng trong fixture để kiểm tra lớp đối chiếu thứ hai.
- Mô phỏng với chính kho đã duyệt: **30 request fake, 30 xác nhận, 0 dự phòng bị dùng, 0 outbound Meta thật**. 30 ngày liên tiếp, lượt trùng ngày không gửi lại. Dữ liệu production không bị tiêu kho.
- Native D1 qua orchestration Node: **7 tình huống, 9 request fake**, rollback thực tế D1, crash/evidence/recovery, retry, concurrent claim, unknown, ngân sách SQL.
- Bộ xử lý được biên dịch và chạy bên trong **workerd + local D1**: **7 tình huống, 9 request fake, 0 request ngoài**; đồng thời, server date Việt Nam, retry/reserve ở lượt sau, mất phản hồi, evidence sau rollback, gate đóng, timeout provider 10 giây.
- Worker quản lý production biên dịch: owner-only preview, trigger bearer không có quyền đọc nội dung, POST preview không thể kích hoạt; fake schema/class không có trong bundle quản lý. Native owner/OAuth/Meta GET/Telegram dùng mock cục bộ; không gọi provider bên ngoài.
- Regression, TypeScript, 13 kiểm tra ảnh và CI Windows/Ubuntu phải đạt trước triển khai phần xem trước. Sandbox ban đầu chặn localhost và cleanup tempfile; đã chạy lại bằng môi trường kiểm thử có quyền phù hợp, không sửa code để bỏ kiểm tra.

Kết quả đăng Facebook thật: **NOT_RUN**. Không cam kết exactly-once khi API ngoài nhận bài rồi mất phản hồi. Trường hợp đó phải đối soát; không tự POST lại.

## Artifact và chạy lại

- `node scripts/production-preview.mjs [YYYY-MM-DD]` tạo `assets/reviews/step36/preview.html` và JSON cục bộ. Ảnh tham chiếu bản đã duyệt; không render lại hoặc chuyển màu/logo.
- `node --test tests/production-*.test.mjs`; `node scripts/production-management-smoke.mjs`; `node scripts/production-publisher-smoke.mjs`.
- Báo cáo JSON cục bộ: `tmp/step36/batch-simulation.json`, `d1-results.json`, `native/results.json`. Tệp sinh ra và ảnh/PDF riêng tư không đưa lên GitHub.
- Nhánh riêng `codex/step36-production-publisher`, draft PR xếp trên Bước 35. Không merge main hoặc triển khai staging.

## Phần chưa thực hiện

Chưa có migration mở production, live Meta sender, route đăng thật, lịch bắt đầu được duyệt hoặc publication production. Notification intents giả lập nằm trong bảng fixture riêng; template/outbox live cho publisher cần được tích hợp và kiểm thử trong bước gửi thật. HTTP đang chạy Telegram và monitor 30 phút được giữ nguyên.

Sau nghiệm thu Bước 36, đề xuất Bước 37: chuẩn bị adapter/schema live với cửa vẫn đóng, chạy preflight, rồi xin phê duyệt bài và giờ thử gần nhất trên Page chính thức. Chỉ bật lịch 10:00 sau khi bài thử có bằng chứng xác minh. Phê duyệt Bước 36 không thay thế phê duyệt đó.

## Nghiệm thu triển khai bản xem trước

- Runtime đã triển khai: `caa97b4ea53c42c7a96b3cf8af698b7f0330a5dc`; Cloudflare version `a1cecc7b-7260-4e24-9980-ea46a8fc7cc1`. Không chạy migration trên cloud.
- [CI runtime 37614703039](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37614703039): Ubuntu và Windows thành công; deploy-staging skipped. Hook trước push: **382 tests / 382 PASS**, TypeScript PASS, **13 kiểm tra ảnh PASS**, kiểm tra repository PASS.
- [Draft PR #8](https://github.com/johntroger/nttu-digital-economics-publisher/pull/8), xếp trên nhánh Bước 35. Không cập nhật main.
- SELECT trên D1 production thật: **40/40** bài khớp biên nhận, **30 main / 10 reserve**, 6 truy vấn chỉ đọc cho preview.
- Health sau deploy đúng release, publishingEnabled=false; **26 kiểm tra quyền riêng tư PASS**. Preview chỉ dành owner; bearer không đọc được. Staging release vẫn `556db22c45e1dcdc76b9628a51415730d007da42`.
- Owner đã đăng nhập lại qua Google. Giao diện web production hiển thị 40/40 khớp duyệt. Thử đổi ngày bắt đầu sang 09/10 và trả lại 08/10: P01 đổi đúng ngày trong bản xem trước; không lưu lịch. Ảnh nghiệm thu cục bộ: `tmp/step36/calendar-production.png`. Công cụ browser chặn protocol file:// của artifact HTML cục bộ; không đi vòng qua hạn chế đó. Giao diện web HTTPS được kiểm tra trực tiếp bằng phiên owner hợp lệ.
- D1 trước/sau thử giao diện: **40 posts / 56 assets / 13 migrations**, **0 jobs / 0 slots / 0 publications**; enabled=0, connection_verified=0, page_id=NULL, paused=1. HTTP enabled=1, heartbeat tăng **350 → 364**, lượt cuối hoàn tất, state=idle. Các schema khóa CHECK được giữ nguyên.
- Bundle quản lý không chứa `production_fixture_jobs`, `FakeProductionPublisher` hoặc fixture staging; phần giả lập không được triển khai.

Bước 36 đã hoàn thành phần code, giả lập, đối chiếu cloud và triển khai xem trước trong phạm vi đã duyệt. Bước gửi thật cần phê duyệt mới.

Lượt [monitor sau deploy 37615844790](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37615844790) đã thành công, checkpoint không có incident. Lịch giám sát ngoài 30 phút giữ nguyên. Phạm vi đề xuất Bước 37 để review trước khi code: `37-production-live-adapter-plan.md`; chưa cấp credential publisher hoặc mở quyền gửi.
