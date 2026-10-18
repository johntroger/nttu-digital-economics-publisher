# Mở dự phòng Actions — phạm vi ngày 18/10/2026

Chủ dự án yêu cầu: “mở dự phòng đi, khi nào hết tính tiếp”. Phạm vi chuẩn bị: cho phép giải phóng 600 phút dự phòng của policy tháng 10; không tăng hạn mức miễn phí 2.000 phút, không tăng ngân sách 0 USD và không tắt Stop usage.

Policy monthly vẫn giữ mức tối thiểu 600 nếu không có xác nhận riêng `reserveRelease`. Xác nhận phải có ownerApproved=true, đúng người duyệt, đúng tháng UTC, đúng SHA release, approvedAt hợp lệ trong tháng và không ở tương lai. Khi có xác nhận hợp lệ có thể đặt reserveMinutes=0. Policy legacy giữ tối thiểu 300. Quota vẫn đóng khi API không đọc được, có phí, SKU lạ hoặc còn dưới 5 phút; không tự gia hạn qua tháng mới.

Sửa riêng `scripts/production-runner-quota.mjs` và hồi quy ngân sách. Không ghép nhánh bộ lọc CI đang chờ. Mã Worker/UI/migration không thay. Quy trình phát hành hiện có vẫn yêu cầu CI Windows/Linux đúng SHA và chủ tài khoản xác nhận policy đúng SHA cụ thể trước khi promotion; yêu cầu hiện tại được ghi nhận làm phê duyệt mở dự phòng, không giả mạo xác nhận một SHA chưa được cung cấp.

Trước áp dụng: kiểm tra budget 0 USD/Stop usage và quota, hoàn tất kiểm thử local/CI, chuẩn bị policy reserve0 + reserveRelease gắn SHA cuối để chủ tài khoản xác nhận. Khi chuyển main, đồng bộ nhãn release của Worker/runner, biến PRODUCTION_RUNNER_RELEASE và policy; giữ lịch Facebook/Telegram như hiện tại, tránh chạy đan xen. Không tự đăng bù bài ngày 18/10; chạy một lượt chỉ đọc để xác minh quota/Meta sau promotion khi được phép.

Đây là hồ sơ chuẩn bị; chưa áp dụng vào production tại thời điểm viết. Việc chạy CI cần thiết cho sửa reserve sử dụng phần miễn phí còn lại đã được chủ dự án cho phép dùng, không thay budget tài khoản.
