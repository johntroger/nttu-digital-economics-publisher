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

## Mốc hiện hành — bước 13–17 (05/10/2026)

Đã triển khai Google owner login và quản lý caption/phiên bản cloud (13),
R2 private cho 13 PDF/3 logo/5 ảnh mẫu (14), căn cứ theo trang và receipt rà soát
(15), dựng ảnh vuông với ba logo/font chuẩn trong trình duyệt (16), sao lưu
cloud và khôi phục SQLite riêng (17). Bản sao thật gồm 40 bài/40 phiên bản và
21 tài nguyên; ZIP đã kiểm tra và restore quarantine/paused. Chưa có cloud
publisher, Gemini runtime, Meta hoặc Telegram live tại mốc này. Các báo cáo
docs/steps/13-google-management.md đến 17-cloud-backups.md ghi bằng chứng cụ thể.
Các mốc cũ phía trên là lịch sử và không phản ánh tình trạng cloud hiện hành.

## Bước 18 — đã nghiệm thu (06/10/2026)

Người quản lý đã chọn Telegram và hàng chờ. Đã xây/triển khai tab Cảnh báo,
thiết lập chat cá nhân và nền gửi bền vững có intent/receipt, retry/backoff,
delivery_unknown, chặn đổi đích, auth/CSRF. 220 Node tests, 21 GUI checks và
9 kiểm tra ảnh đạt; CI Windows/Ubuntu và native Workers fetch/D1/R2 đạt.
Người quản lý đã tạo bot, lưu token/mã chat qua Cloudflare và bật thông báo.
Tin thật lúc 09:33 giờ Việt Nam có receipt delivered, tries=1, message_id=3;
người quản lý xác nhận nhận được. Lịch Facebook vẫn dừng; nối các sự kiện
đăng/tồn kho sẽ thuộc bước cloud publisher được phê duyệt sau. Chưa chuyển Bước 19. Chi tiết:
docs/steps/18-telegram-outbox.md.

## Bước 19 — đã nghiệm thu phạm vi giả lập (06/10/2026)

Được duyệt phạm vi điều phối cloud và giả lập. Nền runner D1 bất đồng bộ đã
kiểm thử intent/receipt, ngày thực tế, retry 5 phút/ba lần, dự phòng, unknown,
đối chiếu muộn, crash và rollback. 17 ca workflow và 6 ca D1/workerd local đạt;
22 kiểm tra giao diện đạt. GET /api/workflow riêng cho Google owner chỉ đọc;
tab Lịch đăng hiển thị điều kiện và không có quyền bật giả lập hay đăng thật.
Schema/engine fixture không đưa vào staging, không thay kho 40 bài hay 21 tài
nguyên. 237 Node tests/9 kiểm tra ảnh đạt; CI Windows/Ubuntu và triển khai
staging release d563017b8d37f14539d0db0abf57900bb3f83254 đạt. 41 private paths
trả 401, không có bảng giả lập/job/publication trên staging, checksum gốc giữ
nguyên, lịch vẫn dừng/publish 501. Chưa triển khai Bước 20.
Chi tiết: docs/steps/19-cloud-workflow.md.

## Mốc hiện hành — Bước 30–31 (07/10/2026)

Các bước 20–29 đã nối Meta thử, kho 40 bài đã duyệt, điều phối đăng cloud, lịch một bài/ngày 10:00 trên Tập Viết và giám sát ngoài bằng cron-job.org/GitHub. Xem báo cáo từng bước trong docs/steps. Bước 30 sửa nhãn giao diện, kiểm tra phục hồi và lưu bản ZIP lên Google Drive riêng tư, kiểm tra trạng thái vận hành; 327 kiểm thử Node và 13 kiểm tra ảnh đạt. Người quản lý chấp nhận tạm thời mà không chờ mốc 09:30/10:00; không coi hai mốc đó đã được kiểm chứng.

Bước 31 bắt đầu chuẩn bị production riêng trên nhánh codex/step31-production-bootstrap. Đích chính thức đã xác nhận là NganhKinhTeSoNTTU; Page ID số/token production chưa xác minh. Bootstrap không có cron hoặc khả năng đăng. Chưa triển khai publisher production hoặc bật đăng chính thức. Chi tiết: docs/steps/30-operational-acceptance.md và docs/steps/31-production-bootstrap.md.

## Mốc hiện hành — Bước 32–35 (07/10/2026)

Production đã có đăng nhập Google, kho 40 bài/56 assets, xác minh Meta Page 817593604765443 và token dài hạn, hàng chờ Telegram và giám sát riêng. Cron production không ghi heartbeat nên đã chuyển nguồn xử lý thông báo sang cron-job.org gọi HTTP mỗi phút với token riêng do người quản lý phê duyệt. Bốn lượt tự động đầu tiên 200 OK, Telegram delivered một lần (message ID 12); đến 17:56 có 318 lượt HTTP, dispatch idle. Giám sát cron-job.org/GitHub vẫn mỗi 30 phút, checkpoint không có incident. Không coi nguyên nhân Cron đã được sửa.

357 kiểm thử, 13 kiểm tra ảnh, native workerd/D1 và CI Windows/Ubuntu đạt. Runtime production ad94c090d5781e26afae57b171c2e56188e5ef10, schema 13; staging vẫn release 556db22c45e1dcdc76b9628a51415730d007da42 và giữ lịch Tập Viết. Facebook production vẫn tắt, lịch đích 10:00 giờ Việt Nam/một bài mỗi ngày. Còn xác nhận người quản lý nhìn thấy tin PRODUCTION để khép mục nhận tin của Bước 35.

Bước 36 chưa được phê duyệt và chưa code. Phạm vi đề xuất ở docs/steps/36-production-publisher-plan.md: chuẩn bị publisher production và kiểm thử giả lập, giữ khóa đăng thật. Các mốc cũ phía trên là lịch sử, không phải trạng thái hiện hành.

## Bước 36 — đã hoàn thành phạm vi chuẩn bị

Đã xây bản xem trước riêng tư 30 ngày và bộ publisher giả lập với gate mặc định khóa, intent/evidence/finalization, phục hồi rollback và timeout 10 giây. Kho thật 40/40 khớp duyệt; mô phỏng 30 ngày giữ nguyên 10 dự phòng, không outbound Meta. Native D1 và bộ xử lý biên dịch workerd đều đạt. CI Windows/Ubuntu đã đạt và phần xem trước đã triển khai. Giao diện owner hiển thị 40/40 khớp duyệt; đổi ngày preview không tạo lịch/job/publication. HTTP Telegram vẫn hoạt động, staging giữ release cũ; chưa mở production CHECK/gate, chưa đăng thật. Chi tiết: `docs/steps/36-production-publisher.md`.

## Bước 37 — hoàn thành adapter live với cửa đăng đóng

Schema14 và adapter D1/R2 production đã triển khai sau CI Windows/Ubuntu. 395/395 kiểm thử và 13 kiểm tra ảnh đạt; native workerd/D1/R2 kiểm chứng intent, unknown, timeout, race, evidence recovery bằng outbound mock. Migration/rollback trên bản sao D1 thật giữ nguyên 40 approvals. Preflight owner hiển thị cửa đóng/chưa cấp; D1 production 0 permit/job/publication, publisher heartbeat0. Telegram HTTP và lịch staging giữ nguyên; monitor sau rollout thành công, không incident. CPU thực tế preflight5ms/preview36ms, chưa đo toàn đường gửi Facebook; không coi đã sẵn sàng đăng. Không tạo Secret/job ngoài mới, không bật lịch, không POST Meta thật. Chi tiết: docs/steps/37-production-live-adapter.md; draft PR9. Trạng thái Bước38 hiện hành nằm dưới đây.

## Bước 38 — chức năng đạt, nghiệm thu tài nguyên chưa đạt (08/10/2026)

Đã triển khai dry-run owner/CSRF chỉ đọc và hồ sơ P01 theo lựa chọn được giao; chưa đăng Facebook. 405 kiểm thử, 13 kiểm tra ảnh, tám kịch bản native và CI Windows/Ubuntu đạt. Runtime production `7aadfc165dfd51692aeeedb34cf2f5cc9507c170`, schema 14; draft PR10 chưa merge. Đường chuẩn bị chỉ SELECT và Meta GET; permit/job/intent/publication/slot vẫn 0, cửa publisher tắt, application paused. Telegram HTTP và staging giữ nguyên.

Dashboard xác nhận Workers Free Active, ngân sách CPU10ms. Dry-run sau tối ưu vẫn23ms, preview35ms và management20ms; request thành công chưa chứng minh ổn định. Người quản lý chọn giữ Free ngày08/10, đã lập thiết kế F1–F4 chờ duyệt code; chưa phát sinh phí hoặc code bước mới. Hồ sơ thử ngày07/10 đã hết hạn, cần tạo lại trước review. Xem `docs/steps/38-production-send-preflight.md` và `docs/steps/38-resource-acceptance-plan.md`.


## Bước 38 / F1 — đã hoàn thành phạm vi đọc (08/10/2026)

Giao diện tải summary/danh sách 5 bài/chi tiết và các tab theo nhu cầu; preview khởi tạo, kiểm từng bài rồi đối chiếu snapshot cuối. 418 kiểm thử, 13 kiểm tra ảnh, native D1/workerd và CI Windows/Ubuntu đạt. Runtime 6312d6ea25814c2a5c92def5ba2480ecbd5288bc,schema 14; publisher vẫn tắt/paused, không permit/job/intent/publication/slot. CPU preview 48 mẫu: trung vị 3 / p95 6 / cao nhất 8 ms trong ngân sách Free 10 ms. Các màn hình khác số mẫu ít, toàn production còn cần F2–F4; dry-run 23 ms và mẫu monitor 19 ms chưa sửa. F2 chưa được phê duyệt, chưa code. Báo cáo: docs/steps/38-f1-free-management.md; draft PR11 chưa merge.


## Bước 38 / F2 — hoàn tất phạm vi chuẩn bị (08/10/2026)

Bốn lượt nội dung, R2, Meta GET và chốt hồ sơ sử dụng biên nhận có chữ ký, hạn chuỗi/ngày Việt Nam/snapshot/credential. 429 kiểm thử, 13 kiểm tra ảnh và CI/native 10 kịch bản đạt. Runtime 130a6ff98c9ff4cc4b7d54c330389890396f5fb8 có 39 mẫu CPU F2, mọi pha dưới 10 ms; chi tiết trong docs/steps/38-f2-free-preparation.md. Không migration hoặc quyền/job/POST; publisher tắt/paused. F3 chưa duyệt, chưa code.


### 08/10/2026 — F3: bộ đăng bền vững, chưa rollout

F3 được phê duyệt; HTTP publisher chuyển sang một giai đoạn mỗi tick, journal schema15 opt-in, intent/ngày/Page nguyên tử, POST/GET/chốt evidence tách lượt. Giữ unknown không tự gửi lại; phục hồi finalizer khi pause; stock kiểm từng bài với snapshot SQL. Có thể chuẩn bị trước giờ ba phút, không POST trước due_at. 12 kiểm thử F3 và 18 kịch bản native/mock đạt. Toàn bộ 445 kiểm thử local, TypeScript và 13 kiểm tra ảnh đạt; CI được chốt trên PR F3. Production vẫn F2, schema14, publisher tắt/paused; chưa áp dụng migration/cloud, không tạo credential/permit/job thật hoặc Facebook POST. Báo cáo: docs/steps/38-f3-durable-publisher.md. F4 cần phê duyệt riêng để rollout với cửa đóng và đo CPU, rồi xin duyệt bài thử thật.

### 09/10/2026 — F4 đã duyệt, đang tối ưu và đo cloud

Luồng giả lập sáu pha đạt chức năng, nhưng CPU gửi/monitor và một mẫu finalizer vượt mục tiêu; chưa nghiệm thu. Đang giảm SDK/database overhead và dùng snapshot phê duyệt bất biến để kiểm lại trong SQL. Bản d180a35 đạt 450 kiểm thử và CI Windows/Linux; phiên bản tiếp theo phải kiểm thử/đo lại riêng. Production vẫn F2/schema14 với cửa đóng; không Facebook POST thật hoặc nâng gói. Báo cáo hiện hành: docs/steps/38-f4-cloud-acceptance.md; draft PR14. F4 không cấp phép đăng bài thật.

### 09/10/2026 — kết quả F4 và đề xuất F5 chờ duyệt

Bản47c59d7 đạt455 kiểm thử local, kiểm tra ảnh và CI Windows/Linux37896741427. Cloud clone chạy đúng chức năng nhưng content15/send15/monitor17 ms, chưa đạt ngân sách10 ms; đã dừng đo và xóa hai Worker/mock cùng D1 clone, thu hồi token đo. Giữ backup SQL thật và bằng chứng đã bỏ bí mật. Đọc lại production:40 bài/56 asset/schema14, permit/job/intent/publication0, enabled0/paused1; không rollout. F4 chưa nghiệm thu. Đề xuất runner Node GitHub Actions + API Worker nhỏ tại docs/steps/38-f5-free-runner-proposal.md; F5 chưa duyệt, chưa code, chưa di chuyển secret hay thay cron/main.

### 09/10/2026 — F5 đã duyệt, runner GitHub Actions giả lập

Chủ dự án chọn GitHub Actions theo đề xuất đã lưu, chỉ code/giả lập. Runner Node chỉ nhận HTTP loopback và credential giả; API Worker chưa mount vào production, journal16 opt-in, mặc định vẫn schema14. 467 kiểm thử local và sáu kịch bản compiled workerd/native D1/R2 đạt. Draft PR15 và CI Windows/Linux37904088313 của bản810af6f đạt. Probe f7e1448 claim12ms; giảm hai lượt đọc D1 ở claim, bản810af6f đạt21 pipeline mock nhưng cold data13/status11 và warm proof12ms, chưa nghiệm thu. Ứng viên tiếp dùng CTE proof nguyên tử và so sánh capability cố định không hash dư; kiểm lại race pause/nguồn/version tại thời điểm ghi proof. Kết quả cuối ghi tại docs/steps/38-f5-actions-runner.md. Không Facebook/Telegram thật, không main/cron hoặc rollout production. Quota tài khoản, stock/health/owner schema16 và workflow live cần bước tích hợp đóng được duyệt riêng.

### 09/10/2026 — chốt kết quả F5: chức năng đạt, CPU chưa đạt

Bản1871c88 đạt469 kiểm thử,14 nhóm runner, sáu kịch bản native,13 kiểm tra ảnh và CI Windows/Linux37912824859. Cloud clone hoàn thành121 pipeline mock nhưng claim11ms/data:1 12ms vượt10ms; đã dừng, chưa nghiệm thu. Production kiểm lại giữ40 bài/56 mục thư viện/40 ảnh/schema14, không permit/job/intent/publication, publisher tắt/paused. Worker/D1 clone đã xóa, token đo thu hồi; backup và bằng chứng được giữ. Chưa đăng Facebook/Telegram thật hoặc thay main/cron. Cần xử lý CPU trước chuyển bước; F6 chỉ là đề xuất chưa duyệt.

### 09/10/2026 — tối ưu tiếp F5, dừng tải vì quota D1

Bảnc3bd79a gộp các lượt đọc identity/job/fence và finalize;472 kiểm thử,13 kiểm tra ảnh và CI37941729391 đạt. Cloud150 pipeline mock: CPU warm cao nhất6ms, cold claim9ms, chưa đủ30 warm ở một số nhóm nên chưa nghiệm thu. Các ứng viên trước46c497c/96e053e lần lượt gặp finalize warm11ms/image cold11ms, được giữ riêng. Chủ dự án gửi cảnh báo D1 reads86%; đã ngừng đo, xóa clone/token, kiểm production nguyên trạng40/56/schema14/cửa đóng. Bổ sung receipt quota mới và ngân sách tối đa50 chuỗi đo/ngày, không lặp resume vô hạn; chặn thử khi tài khoản reads>=3 triệu hoặc writes>=50 nghìn. Chưa đo cloud cho guard/filter mới, chưa chuyển F6. Hạn mức trong thông báo reset07:00 Việt Nam10/10; không tự hẹn hoặc chạy tiếp sau reset. Chi tiết tại docs/steps/38-f5-actions-runner.md.

10/10/2026 — F5 tiếp tục trên runtime26294c1, clone riêng đã xóa/token thu hồi. Đúng50 pipeline mock. Đối chiếu export log lưu trữ với tail trước khoảng xuất:mọi nhóm đủ31–77 warm, p95<=4ms/max5ms. Chưa nghiệm thu toàn bộ vì request cold đầu tiên là reset harness11ms, không có API cold cùng deployment. Quota sau đo333.086 reads/4.125 writes toàn tài khoản. F6 chưa mở, không Facebook/Telegram thật, production/main/cron không đổi. Chi tiết trong docs/steps/38-f5-actions-runner.md.

10/10/2026 — theo yêu cầu chạy ngay và tiếp tục, nghiệm thu CPU F5 đạt trên runtime d674430/CF version5b175c38-61ed-4ffe-b608-61e40d81593c:1.618 log cùng deployment,46–96 warm mỗi nhóm, p95 tối đa4ms, CPU tối đa6ms; cold claim5ms/cold finalize6ms. Ngân sách bổ sung50 được lưu riêng, gồm47 pipeline hoàn tất,1 pipeline ngắt,1 reset timeout và1 cold claim; không sửa ledger cũ hoặc bỏ quota guard. Đã sửa lỗi stream/header trong helper giả lập,481 kiểm thử local đạt. Usage722.002 reads/10.449 writes toàn tài khoản; clone Worker/D1/token đã dọn, không gửi thật hoặc đổi production/main/cron. F6 tích hợp đóng là bước đề xuất cần phê duyệt riêng; xem docs/steps/38-f6-closed-integration-proposal.md.
