# Bước 38 / F3 — Bộ đăng theo giai đoạn có dữ liệu bền vững

F3 được phê duyệt ngày 08/10/2026. Phạm vi là code, kiểm thử local/native/mock và hồ sơ review. Không áp dụng migration lên cloud, không thay bản production F2 đang chạy, không tạo secret/permit/job thật và không đăng Facebook. F4 cần phê duyệt riêng để triển khai với cửa đăng đóng và nghiệm thu CPU trước khi xin duyệt bài thử thật.

## Hành vi triển khai

Endpoint publisher riêng vẫn cần token riêng, POST rỗng, đúng origin và không nhận clock/job/receipt từ caller. HTTP chuyển sang `runStagedProductionPublisher`; helper đơn lượt B37 chỉ được giữ để đối chiếu fixture, không có đường gọi qua HTTP production.

Mỗi invocation xử lý tối đa một giai đoạn:

| Giai đoạn | Dữ liệu bền vững | Khả năng gọi Meta |
| --- | --- | --- |
| Nội dung | Job `held`, snapshot bất biến, journal `image` | Không |
| Ảnh | Journal ghi số byte đã kiểm; chuyển `connection` | Không |
| Kết nối | Journal ghi fingerprint, thời điểm xác minh, hạn proof; chuyển `send` | GET xác minh App/token/Page/quyền |
| Gửi | Reread byte R2 và approval của đúng bài; SQL nguyên tử ghi intent, giữ khóa ngày/Page; lưu response | Một POST, không GET trong lượt này |
| Xác minh evidence | Hint remote ID được đối chiếu caption/Page/thời gian bằng GET, ghi proof xác nhận | Chỉ GET |
| Chốt | Usage/outbox/trạng thái và đóng test permit theo transaction cũ | Không |

Không lưu byte ảnh hoặc access token trong journal. Snapshot job, caption và checksum vẫn bất biến. Journal gắn job, release và credential fingerprint; secret/release/config/generation thay đổi phải kiểm lại hoặc hủy việc chưa gửi. Proof kết nối tối đa năm phút và không vượt hạn token/data access/permit. Lượt gửi đọc lại byte/checksum R2, approval/nguồn/facts/prerequisites, rồi kiểm fences hiện hành trước outbound. Chuẩn bị có thể bắt đầu sớm tối đa ba phút; SQL và lượt gửi đều chặn POST trước `due_at`. Với lịch mỗi phút bình thường, ba lượt chuẩn bị có thể nằm trước mốc 10:00; F4 phải đo độ trễ thực và không hứa thời điểm chính xác nếu trigger đến muộn.

Runtime lease cùng minute bucket chống invocation trùng; intent SQL kiểm lease còn hiệu lực, config revision, operation generation, owner permit, ngày, active job, usage và version eligibility. Unique job/attempt/usage và khóa Page giữ nguyên. Không dùng vòng lặp chạy toàn chuỗi hoặc `waitUntil` để giả tạo thêm ngân sách CPU.

## Lỗi và phục hồi

Sau intent, crash trước/sau POST hoặc không lưu được response để lại `requested`. Lượt sau khi lease hết ghi evidence `unknown`; không POST lại, kể cả qua ngày mới hoặc khi pause. HTTP200 và remote ID chỉ là hint; cần GET tương quan mới thành `confirmed`. Nếu GET không xác nhận được, giữ unknown để người quản lý đối soát; không tự tìm cách đăng bài khác vượt khóa.

Evidence đã xác minh nhưng finalizer rollback được chốt lại ở lượt sau, kể cả khi pause; không gửi lại. Chỉ lỗi có bằng chứng retryable mới được chờ năm phút và chuẩn bị lại ảnh/kết nối, tối đa ba lần. Lỗi policy/global/unknown không được xem như quyền retry. Pause thu hồi permit và hủy held/retry_wait; requested/unknown giữ khóa để đối soát.

Kiểm kho không còn projection cả 40 bài trong tick. SQL lưu snapshot gồm eligibility và usage, mỗi lượt kiểm đúng một active version. Thay snapshot/release hoặc đến hạn nguồn/fact phải bắt đầu lại; chỉ chốt mức tồn kho sau đối chiếu cuối. Trong lúc scan, không tạo POST. Outbox chỉ ghi sự kiện thay mức; F3 không gửi Telegram thật.

## Migration và giới hạn nghiệm thu

`0015_production_publisher_stages.sql` thêm journal và scan, không bật bất kỳ cửa đăng nào. Generator chỉ thêm migration khi gọi `productionMigrations(databaseId,{publisherStages:true})`; mặc định vẫn 14 migration. Không sửa checksum migration cũ. Schema14 tiếp tục phục vụ quản lý/F2; publisher mới trả `stage_schema_required` nếu cố mở publisher khi chưa có schema15, không chạy helper đơn lượt thay thế.

Migration/rollback đã kiểm bằng fixture. Rollback riêng từ 15 về 14 từ chối nếu còn journal, scan, job đang xử lý hoặc evidence chưa áp dụng. Không xóa dữ liệu vận hành thật để ép rollback; cần backup và kế hoạch bảo trì được duyệt trước thao tác cloud. Management/F2 hỗ trợ schema15 để rollout sau này vẫn giữ giao diện đọc và cửa đăng đóng.

Kiểm thử: TypeScript; 12 kiểm thử F3 bao gồm gửi đúng giờ, concurrent/replay, thay dữ liệu/secret/release, expiry/midnight, pause, nguồn đổi sau projection, lease hết, crash mất evidence, finalizer rollback, retry giới hạn và scan đổi snapshot. Native workerd/D1/R2 đạt 18 kịch bản (10 so sánh F1/F2/B37 và 8 F3); toàn bộ Meta outbound là mock. Bằng chứng local/native giữ tại `tmp/step38/f3/`; fixture/build/cache mới tạo được bộ chạy tự dọn sau khi database/process đóng, kể cả khi thất bại. TypeScript, toàn bộ 445 kiểm thử local và 13 kiểm tra ảnh đã đạt; CI Windows/Ubuntu được ghi nhận trên PR F3.

**Chưa đo CPU cloud của F3, chưa nghiệm thu toàn đường trên Workers Free và chưa thử Facebook thật.** F4 cần đo từng endpoint/giai đoạn, ít nhất 30 mẫu mỗi endpoint cùng cold quan sát được, p95/max/outcome; kiểm cả R2/hash/FormData/POST/evidence/stock/monitor và nguồn trigger. Không suy từ HTTP200, số query hoặc native mock rằng chắc chắn dưới 10 ms. Production vẫn F2, publisher tắt/paused; staging Tập Viết không đổi.
