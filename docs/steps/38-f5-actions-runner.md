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

Ứng viên tiếp theo gộp identity/job/fence/raw data trong một transaction SELECT cho mỗi trang, giữ giới hạn8 dòng và kiểm mới; bỏ đường đọc dữ liệu trùng. 14 nhóm runner đạt, gồm năm nhóm dữ liệu đều không trả rows khi nguồn đổi sau claim. Kết quả cuối cập nhật sau CI và đo cloud đúng release. Chưa có phép mở cửa production từ hồ sơ này. Phạm vi tích hợp đề nghị ở [F6](38-f6-closed-integration-proposal.md) chưa được duyệt.

## Hồ sơ triển khai đóng cho bước tiếp theo

Trước khi kết nối thật phải duyệt một bước riêng: mount API vào entrypoint production và nâng validator schema16, áp dụng migration15/16 khi cửa đóng, tạo capability riêng, thêm workflow live với ref tin cậy và Secret do chủ dự án lưu trực tiếp, kiểm quota thực tế/budget0, sau đó kiểm lại toàn bộ cổng và rollback. Không sao chép secret Meta từ Cloudflare.

`quotaAllowed` hiện là đầu vào giả lập để kiểm fail-closed; chưa đọc billing tài khoản. Monitor Node hiện chỉ trả báo cáo giả lập, chưa gửi cảnh báo hoặc thay monitor đang chạy. Việc tổng hợp stock Node và nối health/owner/warehouse schema16 chưa được kích hoạt; phải hoàn tất và kiểm thử ở bước tích hợp đóng trước bật lịch. Giữ lịch chính thức một bài/ngày10:00 Việt Nam và cơ chế gửi thủ công riêng; F5 không tạo lịch mới.

Điều kiện nghiệm thu cloud giữ nguyên: mỗi API/nhóm dữ liệu ít nhất30 warm đúng release, cold/p95/max/outcome, ngân sách10ms; dừng nếu vượt. Đo cloud thất bại thì chỉ công nhận kết quả code/giả lập, chưa được triển khai production.
