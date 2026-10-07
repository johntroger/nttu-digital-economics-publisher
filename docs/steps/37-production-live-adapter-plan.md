# Bước 37 — Adapter production thật, triển khai với cửa đăng đóng

Trạng thái: đề xuất để người quản lý phê duyệt. Chưa code hoặc triển khai Bước 37.

Bước 36 đã kiểm chứng kho, trạng thái và giả lập; bộ gửi Meta thật và schema vận hành production chưa được tích hợp. Không được chuyển fixture thành dữ liệu cloud hoặc đổi target của fake provider.

## Phạm vi đề xuất

1. Viết adapter D1/R2 cho production, dùng đúng Page 817593604765443, đúng database/bucket. Chuyển các thao tác claim/intent/evidence/finalization đã thử sang bảng vận hành và guard live; không nhập lịch sử fixture. Duy trì snapshot và khóa ngày/Page khi unknown.
2. Viết provider Meta thật được inject rõ ràng, không fallback khi thiếu provider. Đọc/kiểm checksum bytes ảnh, đối chiếu token/Page/quyền/fingerprint, xác minh bằng chứng phải khớp intent, Page, caption và thời điểm. 5xx/timeout/mất phản hồi không cho retry POST; đã có evidence thì chỉ phục hồi finalizer.
3. Thử migration trên bản sao D1 trước. Schema cho phép cấu hình tương lai nhưng migration giữ enabled=0, paused=1, không tạo slot/job/publication. Kiểm tra rollback và cơ chế tạm dừng. Không thay D1 staging.
4. Tích hợp giao diện preflight và audit cấu hình; chưa có phê duyệt đăng bài thì không tạo send permit. Ngày/giờ từ server Việt Nam; lịch thường 10:00, một bài/ngày. Thời điểm thử gần nhất chỉ được cấu hình sau khi có phê duyệt riêng cho bài và giờ đó.
5. Tách HTTP publisher khỏi HTTP Telegram. **Không mở rộng quyền của PRODUCTION_TRIGGER_TOKEN hiện có**, vì token đó được duyệt chỉ cho hàng chờ Telegram. Endpoint publisher cần credential riêng; việc tạo/lưu vào cron-job.org sẽ xin xác nhận riêng đúng lúc cấp quyền. Chưa tạo secret, tác vụ bên ngoài hoặc bật nguồn đăng trong phạm vi bước này.
6. Tích hợp notification outbox/template live và heartbeat publisher riêng; giám sát thêm closed/ready/in-flight/unknown, query budget và CPU runtime. Không coi heartbeat Telegram là bằng chứng publisher đã chạy. Retry/reserve ở invocation sau; không ghép hai send provider vào một lượt dài.
7. Kiểm thử giữa từng phần: unit, D1/workerd có outbound mock, race/fencing/evidence recovery, regression staging, 40 approvals, 13 kiểm tra ảnh, CI Windows/Ubuntu. Chỉ triển khai management/preflight với mọi cửa gửi đóng sau khi đạt. Không merge production Worker vào main staging.

## Không nằm trong phê duyệt Bước 37

Không đăng Facebook thật, không bật lịch production, không tạo/lưu token publisher vào dịch vụ ngoài, không tự lấy P01 làm bài thử. Việc đăng thử phải có phê duyệt riêng, chỉ rõ caption/ảnh phiên bản đã duyệt, Page và thời điểm gần nhất. Sau bài thử được xác minh mới bàn giao lịch thường 10:00.

## Tiêu chí nghiệm thu

Adapter live/preflight hoàn chỉnh và reviewable; schema vẫn paused/disabled, 0 publication tạo mới, provider POST thật NOT_RUN; mã và migration trên nhánh/draft PR riêng; báo cáo CI, D1 trước/sau, query/timeout/CPU thực tế khi các cửa đóng. Nếu CPU budget hoặc quyền API không đạt thì giữ cửa đóng và nêu đúng hạn chế, không kết luận production sẵn sàng đăng.
