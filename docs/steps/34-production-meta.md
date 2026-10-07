# Bước 34 — Xác minh fanpage chính thức

Người quản lý phê duyệt kết nối production và xác nhận từ Graph Explorer: Page ID 817593604765443, tên Ngành Kinh tế số - NTTU; App ID 1125636386458970, API v26.0. Bước này chỉ xác minh bằng yêu cầu đọc, không đăng bài hoặc bật lịch.

## Phạm vi triển khai

Token Trang và App Secret được người quản lý lưu trực tiếp vào Secrets của Worker nttu-publisher-production. Không sao chép bí mật staging, không đưa giá trị vào Git, chat hoặc bằng chứng. Public vars trong cấu hình cố định đúng Page/App, purpose production_verify; token Trang thử không được chấp nhận.

Worker dùng chung bộ kiểm tra Graph GET debug_token và me với staging. Kiểm tra loại PAGE, ứng dụng, hiệu lực token/quyền dữ liệu, pages_read_engagement, pages_manage_posts, phạm vi Trang và định danh Trang. Không lưu phản hồi thô hoặc thông báo lỗi từ provider; biên nhận chỉ gồm mã kết quả, định danh, quyền, thời điểm và dấu vân tay cấu hình. UUID giúp replay cùng yêu cầu không gọi Graph lần nữa; đổi cấu hình làm kết quả cũ mất hiệu lực.

Biên nhận chỉ có hiệu lực 10 phút và không phải giấy phép bật đăng bài. Giao diện Kết nối hiển thị thời hạn, kết quả và nút xác minh; Tổng quan/Kết nối làm mới mỗi phút khi tab hiển thị. Không có thời hạn trong phản hồi không đồng nghĩa token không thể bị thu hồi.

## Chuyển schema

Thêm migration 0011_production_meta.sql dùng schema biên nhận Meta hiện có. Giữ nguyên 10 migration nền; Worker mới chấp nhận cả schema nền 10 và schema 11 nhưng từ chối nếu thiếu migration nền. Triển khai Worker trước, áp dụng migration sau; nút xác minh chờ schema sẵn sàng. Không sửa production_control, page_connections, nội dung, trạng thái ready, lịch, job, publication hay hàng chờ thông báo.

## Kiểm thử

25 kiểm thử tập trung đạt: kết nối production và staging, schema cũ/mới, quyền owner/CSRF, sai Page/App/type/quyền/expiry, replay và thay secret, không kích hoạt đăng. Native workerd/D1 smoke đạt với Graph và Google giả lập; chỉ hai yêu cầu đọc Graph, toàn bộ bảng vận hành vẫn trống và production_control.enabled=0. Các cookie/token fixture không được gửi lên cloud.

Nghiệm thu thật còn chờ hai secret production, CI, triển khai/migration và kiểm tra Graph bằng phiên Google owner thật. Chỉ kết luận hoàn tất khi có biên nhận thực tế; staging giữ lịch hiện tại.
