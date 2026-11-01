# Bỏ chặn phút Actions cho repository public

## Cập nhật 01/11/2026: bỏ gia hạn policy tháng cho public standard

Theo xác nhận của chủ dự án, ba workflow production không đọc biến `PRODUCTION_BILLING_POLICY` hoặc token billing nữa. Chúng xác minh repository public, standard runner, đúng workflow/main/SHA/run/attempt qua GitHub API ở mỗi lượt. Không còn ngày hết hạn ngân sách nội bộ theo tháng và không cần xác nhận lại mỗi tháng. SHA vẫn ghim qua `PRODUCTION_RUNNER_RELEASE` và được đối chiếu với Worker.

Nếu repository chuyển private, API không xác minh được hoặc runner đổi loại, lượt chạy dừng; không tự quay sang thanh toán hoặc dùng allowance private. Budget tài khoản 0 USD/Stop usage giữ nguyên. Guard v1/v2 chỉ còn phục vụ công cụ/fixture legacy không bật public mode.

Quyền gửi từng bài, phiên bản, ảnh và thời điểm vẫn độc lập. Bỏ policy không tự tạo quyền đăng mới hoặc đăng bù. Lịch kế tiếp phải được duyệt cụ thể. Phần dưới là hồ sơ triển khai ngày 27/10 trước thay đổi này.

Theo yêu cầu chủ dự án ngày 27/10/2026: repository public dùng runner chuẩn không bị giới hạn bởi phút miễn phí dành cho repository private. [GitHub xác nhận cơ chế này](https://docs.github.com/en/actions/concepts/billing-and-usage).

Ba workflow production (runner, monitor, xác minh Meta chỉ đọc) khai báo `ACTIONS_COST_MODE=verified-public-standard`. Trước khi miễn kiểm tra phút, helper xác minh bằng GitHub API:

- Đúng repository, visibility public và private=false.
- Đúng workflow/main/SHA đã được phê duyệt, run đang chạy và đúng attempt.
- Đúng job đang chạy, nhóm GitHub Actions và duy nhất label ubuntu-latest, khớp cấu hình các job production hiện có.

Khi đạt, không đọc API billing toàn tài khoản, không áp trần 2.000 phút hoặc điều kiện còn 5 phút cho job public. Receipt ghi `billingMode=public-standard`, `reason=public_standard_runner`, minuteLimit/usedMinutes/remainingMinutes=null; không giả số phút vô hạn thành 0 phút đã dùng. GitHub vẫn có thể hiển thị thời lượng thực thi, khác với billable minutes.

Nếu repository chuyển private, quay lại guard ngân sách hiện có. Nếu API không xác minh được hoặc job là custom/larger/self-hosted, đóng lượt chạy; không tự áp miễn phí. Token billing không còn cần cho nhánh public đã xác minh, vẫn giữ khả năng đọc khi quay lại private.

Giữ nguyên budget 0 USD/Stop usage trên GitHub, các cổng quyền đăng, xác thực workflow/release, chống trùng, đối soát unknown, phê duyệt nội dung, policy theo tháng và hạn lịch 01/11. Không tự gia hạn tháng 11 hoặc đăng bù. Miễn kiểm tra phút không đồng nghĩa cấp quyền đăng mới. Nếu policy tháng hết hạn, vẫn cần xác nhận theo quy trình hiện có.

Mã Worker/UI/migration/ảnh không thay. Bộ lọc CI tài liệu đang chờ không ghép vào thay đổi này. Triển khai sau kiểm thử local/CI Windows/Linux và xác nhận đúng SHA theo quy tắc phát hành; xác minh bằng monitor chỉ đọc, không chạy publisher để thử miễn phút.

Kiểm thử giả lập phủ public không cần token billing, private hết phút, visibility sai/thiếu, context/main/SHA/attempt sai, job cũ/trùng/custom/self-hosted, API lỗi/redirect/pagination, các ràng buộc policy và wiring cả ba workflow. Đây là hồ sơ bản sửa chuẩn bị, trạng thái triển khai được ghi trong biên nhận nghiệm thu riêng.
