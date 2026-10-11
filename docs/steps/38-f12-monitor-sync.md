# F12 — Đồng bộ giám sát khi cổng đăng đóng

Chủ dự án đã phê duyệt F12: đối chiếu credential GitHub/Worker, tích hợp xác minh Meta từ Node và phân biệt heartbeat của vận hành đang bật với trạng thái chủ động tắt. Kiểm thử quota, pause, token rotation và lỗi kết nối. Không cấp permit, không đăng Facebook, không bật lịch production.

## Thiết kế

API monitor có xác thực trả release và SHA-256 của cấu hình Meta (App ID, App Secret, Page ID, Page token, API version, purpose). Không trả secret và không ghi chứng nhận Meta vào D1. Dấu vân tay không tự cấp quyền đăng.

Workflow monitor chỉ main, checkout đúng SHA, dùng environment production-runner đã hạn chế nhánh main. Secret Meta chỉ đưa vào bước production. Node kiểm tra context/run identity qua GitHub, policy tháng đúng SHA và quota mới giữ 600 phút dự phòng; đối chiếu hash trước tối đa hai Graph GET. Sau GET, đọc lại Worker để phát hiện rotation hoặc đổi release. Proof chỉ dùng trong lượt chạy hiện tại, thời hạn dưới hai phút, không tái dùng receipt F11 hay ghi heartbeat giả. Không lấy hoặc sao chép secret giữa hai dịch vụ. Nếu hash khác, owner tự thay credential ở đích sai trước khi kiểm lại.

`PRODUCTION_OPERATIONS_EXPECTED=false` biểu thị tác vụ vận hành production8595718 được chủ động giữ tắt trong giai đoạn đóng. Chỉ bỏ yêu cầu heartbeat khi schema16, enabled0, paused1, engine runner/closed, permit/publication0 và các cổng deployment/database/owner approval đều false. Giá trị true hoặc chưa xác nhận vẫn yêu cầu heartbeat20 phút; giá trị sai hoặc trạng thái mở gây lỗi. HTTP source selection vẫn đối chiếu, queue blocked/dispatch failure/publication unknown vẫn cảnh báo. Tạm dừng đăng bài không tự suy ra tắt Telegram operations.

Không đổi migration, nội dung, ảnh, UI, runner publish protocol hoặc lịch Tập Viết. Nhịp monitor giữ daily10:30 và fallback Chủ nhật10:45. Giám sát này vẫn phục vụ phase đóng; chuyển sang vận hành mở phải được nghiệm thu riêng.

## Kiểm thử và rollout

Đã đạt54 kiểm thử tập trung và528 full local; typecheck đạt. Native workerd/D1 chạy Worker management thật đã biên dịch, schema16, credential fixture8 KB,401 khi thiếu token,4 đọc có xác thực, provider calls0, dữ liệu Meta check/permit/job/attempt/publication/outbox0. Native test được thêm vào CI Ubuntu. Một fixture ban đầu ở schema14 đã được sửa thành schema16 và kiểm lại đạt; wrapper đã dọn cả lượt thất bại.

Trước rollout: quota account mới và allowance CI70 phút ngoài reserve600; CI Windows/Linux đúng SHA; đo lại CPU cloud trên clone riêng với cổng đóng/fixture secrets; cleanup clone; policy owner tháng được xác nhận lại đúng SHA cuối; backup/readback trạng thái40 bài/56 tệp/schema16 và cổngfalse. Không dùng kết quả CPU F7 làm bằng chứng cho thay đổi Worker này.

Sau rollout đóng: đồng bộ main/Worker/policy/release; đặt operations expectedfalse theo tác vụ vận hành hiện tắt; kiểm monitor thật bằng GET, đối chiếu credential và receipt. Giữ cron vận hành/publishing tắt. Nếu hash lệch, cần owner thay token trực tiếp; không tự coi credential GitHub đã kiểm F11 là credential Worker đã khớp.

Trạng thái sau triển khai 11/10: main, hai Worker và policy cùng SHA 3ca7d0bd9a6fe48a9a81e45027ada89623de5765. CI PR38117594819 và main38118585335 đạt Windows/Linux; staging deploy skipped và gate đã trả true. CPU cloud36 mẫu (1 cold/35 warm) tối đa6 ms, outcome ok; clone đã xóa. Backup590121 byte phục hồi thử integrity/fk/state đạt. Policy owner giữ0USD/Stop usage/reserve600/expiry01-11 07:00 Việt Nam/no auto-renew. Monitor38118727377 chỉ còn meta: META_CONFIGURATION_MISMATCH, configurationMatchedfalse/graphGets0/notified0; heartbeat đã hết trong trạng thái operations expectedfalse. Chờ owner đồng bộ hai secret Meta trên Worker với GitHub rồi kiểm lại. Không coi F12 hoàn tất; giữ mọi cổng gửi/lịch tắt, 40 bài/56 assets/schema16/0 permit/job/attempt/publication.

### Kiểm lại sau owner cập nhật Cloudflare
Run38119125686 tại SHA F12 vẫn META_CONFIGURATION_MISMATCH, graphGets0/notified0, không FacebookPOST. Đối chiếu trực tiếp bốn biến công khai Meta (App/Page/API/purpose) đạt; không đọc giá trị secret. Quota1292 phút, giữ600, khả dụng108. Owner được yêu cầu cập nhật hai Environment secrets trong GitHub production-runner bằng đúng giá trị vừa dùng tại Cloudflare. Không chạy lại cho đến khi có thay đổi credential; F12 chưa nghiệm thu cuối. Bằng chứng lần mismatch đầu được giữ riêng, lần sau trong monitor-receipt.json và meta-config-read.json.

### Kiểm lại sau xác nhận cập nhật GitHub
Run38119240095 vẫn META_CONFIGURATION_MISMATCH/graphGets0/notified0. API metadata environment production-runner vẫn giữ updated_at App Secret03:33:28UTC và Page token05:05:16UTC; repository không có hai tên secret này. Chưa thấy thay đổi được lưu tại environment đích. Không tiếp tục chạy monitor lặp lại khi metadata chưa đổi; cần owner dùng đúng trang environment và Update secret. Không đọc credential hoặc tự di chuyển secret. Cổng production vẫn đóng, không đăng Facebook.

## F12 hoàn tất trong phạm vi production đóng — 11/10/2026
Owner đã lưu cả hai secret environment production-runner lúc13:51–13:52 Việt Nam. Run38119496336 tại SHA3ca7d0bd9a6fe48a9a81e45027ada89623de5765 thành công lúc13:53:06 Việt Nam: configurationMatchedtrue, verified_read_only/META_READ_ONLY_VERIFIED, hai GraphGET, đọc lại Worker để bắt rotation đạt; issues[]/notified[]/notificationFailedfalse. Hai nơi đã khớp cấu hình Meta và xác minh đúng Page/quyền/token theo verifier. Không FacebookPOST hoặc Telegram gửi mới; các receipt mismatch trước được giữ nguyên làm bằng chứng.
Kiểm readback cuối:40 bài/56 assets/schema16; permit/job/attempt/publication0; enabled0/paused1; Actionsfalse, runner/status503 do cổng đóng, hai Worker không cron. CI PR/main đạt Windows/Linux, staging gate đã trảtrue, policy tháng đã xác nhận cho F12 (0USD/Stop usage/reserve600/expiry01-11 07:00 Việt Nam/no auto-renew). CPU36 mẫu tối đa6ms; backup phục hồi thử đạt. Quota API có độ trễ: lượt monitor ghi1292 phút/reserve600/còn108, không bảo đảm quota không đổi sau đó.
F12 nghiệm thu hoàn tất cho phase đóng, không suy ra UI/D1 Meta checkbox đã verified hoặc cho phép phase mở. Hồ sơ tmp/step38/f12/acceptance.json cùng receipt/log/backup được giữ; fixture/cache từng lượt đã tự dọn. Tài liệu kết thúc giữ local để không tạo SHA mới sau policy. Bước tiếp theo cần phê duyệt riêng: chuẩn bị quyền có giới hạn và đăng một bài production thật vào thời điểm gần nhất; sau nghiệm thu mới xét bật lịch10:00 một bài/ngày. Chưa tự cấp permit hoặc bật cổng/lịch.
