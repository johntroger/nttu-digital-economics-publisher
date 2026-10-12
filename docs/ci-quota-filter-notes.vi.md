# Bộ lọc CI tiết kiệm quota — bản chuẩn bị local

Ngày 12/10/2026. Chưa commit/push, chưa chạy Actions và chưa triển khai. Lịch production, release và policy đang dùng được giữ nguyên.

## Hành vi bản sửa

Workflow vẫn được kích hoạt cho PR/push/manual. Job Ubuntu `change-scope` kiểm tra repository có chứa file riêng tư hoặc mẫu credential, rồi phân loại toàn bộ phạm vi commit bằng Git. Job này không cài npm dependencies.

Chỉ thay đổi trong năm tệp được xét là tài liệu thuần:

- `README.md`
- `docs/operations.md`
- `docs/production-operations-guide.vi.md`
- `docs/free-quota-plan.vi.md`
- `docs/production-daily-activation-notes.md`

Khi tất cả đường dẫn nằm trong danh sách này, ma trận portable Windows/Linux và deploy staging được bỏ qua. Nếu có bất kỳ đường dẫn khác, phạm vi Git không hợp lệ, đọc diff lỗi, diff rỗng hoặc chạy thủ công bình thường, CI đầy đủ vẫn chạy. Lượt F7 billing thủ công riêng tiếp tục giữ điều kiện cũ.

PR dùng ba chấm base...head; push dùng before..after, không chỉ commit cuối. Git diff dùng NUL và `--no-renames` để không giấu đường dẫn mã cũ khi đổi tên sang tài liệu. Không có giới hạn 300 file của bộ lọc trigger GitHub. Tài liệu pháp lý để công bố website vẫn chạy CI đầy đủ; tài liệu mới không tự được miễn kiểm thử.

Không dùng `paths-ignore` ở trigger: GitHub cho biết bỏ qua cả workflow có thể để required checks ở Pending. Bỏ qua job bằng điều kiện có hành vi khác; trước khi đưa bản sửa lên main phải đối chiếu required checks/ruleset thực tế, gồm tên checks của matrix bị skip. Không đổi ruleset trong bản chuẩn bị này. [Tài liệu trigger GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

## Quota và giới hạn

Tài liệu thuần vẫn tốn một job Ubuntu nhẹ; không phải CI miễn phí hoàn toàn. Runtime thay đổi chịu thêm job phân loại trước ma trận. Cần đối chiếu số lần sửa tài liệu và thời lượng đã ghi nhận khi đánh giá lợi ích ròng. Không cam kết mức giảm phút cụ thể khi chưa đo lượt remote cần thiết.

Các helper phát hành production hiện yêu cầu Windows/Linux thật sự success cho đúng SHA. Không dùng SHA của một lượt chỉ sửa tài liệu có checks skipped để thay release production hoặc tái xác nhận policy. Bản sửa workflow này tự thuộc phạm vi CI đầy đủ khi được đưa lên GitHub; triển khai vẫn cần quy trình release và policy hiện có.

## Kiểm chứng local

Lệnh kiểm tra mục tiêu: `node scripts/run-clean.mjs script scripts/test-ci-change-scope.mjs`. Sáu kiểm tra đạt: whitelist; mã/cấu hình/tài liệu pháp lý/hỗn hợp; đổi tên/xóa; manual và lỗi diff; phạm vi PR/push; liên kết job và chặn deploy tài liệu thuần. Bộ chạy đã dọn cache/tạm của lượt kiểm tra.

Lệnh hồi quy: `npm run test:portable`. **511/511 kiểm tra đạt**. Lượt đầu bị sandbox chặn kết nối loopback `127.0.0.1` bằng EACCES; chạy lại cùng lệnh với quyền cho HTTP local đã đạt, không cần sửa mã vận hành. Cache và fixture từng lượt được bộ chạy tự dọn, kể cả lượt thất bại. `git diff --check` đạt. Không tạo workflow remote để kiểm thử bản sửa.

## Trước khi áp dụng

Rà diff và ruleset; chỉ đưa các tệp thuộc bản sửa đã duyệt lên nhánh/PR, không gom các artifact và helper quản trị đang để local. Chạy CI đầy đủ đúng SHA cho thay đổi workflow. Không đẩy main trong lúc vẫn dùng policy cũ rồi tự bật gate cho SHA mới. Nếu áp dụng cùng một release production mới, cần chủ tài khoản xác nhận policy đúng SHA trước triển khai. Hoàn tác là trả workflow trước bộ lọc và bỏ helper/test đi kèm theo quy trình release; không sửa lịch đăng hoặc database.
