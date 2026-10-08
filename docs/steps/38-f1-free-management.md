# Bước 38 / F1 — Giảm tải giao diện trên Workers Free

Người quản lý phê duyệt F1 ngày 08/10/2026, chọn giữ Workers Free. F2–F4 chưa được phê duyệt. Không mở cửa publisher, tạo quyền/job/token hoặc gửi Facebook.

## Thay đổi

`/api/management` chỉ trả summary/counts. Danh sách bài riêng năm bài/trang, không body/metadata/caption; mở một bài mới đọc caption/ảnh/nguồn. Thư viện, lịch sử, kết nối và thông báo tải khi mở tab hoặc yêu cầu đọc tài liệu. Tổng quan không tự tải preview, Meta hoặc Telegram.

HTTP preview đọc một bài/request, cursor ký riêng loại tác vụ, owner, release, snapshot, offset và thời điểm; hạn năm phút. Snapshot bao gồm active-version links, eligibility, source/fact state và expiry, bindings, library và IDs của biên nhận bất biến. Đọc lại sau mỗi trang để phát hiện race; đổi dữ liệu hoặc expiry ở bài đã đọc hủy chuỗi. UI chỉ công bố tổng khớp duyệt sau khi đọc đủ một snapshot; phản hồi cũ không thay tab mới. Cursor không phải quyền đăng. Các projection đầy đủ vẫn dùng trong fixture và publisher chưa đổi phạm vi F1.

Không migration mới. Byte ảnh, caption/footer, biên nhận duyệt và fanpage không đổi. Schema14, publisher config tắt/paused, Secret publisher chưa cấp. HTTP Telegram và staging không đổi.

## Nghiệm thu

Đang chạy toàn bộ kiểm thử local, native workerd/D1, CI và đo cloud. Các ca mới kiểm đủ 40 bài tương đương projection gốc; cursor giả/sai scope/release/hết hạn; thay nguồn/facts/eligibility giữa trang; expiry không ghi D1; race trong trang; anonymous/bearer; UI tải theo nhu cầu, tiến độ chưa đầy đủ và đổi tab. Chưa kết luận đạt CPU trước số đo thực.

F1 không sửa dry-run gửi23ms hoặc luồng live trong F2/F3. Không dùng kết quả F1 để cho phép đăng thật. Thiết kế tổng: [phương án Free](38-resource-acceptance-plan.md).
