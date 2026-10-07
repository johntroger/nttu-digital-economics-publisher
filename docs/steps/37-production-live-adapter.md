# Bước 37 — Adapter live, giữ cửa đăng production đóng

Người quản lý phê duyệt phạm vi trong `37-production-live-adapter-plan.md`. Không có phê duyệt đăng Facebook thật hoặc cấp credential publisher cho dịch vụ ngoài.

## Kết quả triển khai

- Adapter D1/R2 thật cố định Page 817593604765443, database/bucket production. Schema 0014 thêm config tắt, permit rỗng, snapshot bất biến, claim/intent/evidence/usage và heartbeat riêng; không nhập dữ liệu fixture. Bảng legacy production_control vẫn giữ CHECK enabled=0/connection_verified=0.
- Provider Meta phải được inject rõ ràng. Kiểm checksum bytes ảnh, token/App/Page/scopes/fingerprint; xác minh bài bằng GET với Page, caption và thời gian tương ứng intent. R2 đọc tối đa 5 giây, xác minh kết nối tối đa 8 giây, POST và đọc bằng chứng cùng ngân sách 10 giây. Không có default fetch trong provider.
- HTTP publisher là endpoint/capability riêng. Token Telegram/monitor bị từ chối; không tạo Secret mới và không tạo tác vụ cron-job.org. Native Cron và HTTP Telegram không gọi adapter Facebook.
- Publication permit khớp chính xác phiên bản/caption/ảnh/ngày/giờ/owner. Permit thường dùng 10:00 Việt Nam; test phải ghi rõ mode test và thời điểm đã duyệt. Chưa có endpoint cấp permit hoặc bật config. Duyệt nội dung/thiết kế 22–23 không trở thành phê duyệt đăng.
- Lease HTTP và unique active Page job ngăn gửi đồng thời. Intent commit trước POST. Timeout/5xx/mất phản hồi giữ unknown và khóa Page qua ngày tiếp theo. Retry chỉ khi Graph trả lỗi từ chối rõ ràng; tối đa ba lượt, cách nhau năm phút. Bài dự phòng cần permit riêng, chạy ở invocation sau.
- Evidence lưu trước finalizer; rollback finalizer phục hồi cả khi paused, không POST lại. Đối soát chỉ GET; ID người dùng cung cấp là gợi ý, chưa phải bằng chứng. Tạm dừng thu hồi permit và hủy held/retry_wait; requested/unknown giữ khóa.
- Event production vào hàng chờ Telegram hiện có. Kiểm tồn kho tách sang lượt sau; không ghép hai provider sends. Publisher heartbeat tách hoàn toàn heartbeat Telegram, ghi số truy vấn và thời gian xử lý; thời gian xử lý là wall time, không phải CPU time.
- Preflight owner-only hiển thị cửa triển khai/dữ liệu/phê duyệt/capability, ngày Việt Nam và trạng thái publisher. GET chỉ đọc; không tạo lịch/job/permit.
- Giám sát chấp nhận schema13 và14, kiểm publisher đóng và báo unknown hoặc vượt query/time budget. Schema13 còn dùng được trong lúc rollout. Không merge mã Worker production vào staging main.

## Kiểm thử và giới hạn

Đã kiểm thử giao dịch migration/rollback rỗng, khóa rollback nếu có permit, cạnh tranh HTTP, ảnh sai checksum, token đổi, nguồn bị thu hồi sau network preflight, pause sau intent, retry ba lượt, unknown qua ngày, evidence rollback và đối soát GET. Workerd dùng D1/R2 native với mọi outbound Meta mock; kiểm checksum bytes thực tế trên máy owner. CI dùng PNG fixture và receipt sinh trong test vì ảnh/PDF riêng tư không được đưa lên GitHub; không coi fixture đó là phê duyệt thật.

Adapter giới hạn 46 câu lệnh được chuẩn bị trong operation và ghi telemetry riêng; trường hợp gửi thành công native hiện ghi 37 truy vấn, cửa đóng 6. Không dùng số liệu wall time để suy diễn CPU production. Chưa kiểm POST Meta thật, chưa nghiệm thu giới hạn CPU khi gửi thật, chưa chứng minh lịch publisher ngoài đã chạy: ba mục này cần bước thử có phê duyệt cụ thể tiếp theo.

## Bằng chứng rollout

Đang hoàn tất CI và triển khai management/preflight với mọi cửa đóng. Số liệu D1 trước/sau, commit/runtime version và link CI sẽ bổ sung sau kiểm tra.
