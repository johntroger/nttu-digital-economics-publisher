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

## Thay nguồn kích hoạt HTTP (đã được người quản lý cho triển khai)

Schema 0013 thêm trạng thái HTTP riêng, mặc định tắt. Endpoint POST /api/production/tick dùng PRODUCTION_TRIGGER_TOKEN riêng với token giám sát; không nhận body, query, giờ, recipient hoặc loại tác vụ từ bên gọi. Chỉ chạy khi cấu hình production vẫn management/paused và Facebook tắt. D1 claim nguyên tử coalesce theo phút server, lease 60 giây; mỗi request chờ tối đa một lần gửi Telegram (provider timeout 10 giây). Request bị ngắt giữ intent trong hàng chờ; lượt sau phục hồi theo cơ chế Telegram hiện có. Tin Telegram mất phản hồi vẫn có thể trùng khi thử lại; không cấp quyền đăng Facebook.

Khi bật HTTP, Cron vẫn ghi bằng chứng riêng nếu được gọi nhưng không dispatch hàng chờ. HTTP có heartbeat nhận và hoàn tất riêng. Monitor đọc hai dấu thời gian HTTP khi nguồn được chọn là HTTP; không dùng HTTP để giả ghi heartbeat Cron. UI hiển thị nguồn đang chọn và lượt hoàn tất. Job cron-job.org mới gọi trực tiếp mỗi phút; job giám sát 30 phút giữ nguyên. Chưa nghiệm thu cho đến khi có ít nhất ba lượt tự động thật và biên nhận tin production đang chờ.

### Kết quả chuyển đổi ngày 07/10/2026

- Mã runtime ad94c090d5781e26afae57b171c2e56188e5ef10: 357 kiểm thử đơn vị/tích hợp, 13 kiểm tra ảnh và native workerd/D1 đạt; CI 37576926038 đạt trên Windows/Ubuntu trước triển khai. Schema 13 đã áp dụng.
- Người quản lý phê duyệt tạo/lưu token riêng vào Worker và tác vụ cron-job.org. Credential không dùng để đọc kho bài, owner API, monitor hoặc đăng Facebook. Tệp chuyển tạm đã xóa và giá trị không được ghi vào tài liệu/Git.
- Job 8595718 «NTTU – Vận hành production» bật, POST body rỗng, mỗi phút, timeout 30 giây, không lưu nội dung request/response trong job history; email báo lỗi, phục hồi và tự tắt đã chọn. Job giám sát 8594899 giữ mỗi 30 phút.
- Các lượt lịch thật 12:39:05, 12:40:17, 12:41:04 và 12:42:06 giờ Việt Nam đều 200 OK; thời gian phản hồi 3,48 / 1,95 / 2,07 / 2,12 giây. Không gọi tick thủ công để giả nghiệm thu.
- Tin đang pending từ trước đã delivered, tries=1, message ID 12. Những lượt sau idle, không gửi lại tin. Đã hỏi người quản lý xác nhận nhìn thấy tin; tại lúc ghi hồ sơ chưa có phản hồi trực tiếp cho tin PRODUCTION này.
- Heartbeat HTTP nhận/hoàn tất đã tăng; Cron cũ vẫn last_scheduled_at=NULL, heartbeat_count=0. Đã loại bỏ phụ thuộc vào Cron lỗi, chưa xác định hoặc sửa nguyên nhân gốc của Cron.
- Main chỉ cập nhật ba tệp giám sát tại 8d02345a563f7132a308d9f792e195fa174dc058. CI 37577319970 đạt, staging deployment preference đã trả lại giá trị trước. Lượt giám sát production 37577518318 đạt, incidents rỗng, không gửi thêm tin thử.
- 22 kiểm tra quyền truy cập HTTP đạt; endpoint tick trực tiếp trả GET/PUT 405 và POST thiếu token 401. Kho giữ 40 bài/56 assets; production paused=1, enabled=0, jobs=0, publications=0. Staging giữ release 556db22c45e1dcdc76b9628a51415730d007da42.

Phần kỹ thuật của nguồn kích hoạt HTTP đã được kiểm thử trên cloud. Chưa bật đăng Facebook production và chưa triển khai bước tiếp theo. Còn xác nhận người quản lý nhìn thấy message ID 12 để hoàn tất mục xác nhận người nhận trong hồ sơ.


Cập nhật triển khai ngày 07/10/2026: main nhận đúng ba tệp giám sát tại commit 9bf8f1fed9f3cc8965971ca693ed237a15b20a7b; CI 37570216864 thành công và STAGING_DEPLOY_ENABLED đã khôi phục. Worker production tại release 2e50f2746087921156123458ab1cf232faae1a02, migration 12 đã áp dụng; 22 kiểm tra truy cập HTTP đạt. Staging giữ release 556db22c45e1dcdc76b9628a51415730d007da42. Giám sát production đã bật: lượt 37571901841 đọc được health, D1 và Meta, gửi tin kiểm thử có nhãn thành công (message ID 10); chỉ phát hiện heartbeat còn thiếu. Đến 11:35 giờ Việt Nam, cron production chưa ghi heartbeat và tin Cloudflare vẫn pending, chưa gửi. Đã áp dụng lại riêng trigger */5 * * * * lúc 11:36; chưa nghiệm thu cron hoặc kết luận ổn định. Người quản lý đã xác nhận nhận tin giám sát. Lượt tự động cron-job.org 37574172658 lúc 12:00 ngày 07/10/2026 đã đọc production và gửi đúng cảnh báo heartbeat (message ID 11); source cron-job.org, lag 85 giây. Staging tiếp tục có heartbeat mới. Đến 12:00 production vẫn chưa được scheduled gọi; đã xóa rồi tạo lại duy nhất trigger mỗi 5 phút lúc 12:01:23, Cloudflare xác nhận created_on mới. Chưa kết luận cron production đạt.

