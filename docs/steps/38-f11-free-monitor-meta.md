# F11 — Giám sát theo ngân sách Free và xác minh Meta chỉ đọc

## Phạm vi đã duyệt

Giảm nhịp giám sát, phục hồi credential cron-job.org và xác minh Meta bằng Node trên GitHub Actions. Giữ mọi cổng gửi và lịch production tắt. Không tạo permit, không chạy publisher và không đăng Facebook.

## Cơ chế

- Cron-job.org: mỗi ngày 10:30, múi giờ Asia/Ho_Chi_Minh (`30 10 * * *`). Người dùng tự thay và lưu PAT có quyền Actions read/write cho đúng repository. Chỉ bật sau khi mã bảo vệ quota được đưa vào main và kiểm thử credential thành công.
- GitHub: lịch hằng ngày 03:30 UTC khi nguồn ngoài chưa là primary; lịch dự phòng Chủ nhật 03:45 UTC luôn có thể chạy. Khi primary ngoài hoạt động, GitHub bỏ lượt hằng ngày để tránh chạy trùng.
- Một job Ubuntu cho cả staging và production, timeout 3 phút. Đọc usage toàn tài khoản trước các probe/cảnh báo, yêu cầu policy tháng đúng release và giữ 600 phút dự phòng. Nếu API/policy không hợp lệ hoặc thiếu quota, đóng probe và báo workflow thất bại.
- Giám sát theo ngày cảnh báo ngay lần lỗi đầu; khoảng trống trên 26 giờ mới là mất nhịp. Không thể phát hiện tức thì: độ trễ có thể gần một ngày, fallback tuần cũng không thay thế nguồn ngoài bị mất liên tục.
- Xác minh Meta: workflow thủ công, chỉ main, environment production-runner hiện có, gate Actions phải false và SHA đúng release. Kiểm tra run identity qua GitHub trước quota, tối đa hai Graph GET tới debug_token và me; kiểm tra App, Page, loại token, scope, hạn dùng. Không gọi Worker, Telegram hoặc Facebook POST. Receipt đã lọc không lưu token.

## Giới hạn ngân sách và nghiệm thu

Usage API có độ trễ, không cung cấp reservation nguyên tử và không chứng minh budget cá nhân. Policy chủ tài khoản xác nhận 0 USD/Stop usage, reserve 600, hết hạn 07:00 ngày 01/11/2026 giờ Việt Nam, không tự gia hạn. Đổi release cần chủ tài khoản xác nhận lại SHA cụ thể.

Receipt trước CI ghi 1228 phút, 0 USD. Với allowance CI 70 và reserve 600 còn 102 phút; dự toán tối đa 21 lượt ngày + 3 lượt fallback × 3 phút = 72 phút cho phần tháng còn lại, chưa gồm các job khác hay publisher. Đây là dự toán bảo thủ, không cam kết đủ quota đăng mỗi ngày trong cả tháng. Phải dùng receipt mới trước promotion/GET thật.

Lịch sử nguồn ngoài có nhiều HTTP 404 sau các lượt 204. 404 chưa đủ để khẳng định token hết hạn; có thể liên quan quyền hoặc truy cập repository. Token thay thế được người dùng tự lưu ngày 11/10/2026, chờ test sau promotion.

Kiểm thử gồm sai context/run/release, thiếu quota, policy hết hạn, sai Page/App/scope/hạn token, redirect/reflected secret, daily gap và cảnh báo một lần. CI Windows/Linux trên đúng SHA phải thành công trước promotion. Tạm đóng staging auto-deploy trong lúc CI main và trả lại giá trị cũ; không thay lịch đăng staging.

Trạng thái: đang kiểm thử local/CI; chưa nghiệm thu GET Meta thật hoặc nguồn cron mới. Hồ sơ riêng trong `tmp/step38/f11/` giữ receipt và bằng chứng không chứa credential.
