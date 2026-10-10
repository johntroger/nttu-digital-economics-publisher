# F5 — runner Node và API Worker, phạm vi giả lập

Ngày 09/10/2026. Phê duyệt của chủ dự án: «GitHub Actions: theo đề xuất F5 đã lưu»; chỉ code và kiểm thử giả lập, chưa đăng Facebook. Nhánh `codex/step38-f5-actions-runner` kế thừa F4; chưa merge main hoặc triển khai vào Worker production/staging.

## Phần đã thực hiện

`scripts/production-actions-runner.mjs` thực hiện kiểm nội dung đã duyệt, PNG/checksum, kiểm kết nối Meta giả lập, multipart POST, GET đối soát và callback từ Node. Client chỉ cho phép HTTP loopback, dùng credential giả cố định; không đọc secret môi trường, không có chế độ gửi thật. Runner kiểm ngân sách ba phút tại các checkpoint và giữ lại intent khi bị ngắt; giới hạn này chưa phải một watchdog toàn tiến trình. Workflow giả lập có timeout năm phút. Workflow live sau này phải có giới hạn cứng phù hợp ngân sách.

`src/production/runner-api.ts` cung cấp claim, dữ liệu phân trang tối đa tám dòng, stream ảnh R2, proof, intent, authorize một lần, evidence và finalize. D1 quyết định Page, đồng hồ, quyền gửi, ngày, revision/generation, lease và snapshot nguồn/phê duyệt. API không nhận Page, caption, SQL hoặc thời gian thay thế từ caller. Token monitor chỉ đọc status; token trigger và publisher không được thao tác runner.

Journal16 opt-in lưu session và grant. Mặc định migration vẫn dừng ở14. Rollback phải chạy transaction và bị từ chối khi còn job hoặc bằng chứng chưa giải quyết. API chưa được mount trong Worker production; không có cấu hình production được bật bởi thay đổi này.

Khóa D1 quyết định quyền gửi, cùng với GitHub concurrency. Intent được ghi trước outbound, grant chỉ sử dụng một lần. Khi bị ngắt sau intent, phục hồi chỉ GET; nếu không có remote ID, giữ unknown để xử lý bằng hồ sơ riêng. Hint được lưu trước GET. Callback lặp không tạo usage/outbox lần hai; finalize vẫn phục hồi được khi đang pause. Một lần gửi đã được authorize vẫn có khoảng đua với pause trên dịch vụ ngoài; không cam kết exactly-once giữa Meta và D1.

Workflow `runner-simulation.yml` chỉ chạy thủ công, không có schedule, secret hay deployment. CI trên PR chạy kiểm thử portable Windows/Linux và native D1/R2 trên Linux. Workflow manual mới chưa được đưa vào main; không bật publisher hoặc thay cron hiện hành để chạy thử nó.

## Kiểm thử và bằng chứng

HTTP mock đọc multipart thực tế, kiểm caption, cờ published và byte PNG. Bao gồm cạnh tranh hai runner, pause/revoke trước và sau intent, đổi nguồn/version/generation/release, crash ở sáu điểm, mất/lặp/giả callback, lỗi finalize transaction, retry sau năm phút, timeout/đối soát sai, lease hết hạn, lệch ngày, quota bị chặn và ảnh hỏng.

Native smoke biên dịch Worker và chạy workerd + D1/R2 cục bộ; Worker không được outbound. Sáu kịch bản tích hợp đạt. SQL authorize ban đầu vượt giới hạn độ sâu biểu thức D1; chuyển sang CTE trong cùng statement nguyên tử và kiểm lại race pause/runner cạnh tranh.

Kho fixture giữ40 bài và toàn bộ asset đã nhập fixture; fixture không đại diện cho mọi56 asset production. Đo cloud riêng dùng bản sao SQL schema14 có40 bài/56 asset; bản gốc và bucket production chỉ đọc. Mọi POST Meta trong thử nghiệm là mock loopback; không gửi Telegram thật. Không coi thời gian chạy cục bộ là CPU cloud hoặc phút tính phí GitHub.

467 kiểm thử local và sáu kịch bản native đạt; CI Windows/Linux của `810af6f` đạt tại run37904088313. Probe `f7e1448` hoàn thành một pipeline mock nhưng claim12ms. Relay HTTP ban đầu giữ header nén sau khi Node đã giải nén; đã sửa header, lỗi kết nối này không được tính là kết quả CPU.

Bản `810af6f` giảm hai round trip D1 ở claim, max warm8ms. Lượt đo `mock-1791534267322` đã hoàn thành21 pipeline mock, giữ40 bài/56 mục thư viện, nhưng data cold13ms, proof warm12ms và status cold11ms. Bộ đo dừng ngay; chưa đủ30 warm mỗi API, không nghiệm thu hoặc gộp mẫu với ứng viên sau. Các mẫu cold phát sinh cả giữa chuỗi request khi Cloudflare khởi tạo isolate mới; không bỏ chúng để báo cáo đẹp hơn.

`88396a3` dùng CTE nguyên tử cho proof, kiểm version/snapshot/gate ngay trong UPDATE và giảm hai lượt đọc; token capability cố định64 ký tự được so sánh đủ64 vị trí thay vì hash hai lần. 468 kiểm thử,13 nhóm runner và native đạt; CI Windows/Linux37906088097 đạt. Lượt `mock-1791535402823` hoàn thành61 pipeline mock nhưng dừng vì claim warm11ms; còn thiếu30 warm ở một số API. Không nghiệm thu, không gộp mẫu.

`e5530e0` đọc job ngay trong transaction claim, chỉ lấy bốn cột permit cần dùng và cache chuỗi SQL snapshot; kết quả dữ liệu/phê duyệt và thời gian vẫn được đọc mới. 468 kiểm thử/native và CI37908445760 đạt. Lượt `mock-1791536848585` bị ngắt khi OAuth đọc tail hết hạn; tiếp tục cùng CF version58c86fe6 trong `mock-1791537164375`, giữ mẫu đúng deployment và ghi riêng gap hạ tầng. Lượt tiếp tục hoàn thành42 pipeline mock nhưng data cold13/11ms, chưa đạt. Helper đã bổ sung refresh OAuth, thu hồi tail bị bỏ lại và lưu kết quả ngay cả khi cleanup tail lỗi.

Ứng viên cuối `1871c88765607142803930fe746e992e921c2b1b` gộp identity/job/fence/raw data trong một transaction SELECT cho mỗi trang, giữ giới hạn8 dòng và kiểm mới; bỏ đường đọc dữ liệu trùng. 469 kiểm thử local,14 nhóm runner, sáu kịch bản native và13 kiểm tra ảnh đạt. CI Windows/Linux37912824859 đạt. Năm nhóm dữ liệu đều không trả rows khi nguồn đổi sau claim.

Lượt `mock-1791539425707`, CF version `b69cef87-9e1b-4abc-ac0e-401799f1c1f2`, hoàn thành121 pipeline mock nhưng claim warm11ms và data:1 warm12ms. Đã dừng theo tiêu chí10ms; HTTP thành công không thay thế nghiệm thu CPU. Không gộp mẫu với phiên bản trước hoặc tiếp tục đo sau khi vượt ngân sách.

| Pha | Mẫu warm | p95 CPU (ms) | Max warm CPU (ms) |
| --- | ---: | ---: | ---: |
| claim | 65 | 6 | 11 |
| data:0 | 42 | 5 | 7 |
| data:1 | 31 | 4 | 12 |
| data:2 | 33 | 4 | 5 |
| data:3 | 55 | 3 | 3 |
| data:4 | 29 | 2 | 2 |
| image | 43 | 6 | 9 |
| proof | 39 | 7 | 8 |
| intent | 51 | 7 | 9 |
| authorize | 40 | 4 | 6 |
| evidence | 71 | 7 | 8 |
| finalize | 30 | 8 | 8 |
| status | 68 | 3 | 3 |

Nhóm data:4 còn thiếu một mẫu warm; không coi bảng này là đã đủ mẫu nghiệm thu. Tail và summary giữ tại `tmp/step38/f5/mock-1791539425707-*`; số mẫu được quan sát không đại diện mọi request hoặc mọi lần khởi tạo isolate trong tương lai.

Đọc lại production sau đo:40 bài,56 mục thư viện,40 ảnh, schema14, permit/job/intent/publication0, enabled0/paused1. Đã xóa Worker/D1 clone riêng và thu hồi token đo; giữ backup SQL thật và bằng chứng. Facebook/Telegram thật đều0, production/staging/main/cron không đổi. F5 hoàn thành phần code và kiểm thử chức năng giả lập, **chưa đạt nghiệm thu CPU và chưa sẵn sàng rollout**. Cần xử lý phần vượt ngân sách trước khi chuyển bước. Phạm vi tích hợp đề nghị ở [F6](38-f6-closed-integration-proposal.md) chưa được duyệt.

## Hồ sơ triển khai đóng cho bước tiếp theo

### Tiếp tục xử lý CPU và cảnh báo D1 — 09/10/2026

`46c497c` gộp các lượt đọc claim và giảm data từ bốn SELECT xuống hai; thêm kiểm thử gate đọc. CI37936548457 đạt,470 kiểm thử đạt. Lượt `mock-1791552561817` hoàn thành131 pipeline: claim64 warm/max4ms, nhưng finalize warm11ms; dừng, không nghiệm thu.

`96e053e` gộp identity/job/evidence của finalize trong một SELECT, giữ transaction chốt và kiểm thử receipt sai/lặp/phục hồi khi pause. CI37939122212 và471 kiểm thử đạt. Claim cold9ms; lượt `mock-1791553824957` dừng vì image cold11ms. Không gộp các mẫu này vào phiên bản sau.

`c3bd79a7fa99eeecd3f4f91262e9e8f08a272477` gộp identity và leased job cho image/proof/intent/authorize/evidence; image đọc fence trong cùng SELECT và chỉ lấy cột cần dùng. Kiểm thử mới xác nhận không đọc R2 khi pause/nguồn/permit thay đổi. 472 kiểm thử,13 kiểm tra ảnh và CI Windows/Linux37941729391 đạt; CI có sáu kịch bản compiled workerd/native D1/R2.

CF version `e8cf7dcb-2859-466f-98f1-710923a73b02`, deployment3. Cold claim9ms. Lượt `mock-1791555199839` hoàn thành150 pipeline mock, mọi mẫu API quan sát được trong ngân sách nhưng **chưa đủ30 warm ở mọi nhóm**:

| Pha | Mẫu warm | p95 CPU (ms) | Max warm CPU (ms) |
| --- | ---: | ---: | ---: |
| claim | 72 | 3 | 5 |
| data:0 | 30 | 3 | 6 |
| data:1 | 25 | 2 | 3 |
| data:2 | 18 | 2 | 2 |
| data:3 | 49 | 3 | 4 |
| data:4 | 25 | 2 | 3 |
| image | 28 | 2 | 3 |
| proof | 25 | 3 | 3 |
| intent | 27 | 5 | 5 |
| authorize | 13 | 3 | 3 |
| evidence | 50 | 4 | 5 |
| finalize | 19 | 4 | 4 |
| status | 29 | 3 | 3 |

Người quản lý gửi email cảnh báo D1 đã dùng86% hạn mức đọc5 triệu dòng/ngày. Clone dùng chung quota tài khoản; việc lặp pipeline để đo tạo tải đáng kể, nhưng chưa có số liệu analytics phân bổ toàn bộ mức86% riêng cho F5. Đã ngừng đo, không chạy lượt resume dự kiến, xóa Worker/D1 clone và token. Production kiểm lại giữ40 bài/56 mục thư viện/40 ảnh/schema14, permit/job/intent/publication0, enabled0/paused1. Facebook/Telegram thật0.

Theo [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), hạn mức Free reset00:00UTC; thông báo chỉ mốc10/10/2026, tức07:00 Việt Nam. Không nâng gói trả phí. **F5 chưa nghiệm thu và F6 chưa mở**; đây là thiếu mẫu/quota, không phải mẫu CPU vượt10ms trong bản c3bd79a. Không dùng mẫu deployment đã xóa để nghiệm thu một deployment mới.

Bộ đo được bổ sung guard local: cần receipt mức sử dụng toàn tài khoản từ Cloudflare, đúng ngày UTC và mới không quá5 phút; chặn khi reads>=3 triệu hoặc writes>=50 nghìn để dành dư địa vận hành. Tối đa50 chuỗi đo/ngày UTC, ledger dùng chung qua các phiên bản, đặt chỗ trước network và không hoàn lại sau lỗi. Đây là giới hạn chuỗi và ngưỡng tài khoản, **chưa phải bộ đếm chính xác rows_read của từng SQL**. Không tự tạo receipt giả từ email cảnh báo; phải đọc dashboard/analytics mới trước lần chạy sau. Tail filter0.999 được cấu hình cho lần đo sau, chưa kiểm chứng cloud trong ngày này. Nếu vẫn thiếu mẫu thì giữ trạng thái chưa nghiệm thu, không lặp vô hạn.

Đã khóa allowance ngày09/10 vì các lượt trước vượt mức50 mới đặt. Bước tiếp theo trong F5 là xác minh quota sau reset, giảm tải/lấy mẫu theo ngân sách, đo đủ trên deployment mới trước khi xin chuyển F6. Guard được kiểm thử local/CI, không tạo thêm tải D1 để kiểm nó.

Trước khi kết nối thật phải duyệt một bước riêng: mount API vào entrypoint production và nâng validator schema16, áp dụng migration15/16 khi cửa đóng, tạo capability riêng, thêm workflow live với ref tin cậy và Secret do chủ dự án lưu trực tiếp, kiểm quota thực tế/budget0, sau đó kiểm lại toàn bộ cổng và rollback. Không sao chép secret Meta từ Cloudflare.

`quotaAllowed` hiện là đầu vào giả lập để kiểm fail-closed; chưa đọc billing tài khoản. Monitor Node hiện chỉ trả báo cáo giả lập, chưa gửi cảnh báo hoặc thay monitor đang chạy. Việc tổng hợp stock Node và nối health/owner/warehouse schema16 chưa được kích hoạt; phải hoàn tất và kiểm thử ở bước tích hợp đóng trước bật lịch. Giữ lịch chính thức một bài/ngày10:00 Việt Nam và cơ chế gửi thủ công riêng; F5 không tạo lịch mới.

Điều kiện nghiệm thu cloud giữ nguyên: mỗi API/nhóm dữ liệu ít nhất30 warm đúng release, cold/p95/max/outcome, ngân sách10ms; dừng nếu vượt. Đo cloud thất bại thì chỉ công nhận kết quả code/giả lập, chưa được triển khai production.

### Đo giới hạn và đối chiếu log lưu trữ — 10/10/2026

Runtime `26294c11d58cb03ce6515256766100f2f2bfd3ea`, CI37945583227 đạt. Đọc analytics D1 toàn tài khoản qua GraphQL sau reset:7.290 rowsRead/111 rowsWritten. Tạo clone riêng `nttu-f5-cpu-5f24b8329e`, D1 `cee87fed-a08f-44c9-8130-e1316110c7a4`, CF version `ac88893e-924f-4ca0-88cb-66f97a6869f4`. Không dùng mẫu từ deployment trước.

Lượt `mock-1791601509073` kết thúc đúng50 pipeline mock, Facebook/Telegram thật0. Tail filter0.999 vẫn không đủ mẫu, nên bộ đo trả `F5 warm sampling incomplete`. Analytics sau lượt đo ghi333.086 rowsRead/4.125 rowsWritten toàn tài khoản (có độ trễ cập nhật; không quy toàn bộ mức tăng cho clone).

API log lưu trữ trả403 thiếu quyền. Dashboard đang đăng nhập hiển thị1.700 sự kiện/0 lỗi. Xuất JSON từ dashboard được1.000 sự kiện mới nhất; file gốc giữ riêng trên máy, không đưa vào Git. Bộ phân tích `scripts/f5-telemetry.mjs` ghép invocation/custom marker theo requestId, kiểm Worker/CF version/deployment/path, không giữ headers/body. Chỉ bổ sung tail nằm trước timestamp nhỏ nhất của bản xuất ít nhất1 giây; loại khoảng chồng lấn và request trùng. Không chạy thêm pipeline để lấy các mẫu này. Bằng chứng hẹp và checksum bản xuất ở `tmp/step38/f5/persisted-26294c1-analysis.json`.

| Pha | Warm | p95(ms) | Max(ms) |
| --- | ---: | ---: | ---: |
| claim | 43 | 4 | 4 |
| data:0 | 32 | 3 | 4 |
| data:1 | 31 | 2 | 3 |
| data:2 | 31 | 2 | 3 |
| data:3 | 68 | 2 | 3 |
| data:4 | 36 | 3 | 3 |
| image | 32 | 4 | 4 |
| proof | 31 | 3 | 5 |
| intent | 31 | 4 | 4 |
| authorize | 31 | 3 | 4 |
| evidence | 77 | 3 | 4 |
| finalize | 31 | 4 | 4 |
| status | 62 | 2 | 3 |

**Warm đủ ít nhất30 ở mọi nhóm, không có mẫu API vượt10ms trong bằng chứng này. F5 vẫn chưa nghiệm thu toàn bộ.** Cold đầu tiên của lượt đo là `/reset` của harness, CPU11ms/outcomeok; không phải API runner và không được thay thế mẫu API cold. Các API runner trong lượt này đều warm. Không lấy cold9ms của deployment cũ để chốt deployment mới.

Đã xóa clone Worker/D1 và token; giữ bằng chứng, backup thật, nội dung gốc và ledger ngày10/10 đã đặt đủ50 chuỗi. Production/staging/main/cron không đổi. Mã bộ phân tích có kiểm thử tương quan, dữ liệu trùng/cũ, khoảng chồng lấn và CPU vượt kể cả invocation mất marker.

Lượt đo tiếp theo cần sửa bước chuẩn bị: seed fixture trực tiếp trên D1 clone trước request đầu tiên, thu API cold trước khi `/reset` làm nóng isolate, rồi chạy warm trong cùng ngân sách50 chuỗi và cùng deployment. Ưu tiên log lưu trữ khi tail thiếu mẫu; nếu cần quyền đọc log mới thì người quản lý phải cấp rõ phạm vi. Không tự nâng gói, tăng tải, đặt lịch chạy lại hoặc mở F6 khi thiếu cold.
