# Bước 4 — bằng chứng, lịch sử và hàng đợi thông báo

Ngày: 05/10/2026. Phê duyệt: “phê duyệt bước 4”.
Trạng thái: hoàn thành backend local; dừng trước bước 5.

## Đã xây

- Intake kiểm tra đúng attempt/page, thời điểm và kết quả đã chuẩn hóa; lưu bằng chứng trong giao dịch riêng.
  Event key nhập lại không tạo thêm; cùng key nhưng dữ liệu khác bị từ chối. Không lưu response thô/token.
  Intake cập nhật evidence_pending cho attempt hiện hành, không làm lùi một job đã confirmed hoặc attempt mới hơn.
- Finalizer dùng giao dịch riêng để ghi publication snapshot, slot, production usage theo bài gốc,
  actual-day guard và thông báo pending. Không dùng token của owner cũ để loại bỏ bằng chứng đến muộn.
  User pause và block không cản việc ghi nhận sự thật; maintenance khiến finalizer deferred.
- Crash/lỗi giữa finalization rollback các thay đổi liên quan, giữ intake pending và đặt next_at/last_error an toàn.
  Lịch thử lại finalizer mặc định sau 60 giây; đây là thử lại cập nhật DB, không gửi lại Facebook.
- Confirmed có remote ID hợp lệ theo hợp đồng adapter được ghi lịch sử; repeated event cho cùng remote ID
  không nhân bản publication/usage/thông báo. Snapshot caption/ảnh/footer không bị sửa khi bổ sung bằng chứng.
- Confirmed chưa có remote time vẫn ghi publication, usage và thông báo thành công; tạo incident, block môi trường,
  chưa tạo actual-day guard bằng ngày phỏng đoán. Bằng chứng ngày đến sau được ghi publication_dates riêng và bổ sung guard.
  Block/incident không tự xóa; cần đường đối chiếu/giải quyết sự cố ở bước sau.
- Remote publication qua nửa đêm dùng ngày Việt Nam thực tế. Slot dự kiến vẫn giữ lịch sử confirmed;
  slot khác đang planned trên ngày thực tế chuyển replaced_by_late_publication, bài chưa dùng của slot đó về reserve.
  Nếu slot/page đã có job khác hoạt động, giữ conflict/block để xử lý, không tự gửi thêm.
- Hai remote ID thật của một job được giữ cả hai publication và thông báo, nhưng không ghi đè usage/day guard đầu.
  Remote ID thuộc job khác, conflict ngày/usage, ngày remote mâu thuẫn hoặc kết quả contradictory được giữ evidence + incident.
  Không rollback sự thật để làm dữ liệu giống một lượt đăng hợp lệ.
- Verified retry dùng next_attempt_at tối thiểu 5 phút sau xử lý và tôn trọng retryAt muộn hơn của adapter.
  Tối đa 3 attempt; exhausted/final failure giữ version needs_review, cho phép slot trong ngày về planned để điều phối reserve sau.
  Lỗi policy giữ quarantined, không viết lại caption để né chính sách. Lỗi global block môi trường, không chọn reserve tiếp.
- Unknown giữ attempt/gate, có thông báo cần đối chiếu; khi bằng chứng đủ thì finalize mà không gửi lại.
  Late failure không đổi attempt mới hơn; late success khi attempt mới còn unresolved lưu publication thật và giữ job/gate unknown.
- Staging chỉ ghi lịch sử/thông báo trial, không tạo production usage hoặc actual-day guard.
- Outbox tạo event ID ổn định theo publication/job/incident. State vẫn pending; lỗi gửi Telegram sau này
  không có đường gọi lại Facebook trong mô-đun này. Audit ghi thay đổi intake/finalizer, không chứa owner token.

File chính: migrations/0004_finalization.sql, src/storage/evidence.ts, tests/evidence.test.mjs.

## Kiểm thử đã chạy

`npm.cmd run check`: TypeScript strict đạt; **89 PASS, 0 FAIL, 0 SKIP**.
66 test bước 1–3 tiếp tục đạt; 23 test bước 4 bổ sung. Log: docs/steps/04-test-log.txt.

Các ca: event trùng/xung đột, sai page, timestamp sai, confirmed lặp,
outbox lỗi gây rollback toàn bộ finalization nhưng giữ intake, retry sau crash,
owner hết lease + pause, maintenance deferred, unknown → confirmed, weak observation sau confirmed,
retry_after, hết 3 lượt, policy/global, hai remote ID, thiếu ngày rồi bổ sung ngày,
qua nửa đêm, phản hồi mâu thuẫn, staging tách production, attempt cũ thành công khi attempt mới đang bay,
day guard đã có publication khác và remote ID thuộc job khác.

Một ca dùng **hai Node worker, hai kết nối SQLite riêng tới cùng file**, cùng được giải phóng bằng barrier:
cả hai finalizer hoàn tất, một bên xử lý thật và một bên nhận duplicate; history/usage/guard/outbox đều chỉ một dòng.
Fixture dưới tmp/step-04-races/. Các outcome/remote ID/ảnh trong kiểm thử đều là giả lập có chủ đích.
Không diễn giải chúng thành bài đăng hoặc xác minh Meta thật.

## Giới hạn

Mô-đun nhận kết quả chuẩn hóa từ backend/adapter tin cậy; chưa có adapter Meta để xác minh remote ID là bài đã xuất bản,
không phải ID ảnh, hoặc gắn remote lookup đúng request thay vì bài admin trùng caption.
Các điều kiện đó phải được nghiệm thu khi tích hợp Meta thật. Hiện không có HTTP mutation/UI cho người dùng gửi proof tùy ý.
Intake chỉ được xem là bền vững sau commit; storage không khả dụng vẫn cần phục hồi từ intent/unknown và remote reconciliation.

Chưa có scheduler/bộ quét queue, vòng chọn reserve, Telegram delivery/retry, API đối chiếu remote,
UI xử lý incident, Google OAuth, R2 byte checks, D1 adapter, GitHub remote hoặc deploy.
Giao dịch kiểm thử là SQLite local, chưa chứng minh tương đương trên D1.
Các incident hiện chặn môi trường tương ứng để giữ an toàn; chưa tự resolve hoặc mở lại lịch.
Không bảo đảm exactly-once qua network; điều đã chứng minh là áp dụng nội bộ idempotent với dữ liệu local đã commit.

Kho thật vẫn 40 đề cương nháp, 0 bài đủ điều kiện đăng. Không gọi AI/Meta/Telegram trong bước 4.

## Bước 5 đề xuất — chờ phê duyệt

Xây bộ điều phối local với adapter giả lập: xử lý evidence đến hạn trước lượt mới,
lịch 10h Việt Nam, retry/dự phòng trong ngày, cảnh báo kho thấp/hết kho và phục hồi sau ngắt.
Kiểm thử luồng từ claim → intent → phản hồi giả → finalizer/outbox;
không gửi Facebook/Telegram thật, không tự tạo thêm content và không deploy.
