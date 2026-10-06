# Bước 19 — điều phối D1 và kiểm thử giả lập

Ngày 06/10/2026. Người quản lý phê duyệt Bước 19 và chọn
“Luồng điều phối cloud và kiểm thử giả lập (khuyến nghị)”.

## Phạm vi

Nền điều phối bất đồng bộ dùng D1 prepare/batch; kiểm thử bằng bộ đăng không có
transport mạng và cơ sở dữ liệu riêng. FakeCloudPublisher chỉ nhận đích fixture:,
runner yêu cầu APP_ENV=test, INTEGRATION_MODE=fake, identity của kho kiểm thử.
Schema fixture_flow_* được cài vào D1 local riêng khi chạy kiểm thử, không nằm
trong 13 migration staging. Không có dữ liệu giả nhập vào lịch sử/kho bài thật.
Bundle Worker không chứa engine giả lập hoặc schema fixture.

Staging có GET /api/workflow riêng cho phiên Google owner, hiển thị trong tab
Lịch đăng. Đây là kiểm tra điều kiện chỉ đọc: số bài/cấu trúc/rà soát, lịch 10h,
múi giờ Việt Nam, giới hạn thử lại. Bài đã rà soát chưa được cấp quyền đăng;
eligibleToPublish=0 khi Meta và bộ đăng thật chưa có. POST trả 405, anonymous
và health bearer trả 401. Không có nút bật giả lập trên staging.

## Quy tắc đã kiểm thử

- Ngày bắt đầu rõ ràng; trước 10h không gửi. Mỗi ngày thực tế tối đa một bài
  của hệ thống, không dựa vào bài quản trị viên đăng thủ công.
- Claim và intent D1 có điều kiện/gate; batch nguyên tử. Không giữ transaction
  qua await gọi adapter. Snapshot caption có ============ và footer, ảnh/checksum
  bất biến. Kiểm tra lại eligibility, version và pause trước intent.
- Hai tick đồng thời chỉ tạo một intent/lần gửi. Intent mất tiến trình hoặc mất
  phản hồi chuyển unknown, giữ gate, không gửi lại và không lấy dự phòng.
- Chỉ kết quả thất bại xác minh retryable mới thử lại; đợi 5 phút, tối đa ba
  attempt. Sau đó giữ bài needs_review và lấy dự phòng ngay trong ngày. Ưu tiên
  cùng chủ đề/đối tượng, có thể sang chủ đề khác. Dự phòng lỗi có thể lấy tiếp;
  budget 16 vòng/tick lưu tiến độ để lượt sau tiếp tục.
- Lỗi kết nối global dừng đường đăng, không tiêu dự phòng. Pause/bảo trì chặn
  quyền gửi mới; không hủy bằng chứng của intent đã commit.
- Ngày bỏ lỡ hết hạn, bài chưa dùng thành dự phòng qua projection. Retry cũ
  được giữ để sửa; không dồn lịch cũ vào ngày mới. Qua nửa đêm sau intent giữ
  unknown, không gửi. Xác nhận muộn ghi usage theo ngày thực tế và bảo vệ ngày đó.
- Receipt/history/usage/outbox cùng batch. D1 rollback không tạo lịch sử hoặc
  thông báo thành công nếu giao dịch thất bại. Mã remote và thời gian giả sai
  không được coi là đăng thành công. Đối chiếu fixture idempotent.
- Kho còn ba bài hợp lệ phát cảnh báo một lần theo đợt; kho rỗng dừng. Bổ sung
  kho không tự tiếp tục và không tạo bài bằng AI. Outbox fixture có template
  published/post_failed/needs_reconciliation/stock_low/stock_empty/connection_error/
  reserve_empty tương thích Telegram, nhưng không gửi tin giả đến bot thật.

## Kiểm thử và bằng chứng

17 ca tích hợp Node/SQLite dành riêng cho workflow đạt. Sáu ca trên D1/workerd
local đạt: cạnh tranh, retry/dự phòng, đối chiếu muộn, crash sau send, rollback
D1 thật, auth và cô lập staging. Bộ kiểm thử cloud đầy đủ gồm D1/R2, OAuth,
Telegram native fetch và bundle không chứa fake harness đạt.
22 kiểm tra giao diện cloud đạt, gồm desktop/mobile và trạng thái Lịch đăng.
Bằng chứng riêng ngoài Git: tmp/step-19/d1-results.json, browser-results.json,
workflow-desktop.png, workflow-mobile.png.

Toàn bộ 237 Node/SQLite/HTTP tests và 9 kiểm tra ảnh đạt ở pre-push. Release
d563017b8d37f14539d0db0abf57900bb3f83254 qua CI Windows/Ubuntu và triển khai
staging thành công (Actions run 37406369014). Nghiệm thu thật ngày 06/10:
41 đường dẫn private trả 401, health bearer không đọc được owner workflow;
40 đề cương/21 tài nguyên/13 PDF chuẩn giữ checksum, không có bảng fixture,
0 publish_jobs/publications và publish endpoint vẫn 501. Lịch đang dừng.
Bằng chứng riêng: tmp/step-19/remote-evidence.json.

Chạy riêng: npm run test:cloud:workflow. CI Ubuntu gọi từ npm run test:cloud;
Node portable chạy suite mới trên Ubuntu/Windows. Không thêm dependency.
Snapshot backup nội dung vẫn schema v12; không thay migration/checksum gốc.

## Giới hạn trước kết nối thật

Đây là nền workflow được kiểm thử với D1 local và adapter giả, chưa phải bộ đăng
Meta thật. Engine fixture chưa nối vào cron/live database; chuyển sang đích thật
cần adapter, schema nghiệp vụ/receipt và cổng quyền môi trường được kiểm thử
riêng. Không dùng fixture receipt làm bằng chứng Facebook.
Chưa tự sửa nội dung bằng Gemini, chưa kiểm tra bài bị xóa trên Facebook lúc 8h,
chưa dựng kho 40 bài ready và chưa bật lịch. Tình trạng R2/Google/Telegram thật
giữ theo các bước trước. Không triển khai Bước 20 khi chưa được phê duyệt.
