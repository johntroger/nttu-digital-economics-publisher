# F14 — Lịch production và giám sát khi cổng mở

Owner phê duyệt bật lịch sau khi xác nhận ứng dụng Meta đã phát hành và bài P01 hiển thị với người ngoài. Đích duy nhất: Page817593604765443, Ngành Kinh tế số – NTTU; giờ10:00 Asia/Ho_Chi_Minh. Bắt đầu dự kiến12/10/2026 với bài tiếp theo trong kho đã duyệt. Không đăng lại P01; không dùng bài dự phòng tự động.

Trước kích hoạt phát hiện monitor F12 chỉ chấp nhận enabled0/paused1 và mọi cổng đăng đóng. F14 bổ sung PRODUCTION_SCHEDULE_EXPECTED=true cho giám sát lịch được phê duyệt: kiểm tra cả bốn cổng runner, schema16, legacy disabled, ngày bắt đầu, số bài confirmed trong ngày, kết quả chưa rõ và heartbeat runner sau10:20. Thiếu bài sau10:20 gây cảnh báo; kết quả chưa rõ yêu cầu đối soát, không kích hoạt gửi lại. Meta vẫn chỉ GET, đối chiếu fingerprint, release, context workflow và policy ngân sách. Chế độ giám sát cổng đóng vẫn được giữ.

Kiểm tra local: typecheck,505 kiểm thử portable,17 kiểm thử runner tích hợp đạt. Mã Worker/UI/migration không đổi. Tác vụ cron8623620 đã cấu hình POST workflow production-runner.yml, main, single_test=false, lịch10:00 và hết hạn01/11/2026 07:00 Việt Nam; đang Disabled. Kiểm thử dispatch nhận204 khi Actions gate vẫn false, không gửi Facebook. Chưa mở gate, chưa kích hoạt database hoặc cấp permit hằng ngày.

Rollout cần CI đúng SHA cuối, xác nhận lại policy tháng cho SHA đó theo quy tắc F11/F12, quota mới, đồng bộ release/policy/Worker, giữ các trang pháp lý công khai. Sau đó lập permit normal theo từng ngày đến hết hạn policy, mở runner và database, bật Actions cùng schedule expectation, rồi bật cron cuối cùng. Đọc lại trạng thái, xác minh GET-only, kiểm tra not_due trước lượt đầu; không gọi gửi để thử cấu hình. Khi có job/intent chưa rõ thì dừng và đối soát.

Policy hiện tại: tháng UTC2026-10,0USD/Stop usage, reserve600 phút, expires01/11/2026 07:00 Việt Nam, không tự gia hạn. Usage API có độ trễ; số phút thực tế phải kiểm lại sau CI. Quota không đủ hoặc policy hết hạn thì đóng lượt chạy, không tự chuyển sang tính phí. Phê duyệt bật lịch không thay thế xác nhận ngân sách cho SHA release mới.
