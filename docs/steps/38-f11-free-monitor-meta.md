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

## Kết quả triển khai ngày 11/10/2026

Release `4f537bd952d94f9df78c4a024e0091287ce341fe`: 517 kiểm thử local, 481 portable, 36 targeted và 13 kiểm tra ảnh đạt; CI PR38111851860 và main38113103900 đạt Windows/Linux. PR19 merged fast-forward. Hai Worker và policy/release đã đồng bộ; source Worker/UI/migration không đổi. Owner đã xác nhận policy đúng SHA F11. Staging auto-deploy đã trả về true sau CI main, staging deploy skipped; lịch Tập Viết không đổi.

Production giữ schema16/40 bài/56 tệp, permit/job/attempt/publication0, enabled0/paused1; Actions/runner/legacy/daily đều false, hai Worker không cron. Receipt quota trước promotion1244 phút/0USD; monitor đọc1246 và giữ reserve600.

Nguồn cron mới trả204 và tạo run38113261525 đúng SHA, source cron-job.org, queue lag10–11 giây. Staging không lỗi, production báo heartbeat/meta; không có cảnh báo Telegram mới được gửi trong lượt này. HTTP204 chứng minh dispatch được nhận, không chứng minh production khỏe. Nguồn ngoài đã bật mỗi ngày10:30 Asia/Ho_Chi_Minh; external-primarytrue, GitHub fallback Chủ nhật10:45. Credential cron hết hạn00:00 Việt Nam06/11/2026 theo response header, cần chủ tài khoản thay trước hạn. Tác vụ vận hành production8595718 vẫn không được bật trong F11; cảnh báo heartbeat còn tồn tại.

GET Meta run38113235899 đã thực hiện đúng một GraphGET, không Worker/POST, rồi đóng với `META_PAGE_TOKEN_REQUIRED` vì loại token không phải PAGE. Chưa nghiệm thu kết nối Meta; đang hướng dẫn owner lấy Page Access Token của817593604765443 và tự cập nhật GitHub environment secret. Chưa chạy lại khi credential chưa được thay. Không mở bước gửi bài thật.

### Kiểm lại sau owner cập nhật token Trang — 11/10/2026

Run38113688521 đã thành công trên đúng release4f537bd, state verified_read_only/META_READ_ONLY_VERIFIED. Page817593604765443, tên Ngành Kinh tế số - NTTU; hai quyền bắt buộc pages_read_engagement/pages_manage_posts đạt. Đúng hai GraphGET, WorkerCalls0/FacebookPOST0/realPublicationNOT_RUN. Hạn token10:28:58 ngày10/12/2026 Việt Nam; hạn truy cập dữ liệu10:32:12 ngày05/01/2027. Quota1262 phút, reserve600. Receipt thành công tại meta-receipt.json; receipt token sai loại giữ riêng meta-receipt-token-type-rejected.json. Không đọc/in credential.

Nghiệm thu GET-only của F11 đã đạt. Receipt Node này không ghi trạng thái xác minh vào D1 và không xác minh credential riêng của Worker, vì workflow không gọi Worker. Cảnh báo heartbeat và meta từ snapshot cloud của monitor chưa được coi là đã xử lý; cần tích hợp/đối chiếu trong bước vận hành tiếp theo được duyệt riêng. Mọi cổng gửi/lịch production vẫn tắt, chưa có bài đăng thật.

Hồ sơ `tmp/step38/f11/`: owner-policy-confirmation, billing-receipt, rollout, main-promoted, github-readback, meta-receipt, monitor-receipt, cron-source, monitor-source-policy, local-acceptance và ảnh cron204/lịch bật. Helper rollout/verification và hồ sơ kết thúc được giữ local để không tạo SHA mới sau owner attestation; không push thêm. Các lượt chạy qua run-clean đã dọn fixture/cache mới, giữ backup và bằng chứng.
