# Rà soát nguồn kích hoạt production — 07/10/2026

Trạng thái: đề xuất kỹ thuật sau nghiên cứu; chưa triển khai endpoint mới, tạo credential mới hoặc bật đăng Facebook.

## Kết luận

Chưa xác định nguyên nhân gốc của việc Cron Triggers production không gọi được scheduled handler. Đề xuất thay nguồn kích hoạt vận hành bằng cron-job.org gọi HTTP trực tiếp vào Worker. Không cần chờ cộng đồng hoặc nâng cấp gói hỗ trợ để thực hiện phương án này.

Đây là cách loại bỏ sự phụ thuộc vào bộ kích hoạt đang lỗi, không phải bằng chứng đã sửa lỗi Cron Triggers và không bảo đảm mọi dịch vụ luôn sẵn sàng.

## Bằng chứng và giới hạn

- Cấu hình cloud có trigger mỗi 5 phút và handler fetch/scheduled; bundle deployed có handler production. Production chưa ghi heartbeat; tin kiểm thử vẫn pending, tries=0 trong lần kiểm tra trước khi lập tài liệu.
- Staging vẫn có heartbeat. HTTP production, truy cập D1 và giám sát bên ngoài đã hoạt động. Giám sát đã gửi cảnh báo Telegram thành công.
- Đã đăng ký lại trigger và kích hoạt lại cùng mã nguồn, chưa có bằng chứng phục hồi. Không tiếp tục lặp các thao tác này khi không có thông tin mới.
- Test native workerd gọi scheduled thành công chỉ xác minh mã xử lý, không xác minh hệ thống lập lịch thực tế.
- Lỗi SDK #9882 liên quan test local với assets/config redirect; #13840 liên quan Workers for Platforms dispatch namespace. Hai điều kiện này không khớp bằng chứng production hiện tại. Không coi chúng là nguyên nhân đã xác minh.

## Phương án được đề xuất

1. Tạo endpoint POST riêng chỉ kích hoạt vận hành production và một secret riêng cho endpoint. Không tái sử dụng token giám sát chỉ đọc; không đưa token Meta vào cron-job.org.
2. Tạo job cron-job.org riêng gọi trực tiếp endpoint mỗi phút. Giữ job giám sát 30 phút hiện có. Không đi qua GitHub Actions trong đường kích hoạt tác vụ vì runner có thêm thời gian chờ.
3. Dùng giờ server, nguồn kích hoạt có tên rõ ràng và khóa lượt xử lý trong D1. Không cho request bên ngoài giả danh scheduled event hoặc tự ghi heartbeat Cloudflare Cron.
4. Endpoint chờ một lô xử lý nhỏ hoàn tất rồi trả kết quả ngắn, với ngân sách dưới giới hạn 30 giây và timeout provider ngắn hơn ngân sách đó. Công việc/retry còn lại lưu D1 để lượt HTTP sau tiếp tục. Không trả 202 rồi giả định tác vụ chạy nền sẽ chắc chắn hoàn tất.
5. Tách logic xử lý khỏi adapter Cron/HTTP. Nếu giữ Cron dự phòng, hai adapter phải dùng chung cơ chế nhận việc/lease để không xử lý đồng thời một mục. Bước đầu chỉ HTTP được dùng làm nguồn vận hành chính; không triển khai thêm hai bộ đăng bài độc lập.
6. Giám sát kiểm tra heartbeat của nguồn đang được chọn, độ trễ, hàng chờ và lỗi. Giữ lịch sử thiếu heartbeat Cron riêng, không ghi đè bằng HTTP để che lỗi cũ. Theo dõi job bị tắt và credential hết hạn.
7. Phạm vi Bước 35 chỉ Telegram và vận hành; production Facebook vẫn khóa. Khi bổ sung publisher ở bước được duyệt sau, lịch mục tiêu là 10:00 giờ Việt Nam, một bài tự động/ngày. Tần suất tick mỗi phút không phải tần suất đăng bài.
8. Publisher sau này cần khóa duy nhất theo Page/ngày, claim nguyên tử và xử lý trạng thái mất phản hồi bằng đối soát; không tự đăng lại khi chưa biết Facebook đã nhận hay chưa. Không hứa exactly-once cho API ngoài hệ thống.

## Nghiệm thu trước khi coi Bước 35 hoàn tất

- Token sai/thiếu bị từ chối; token monitor không gọi được endpoint mới; phản hồi và log không lộ bí mật.
- Hai tick trùng/đồng thời không nhận cùng việc; lease hết hạn có đường phục hồi; timeout không đánh dấu thành công giả.
- Kiểm thử hàng chờ với provider giả lập: thành công, lỗi tạm thời, rate limit, mất phản hồi sau khi provider nhận.
- Triển khai có giữ nguyên khóa Facebook và dữ liệu 40 bài/56 assets; staging giữ nguyên lịch và release.
- Chạy lịch ngoài thực tế ngay ở khoảng thời gian gần, quan sát ít nhất ba lượt tự động liên tiếp và biên nhận tin kiểm thử đang chờ. Kiểm tra heartbeat/monitor theo đúng nguồn HTTP.
- Ghi bằng chứng và giới hạn vào hồ sơ nghiệm thu. Không cần đợi 10:00 để kiểm thử nguồn kích hoạt.

## So sánh lựa chọn

| Lựa chọn | Đánh giá |
| --- | --- |
| Cron Triggers hiện tại | Chưa nghiệm thu được, không nên tiếp tục dùng làm nguồn duy nhất. |
| cron-job.org → HTTP Worker | Ưu tiên: tài khoản đã có, nguồn bên ngoài đã gọi GitHub thành công, loại bỏ phụ thuộc Cron Triggers; vẫn cần kiểm thử đường gọi trực tiếp. |
| Durable Objects Alarms | Có cam kết at-least-once và retry; cần thêm binding/migration, tự đặt lại alarm và chống xử lý trùng. Vẫn phụ thuộc Cloudflare; cân nhắc nếu sau này cần bộ điều phối bền vững phức tạp hơn. |
| GitHub Actions làm nguồn đăng chính | Không ưu tiên: lịch GitHub có thể trễ hoặc bỏ job; giữ cho CI và giám sát độc lập. |

## Nguồn chính thức đã đối chiếu

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/): thay đổi có thể mất tối đa 15 phút để lan truyền; lịch UTC.
- [Scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/): handler async trả promise được runtime chờ; thêm waitUntil không phải bản sửa đã xác minh cho lỗi này.
- [SDK issue #9882](https://github.com/cloudflare/workers-sdk/issues/9882): lỗi kiểm thử local với assets/redirected config.
- [SDK issue #13840](https://github.com/cloudflare/workers-sdk/issues/13840): cron bị bỏ khi deploy vào dispatch namespace.
- [cron-job.org FAQ](https://cron-job.org/en/faq/): hỗ trợ POST, custom header, khoảng tối thiểu một phút; mặc định timeout 30 giây; không bảo đảm đúng giờ tuyệt đối; có thể tự tắt sau hơn 25 lỗi liên tiếp.
- [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): schedule có thể trễ và job có thể bị bỏ khi tải cao.
- [Durable Objects Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/): at-least-once, tối đa sáu lần retry khi handler ném lỗi; recurring cần đặt lại alarm.
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): SQLite-backed Durable Objects dùng được trên Free; vẫn chịu giới hạn tài nguyên.

Không gửi bài cộng đồng hoặc hồ sơ hỗ trợ trong lần nghiên cứu này.
