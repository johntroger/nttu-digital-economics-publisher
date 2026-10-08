# Bước 38 — Phương án nghiệm thu ngân sách CPU

Ngày 08/10/2026: đang chờ lựa chọn của người quản lý. Đây là kế hoạch xử lý điều kiện chưa đạt trong Bước 38, chưa phải phê duyệt code bước mới hoặc nâng gói. Bằng chứng và phạm vi đã triển khai nằm trong [báo cáo Bước 38](38-production-send-preflight.md).

## Phương án A — Workers Paid

Phù hợp với kiến trúc hiện tại và ít thay đổi hơn. [Giá chính thức](https://developers.cloudflare.com/workers/platform/pricing/) hiện có phí nền 5 USD/tháng cộng sử dụng. Người quản lý tự xác nhận và nâng gói trong Cloudflare; agent không thực hiện giao dịch từ phê duyệt code.

Sau khi nâng: đọc lại gói/giới hạn thực, chọn giới hạn CPU phù hợp và triển khai trong phạm vi được duyệt; đo lại dry-run, preview và management bằng các lượt cold/warm. Kiểm tra không có lỗi CPU, thời gian chờ bị giới hạn và trạng thái D1 không phát sinh quyền hoặc công việc. Báo cáo số mẫu và mức sử dụng so với ngân sách; không chỉ lấy HTTP200 làm nghiệm thu. Việc nâng gói không mở cửa đăng.

## Phương án B — Giữ Workers Free

Cần thiết kế lại dry-run, preview và management để từng request nằm dưới 10 ms với khoảng dư. Phân trang preview; tránh tính lại toàn kho khi render management; tách chuẩn bị bài thành các request có công việc CPU nhỏ, thay vì chỉ kéo dài wall timeout.

Mỗi giai đoạn chuẩn bị chỉ trả receipt ngắn hạn gắn owner, release, Page cố định, version, checksum, revision và operation generation. Receipt không cấp quyền đăng. Không đưa token Meta vào trình duyệt hoặc cho caller chọn URL. Bước cuối đọc lại trạng thái D1, kiểm receipt hiện hành và ngày Việt Nam; thay đổi trong khi chuẩn bị phải hủy hồ sơ.

Đường gửi sau này vẫn phải giữ atomic intent/day/Page locks, kiểm version trước outbound, giữ khóa unknown và phục hồi evidence mà không POST lại. Không chia nhỏ bằng cách bỏ các hàng rào này. Cần thử native race/crash/expiry và đo CPU thật từng request, bao gồm finalizer/đối soát; chưa có bằng chứng cho thấy chỉ tách dry-run sẽ đủ cho cả đường gửi.

Trước khi code phương án B: trình thiết kế request/receipt và phạm vi thay đổi để người quản lý duyệt theo quy trình từng bước. Nếu không thể đạt ngân sách mà giữ các ràng buộc trên, báo rõ và đánh giá lại phương án triển khai. Không hứa vận hành ổn định trên Free trước khi đo đạt.

## Điều kiện chung

Giữ production publisher tắt và không cấp permit/credential/job trong quá trình xử lý tài nguyên. Không đổi staging đang đăng trên Tập Viết. Khi đạt ngân sách, tạo lại hồ sơ P01 còn hiệu lực để review; đăng thử thật cần phê duyệt riêng. Chỉ sau thử thật thành công mới xét bật lịch chính thức 10:00 Việt Nam, một bài/ngày.
