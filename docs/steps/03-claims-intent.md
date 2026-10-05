# Bước 3 — giữ lượt, quyền xử lý và ghi intent

Ngày: 05/10/2026. Phê duyệt đầu vào: “phê duyệt bước 3”.
Trạng thái: hoàn thành phạm vi local và kiểm thử đạt; dừng trước bước 4.

## Kết quả đã xây

- Giao dịch SQLite BEGIN IMMEDIATE giữ job, phiên bản bài, slot và page gate cùng lúc.
  Kiểm tra lại eligibility trong giao dịch, không dùng kết quả kho cũ để cấp quyền.
  Claim thất bại hoặc cập nhật điều kiện trả 0 dòng rollback toàn bộ, không để job/khóa phụ.
- Snapshot bất biến gồm caption đã nối footer, checksum, phiên bản footer, asset ID/key/size
  và check_version. Sửa active version, chặn nguồn/ảnh hoặc QA không còn hợp lệ sẽ chặn intent.
- Owner token, generation và lease 120 giây phối hợp trên job/page gate.
  Owner còn hạn không bị tiến trình khác thay thế. Held hết hạn chỉ được nhận quyền lại khi không có attempt;
  quyền cũ không thể ghi intent sau takeover. Lease là lựa chọn local cần đo lại với adapter thật.
- Pause/block/maintenance đổi operation_generation. Pause rồi resume không khôi phục quyền của owner cũ;
  phải nhận lại quyền rõ ràng cho job chưa gửi và kiểm tra lại nội dung/lịch.
- Production chỉ giữ slot đúng ngày Việt Nam, từ 10h trở đi, chưa có actual-day guard.
  Staging/local dùng request thử riêng; production không có đường bấm đăng tự do ngoài slot.
  Bài admin đăng thủ công trên Facebook vẫn độc lập, không được đưa vào slot/guard của hệ thống.
- Intent kiểm tra quyền hiện hành, pause/block/maintenance, page gate, ngày, snapshot và eligibility
  trong cùng giao dịch với attempt/counter/trạng thái job/slot/audit. Chỉ lần gọi thành công đó trả payload
  cho bước gửi tiếp theo; replay không cấp lại payload để gửi. Không giữ giao dịch qua network.
- Retry cần attempt trước có outcome verified_failed_retryable, next_attempt_at đã đến hạn,
  và tổng lượt còn dưới 3. Retry phải nhận lại quyền; caption/ảnh/footer giữ nguyên.
  Verified failure có thể nhả page gate, nhưng bài gốc vẫn được giữ. Job trial khác dùng bài khác
  có thể chạy; retry không chiếm lại page đang bận. Outcome ambiguous không cho phép retry.
- Requested hết lease chuyển unknown, giữ attempt/gate và không tự gửi lại. Không ghi giả outcome
  của Meta, không tạo publication/usage chỉ từ intent hoặc lease expiry.
- Hủy được held đang có quyền và chưa có attempt, trả slot về planned.
  Requested/unknown không có đường hủy rồi gửi lại trong mô-đun này.
- Maintenance begin và intent tranh cùng quyền môi trường. Intent thắng thì maintenance deferred;
  maintenance thắng thì intent bị chặn. Requested/evidence_pending/unknown đều trì hoãn maintenance.
  Finish cần đúng owner và maintenance_generation, exportFinished/databaseAvailable được thành phần
  quản lý export xác nhận. Không mở khóa bằng lease; không bỏ pause/block khi kết thúc export.
- Nhật ký thao tác có actor, time, previous/new state và reason; không ghi owner token vào audit.

Các file chính: migrations/0003_claims.sql, src/storage/claims.ts,
scripts/transaction-store.mjs, tests/claims.test.mjs.

## Bằng chứng kiểm thử

`npm.cmd run check`: TypeScript strict đạt; **66 PASS, 0 FAIL, 0 SKIP**.
42 test nền bước 1–2 tiếp tục đạt; 24 test bước 3 bổ sung.
Log cuối: docs/steps/03-test-log.txt.

Có hai ca tranh chấp dùng **hai Node worker với hai kết nối SQLite riêng tới cùng file**,
được giải phóng đồng thời bằng barrier: cùng slot chỉ một claim hoàn chỉnh;
maintenance/intent chỉ một bên được cấp quyền. Không chỉ mô phỏng hai lần gọi tuần tự.
Database fixture được giữ dưới tmp/step-03-races/ để kiểm tra khi cần.

Các ca khác: sai token/generation, lease hết, pause-resume, owner cũ, version/ảnh bị chặn,
guard ngày đã đăng, qua nửa đêm, replay intent, unknown, hủy held, phiên bảo trì cũ,
điều kiện update 0 dòng, lỗi sau INSERT job/attempt và rollback, retry chưa đến hạn,
outcome unknown và giới hạn ba attempt. Ca retry dùng outcome fixture ghi rõ trong test;
chưa phải kết quả Meta thật hoặc finalizer đã xây.

Lượt đầu một test kỳ vọng SLOT_NOT_PLANNED trong khi slot unknown bị chặn sớm bằng SLOT_CLOSED;
đã sửa kỳ vọng cho đúng nhánh và chạy lại toàn bộ đạt.

## Giới hạn và phạm vi chưa triển khai

Đây là backend local, chưa nối HTTP mutation/UI hoặc OAuth. Timestamps/token/actor là dữ liệu
đầu vào do thành phần backend tin cậy cung cấp trong test; trước chạy thật cần dùng clock tin cậy,
token mới và tái kiểm tra thời gian khi lấy quyền thực tế, không nhận trực tiếp từ client.
Không có scheduler/retry timer, adapter gửi Meta/Telegram, intake/finalizer, reconciliation remote,
backup export thật, R2 byte validation, GitHub remote hoặc deploy. Health vẫn không xác nhận các tính năng này.

Adapter BEGIN IMMEDIATE là SQLite local; không được dùng trực tiếp làm giao dịch D1.
Cloud D1 phải có conditional writes/batch/constraints tương ứng và nghiệm thu tranh chấp riêng.
Không có exactly-once network guarantee: crash sau commit intent hoặc mất phản hồi DB phải đọc lại
và đối chiếu, không gửi lại dựa vào việc caller chưa nhận payload. Pause đến sau intent không thu hồi
một request đã được cho phép/đang bay; đường phục hồi giữ bằng chứng và chờ xác minh.
Finish maintenance hiện nhận bằng chứng từ caller backend qua hai cờ; chưa có export adapter để
xác nhận thực tế. Đây không phải nút cho người dùng tự xác nhận export bằng cờ.

Kho nội dung thật vẫn **40 đề cương nháp, 0 bài đủ điều kiện đăng**.
Không gọi AI, không gửi Meta/Telegram, không tạo tài khoản dịch vụ trong bước 3.

## Bước 4 đề xuất — chờ phê duyệt

Xây intake bằng chứng và finalizer local: lưu phản hồi trước, áp dụng publication/slot/usage/day guard
và Telegram outbox nguyên tử, xử lý confirmed/verified failure/unknown/conflict và lặp lại an toàn.
Kiểm thử crash/rollback, phản hồi đến từ owner cũ, hai remote ID và outbox tách biệt Facebook.
Chỉ dùng dữ liệu/adapter giả lập local; chưa gửi Facebook/Telegram thật hoặc deploy.
