# F6 — đề xuất tích hợp đóng, chưa được phê duyệt

Chỉ tiến hành sau khi chốt kết quả F5 và chủ dự án duyệt bước này. Giữ phương án GitHub Actions đã chọn; không chuyển sang Supabase hoặc mua gói trả phí.

## Phạm vi đề nghị

Code và kiểm thử giả lập phần kết nối còn thiếu: API runner với schema16; giao diện, owner pause và health/monitor tương thích; tính stock từ Node; wrapper live với quota guard và workflow chỉ dùng mã/ref được duyệt. Chuẩn bị cấu hình rollout/rollback với cửa đóng. Chưa áp dụng migration thật, cấp secret thật, sửa main/cron hoặc đăng Facebook trong F6.

API runner nên có entrypoint Worker riêng để giữ luồng nhỏ đã đo, dùng chung D1/R2 với giao diện; không mặc nhiên đưa toàn bộ bundle UI/OAuth vào request runner. Cần thử lại CPU của cấu hình cuối, gồm cold có quan sát được. Giao diện hiện chỉ chấp nhận schema14/15, nên phải hoàn tất tương thích schema16 trước bất kỳ migration thật nào.

## Các điều kiện cần xử lý

1. Mặc định toàn bộ cổng runner tắt. Legacy publisher và runner không được gửi đồng thời; cùng dùng journal/day lock. Pause/revoke/generation phải được đối chiếu tại authorize và vẫn cho phép phục hồi evidence sau pause.
2. Runner live tách khỏi client giả lập: URL Worker/Graph, Page và ref cố định, không nhận URL tùy ý. Release của Node phải khớp server; secret chỉ được dùng bởi workflow tin cậy. Không lấy secret Meta từ Cloudflare. Chủ dự án lưu trực tiếp ở bước kết nối riêng đã được duyệt.
3. Quota guard có adapter đọc usage thực tế, tính phần còn lại sau monitor/CI và dự phòng; kiểm thử cả lỗi đọc, thiếu quota và reserve. Không xác minh được quota hoặc budget0 thì chưa bật vận hành. Chưa coi thời gian mock cục bộ là phút Actions tính phí. Cần đọc billing/quota và xác nhận budget ở bước rollout; F6 không sửa tài khoản hoặc phát sinh phí.
4. Stock tính từ Node theo dữ liệu phân trang, rồi chốt cùng snapshot mới trên D1. Source/fact/prerequisite, tỷ lệ nội dung, kho dự phòng và một bài tự động/ngày10:00 Việt Nam vẫn áp dụng. Đăng thủ công của chủ dự án là luồng riêng.
5. Monitor đọc status nhỏ rồi xác minh Meta ngoài Worker; trạng thái cuối phải được đọc mới. Hàng chờ/cảnh báo hiện hành không đổi cho đến khi bộ thay thế qua kiểm thử. Phải có cách nhận biết workflow không chạy do quota, không chỉ HTTP204 của dispatch.
6. Kiểm thử toàn bộ owner UI/health/schema14/15/16, chuyển cổng publisher, quota, stock thay đổi giữa scan/finalize, runtime bị ngắt và rollback. Không xóa journal unknown hoặc dữ liệu thật để rollback.

## Cổng duyệt tiếp theo

Sau F6, trình cấu hình triển khai đóng cụ thể và số đo/CI để duyệt rollout riêng. Khi môi trường đóng, credential và quota đều kiểm được mới chuẩn bị một bài thử mới và xin duyệt POST thật. Nội dung/thiết kế đã duyệt không tự mở quyền gửi production.
