# Bước 27 — Kiểm tra bài trên fanpage mỗi ngày

Phạm vi phê duyệt: khởi động kiểm tra lúc 08:00 theo Asia/Ho_Chi_Minh, ghi nhận trong Lịch sử. Không đăng lại, xóa bài, gửi thông báo Telegram vì trạng thái bài, hoặc mở lịch đăng tự động.

## Điều phối

Cron năm phút bắt đầu một đợt theo Page ID và ngày Việt Nam từ 08:00. Khi triển khai hoặc dịch vụ bỏ lỡ 08:00, đợt hôm đó có thể bắt đầu muộn; thời điểm kiểm tra thực được hiển thị. Không chạy bù các ngày đã qua. Kho bài đã đăng được chụp một lần trong transaction; bài được đăng sau đó vào đợt ngày tiếp theo.

Mỗi lượt giữ tối đa mười bài bằng một lệnh claim và chỉ GET Graph API. Thứ tự chuẩn bị và gửi bài lúc 10:00 được ưu tiên; kiểm tra lịch sử tiếp tục ở lượt nhẹ kế tiếp. Hai lượt cron đồng thời không đọc trùng một bài. Nếu tiến trình ngắt sau claim, hết lease ghi chưa xác minh; không tự GET lại bài đó trong ngày. Lưu được kết quả nhưng lỗi chiếu vào Lịch sử thì lượt sau áp dụng receipt, không đọc lại Facebook. Đợt đã kết thúc không mở lại khi đổi token.

Token, ứng dụng, Page và quyền được kiểm tra trước mỗi lô. Chỉ kiểm tra bài đã ghi nhận của đúng Page: publication theo lịch, P01 và bài kỹ thuật đã đăng thử. Bài đăng thủ công của người quản lý không được nhập hoặc thay đổi.

## Ý nghĩa trạng thái

- **Bài còn trên fanpage:** Graph đọc được đúng ID bài.
- **Không còn truy cập được bài trên fanpage:** phản hồi 400/code 100/subcode 33 sau khi kiểm tra kết nối Page thành công. Đây là quan sát khả năng truy cập; không khẳng định người quản lý đã xóa bài, vì quyền truy cập riêng của bài có thể thay đổi.
- **Chưa xác minh:** token, quyền, mạng, giới hạn API, redirect, phản hồi hỏng hoặc gián đoạn tiến trình. Giữ quan sát được xác minh trước đó, không ghi thành bài đã xóa.

Lịch sử giữ thời điểm kiểm tra, quan sát gần nhất và lần đầu không truy cập được. Nếu bài xuất hiện trở lại, trạng thái hiện tại trở về còn trên fanpage; thời điểm ghi nhận cũ vẫn giữ. Không lưu thông báo lỗi nguyên văn của nhà cung cấp hoặc URL chứa token.

## Lưu trữ và kiểm thử

`cloud_publication_presence` là dữ liệu nghiệp vụ trong backup schema 13. Run/claim là dữ liệu vận hành, không khôi phục từ backup; chỉ giữ bảy ngày để tránh tăng số dòng theo bình phương số bài lịch sử. Khôi phục vẫn giữ lịch tắt và cách ly nội dung. Dữ liệu lịch sử và caption/ảnh không bị xóa vì bài Facebook không đọc được.

Kiểm thử bao gồm ngưỡng 08:00, cạnh tranh cron, snapshot không bổ sung bài mới trong ngày, lô mười bài/ngân sách D1, token lỗi, timeout, redirect, Page khác, phục hồi receipt sau crash, bảo toàn bằng chứng cũ, backup và API riêng tư. Các tình huống bài thiếu dùng Graph giả lập; nghiệm thu trên staging chỉ đọc các bài thật đang có, không xóa bài để thử.
