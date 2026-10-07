# Bước 35 — Telegram và giám sát production

Người quản lý phê duyệt: kết nối Telegram và giám sát môi trường chính thức; chưa bật đăng Facebook. Fanpage 817593604765443, App 1125636386458970. Token dài hạn đã xác minh lại lúc 10:48:21 ngày 07/10/2026, hết hạn 10:32:12 ngày 06/12/2026 theo giờ Việt Nam.

## Cloud

Migration 0012 thêm bảng vận hành Telegram và heartbeat riêng. Worker hỗ trợ schema 10/11/12 để triển khai trước migration; bản nền 10 vẫn phải đủ. Cron 5 phút chỉ ghi heartbeat và xử lý hàng chờ Telegram, không gọi publisher. Biên nhận và lịch sử production tách staging. Bot hiện có và chat cá nhân 1548618770 được giữ; người quản lý lưu TELEGRAM_BOT_TOKEN trực tiếp vào Worker production.

Owner có nút tạo tin kiểm thử PRODUCTION qua Origin/CSRF. UUID chống enqueue lặp. Transport dùng intent D1, lease, cooldown, recipient fingerprint và kiểm tra message ID/chat cá nhân; không lưu URL hoặc lỗi provider. Rate limit chờ retry_after; mất phản hồi giữ delivery_unknown, có thể gửi lại cùng sự kiện sau thời gian chờ nên tin Telegram có thể trùng khi provider đã nhận nhưng mất phản hồi. Đây là hàng chờ thông báo, không cấp quyền gửi lại bài Facebook. Đổi đích gửi không chuyển các retry cũ sang đích mới.

## Giám sát độc lập

Tái sử dụng workflow monitor.yml và cron-job.org 30 phút hiện có, thêm bước kiểm tra production và issue checkpoint riêng. Sửa trên main chỉ ba tệp giám sát đã kiểm thử; không merge mã Worker production vào nhánh staging. Tạm chặn automatic staging deployment trong lúc cập nhật các tệp monitor, rồi trả cờ về giá trị cũ sau CI. Lịch đăng staging không bị tạm dừng.

Monitor chỉ GET public health, GET endpoint riêng với token production chỉ đọc và SELECT D1 cố định. Endpoint không trả caption/tài liệu/bí mật và credential không truy cập API owner hoặc gửi Telegram. Đọc Graph GET để xác minh token hiện tại, không dựa vào biên nhận cũ. Kiểm tra nhận dạng, schema, heartbeat 20 phút, cấu hình khóa đăng, Telegram, token hết hạn/thu hồi và cảnh báo trước 3 ngày. Trong phạm vi Bước 35, phát sinh job/publication production là lỗi cấu hình. Trước triển khai publisher ở bước sau phải cập nhật điều kiện giám sát cho trạng thái mới.

Checkpoint production riêng với staging; intent lưu trước khi gửi cảnh báo, dedup theo episode, lỗi provider không chứa bí mật. Healthy run không gửi tin. Token giám sát mới được tạo trong bộ nhớ và lưu trực tiếp vào Cloudflare/GitHub Secrets, không ghi plaintext vào tệp hoặc chat. Workflow dùng bot secret đã lưu trên GitHub; không sao chép token bot từ Cloudflare. Cron-job.org không cần đổi token hoặc thêm tác vụ: một dispatch gọi hai bước kiểm tra tách biệt trong cùng một runner. GitHub fallback giữ nguyên; thời gian thực thi vẫn phụ thuộc dịch vụ.

## Nghiệm thu

Kiểm thử đơn vị, schema cũ/mới, owner/CSRF, monitor bearer không cấp quyền gửi tin, drift/expiry/dedup; native workerd/D1 với provider giả lập. Sau CI triển khai Worker trước migration, xác minh kho 40 bài/56 tệp, không job/slot/publication; tạo một tin kiểm thử để cron thật gửi và ghi message ID, xác nhận người quản lý nhận tin. Kiểm thử một cảnh báo giám sát được gắn nhãn, sau đó healthy run im lặng. Quan sát dispatch cron-job.org thực tế và checkpoint production trước khi coi bộ giám sát hoạt động.

Chưa kết luận hoàn tất trước khi có bằng chứng thực tế.


Cập nhật triển khai ngày 07/10/2026: main nhận đúng ba tệp giám sát tại commit 9bf8f1fed9f3cc8965971ca693ed237a15b20a7b; CI 37570216864 thành công và STAGING_DEPLOY_ENABLED đã khôi phục. Worker production tại release 2e50f2746087921156123458ab1cf232faae1a02, migration 12 đã áp dụng; 22 kiểm tra truy cập HTTP đạt. Staging giữ release 556db22c45e1dcdc76b9628a51415730d007da42. Đang nghiệm thu heartbeat cron thật và Telegram; giám sát production chưa bật trong giai đoạn chờ lượt đầu.
