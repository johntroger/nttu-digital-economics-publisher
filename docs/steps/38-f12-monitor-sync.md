# F12 — Đồng bộ giám sát khi cổng đăng đóng

Chủ dự án đã phê duyệt F12: đối chiếu credential GitHub/Worker, tích hợp xác minh Meta từ Node và phân biệt heartbeat của vận hành đang bật với trạng thái chủ động tắt. Kiểm thử quota, pause, token rotation và lỗi kết nối. Không cấp permit, không đăng Facebook, không bật lịch production.

## Thiết kế

API monitor có xác thực trả release và SHA-256 của cấu hình Meta (App ID, App Secret, Page ID, Page token, API version, purpose). Không trả secret và không ghi chứng nhận Meta vào D1. Dấu vân tay không tự cấp quyền đăng.

Workflow monitor chỉ main, checkout đúng SHA, dùng environment production-runner đã hạn chế nhánh main. Secret Meta chỉ đưa vào bước production. Node kiểm tra context/run identity qua GitHub, policy tháng đúng SHA và quota mới giữ 600 phút dự phòng; đối chiếu hash trước tối đa hai Graph GET. Sau GET, đọc lại Worker để phát hiện rotation hoặc đổi release. Proof chỉ dùng trong lượt chạy hiện tại, thời hạn dưới hai phút, không tái dùng receipt F11 hay ghi heartbeat giả. Không lấy hoặc sao chép secret giữa hai dịch vụ. Nếu hash khác, owner tự thay credential ở đích sai trước khi kiểm lại.

`PRODUCTION_OPERATIONS_EXPECTED=false` biểu thị tác vụ vận hành production8595718 được chủ động giữ tắt trong giai đoạn đóng. Chỉ bỏ yêu cầu heartbeat khi schema16, enabled0, paused1, engine runner/closed, permit/publication0 và các cổng deployment/database/owner approval đều false. Giá trị true hoặc chưa xác nhận vẫn yêu cầu heartbeat20 phút; giá trị sai hoặc trạng thái mở gây lỗi. HTTP source selection vẫn đối chiếu, queue blocked/dispatch failure/publication unknown vẫn cảnh báo. Tạm dừng đăng bài không tự suy ra tắt Telegram operations.

Không đổi migration, nội dung, ảnh, UI, runner publish protocol hoặc lịch Tập Viết. Nhịp monitor giữ daily10:30 và fallback Chủ nhật10:45. Giám sát này vẫn phục vụ phase đóng; chuyển sang vận hành mở phải được nghiệm thu riêng.

## Kiểm thử và rollout

Đã đạt54 kiểm thử tập trung và527 full local; typecheck đạt. Native workerd/D1 chạy Worker management thật đã biên dịch, schema16, credential fixture8 KB,401 khi thiếu token,4 đọc có xác thực, provider calls0, dữ liệu Meta check/permit/job/attempt/publication/outbox0. Native test được thêm vào CI Ubuntu. Một fixture ban đầu ở schema14 đã được sửa thành schema16 và kiểm lại đạt; wrapper đã dọn cả lượt thất bại.

Trước rollout: quota account mới và allowance CI70 phút ngoài reserve600; CI Windows/Linux đúng SHA; đo lại CPU cloud trên clone riêng với cổng đóng/fixture secrets; cleanup clone; policy owner tháng được xác nhận lại đúng SHA cuối; backup/readback trạng thái40 bài/56 tệp/schema16 và cổngfalse. Không dùng kết quả CPU F7 làm bằng chứng cho thay đổi Worker này.

Sau rollout đóng: đồng bộ main/Worker/policy/release; đặt operations expectedfalse theo tác vụ vận hành hiện tắt; kiểm monitor thật bằng GET, đối chiếu credential và receipt. Giữ cron vận hành/publishing tắt. Nếu hash lệch, cần owner thay token trực tiếp; không tự coi credential GitHub đã kiểm F11 là credential Worker đã khớp.

Trạng thái hiện tại: mã local/native đạt; CI, CPU cloud, owner attestation SHA mới và nghiệm thu monitor thật còn chờ. F12 chưa hoàn tất và chưa có phê duyệt gửi bài thật.
