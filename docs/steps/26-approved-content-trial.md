# Bước 26 — Đăng thử P01 đã duyệt

Phạm vi được phê duyệt: đăng đúng một bài P01 “Một bảng doanh thu có thể kể điều gì?” lên fanpage thử Tập Viết (551227411605506), đối chiếu caption/ảnh và thông báo Telegram. Lịch hằng ngày vẫn tạm dừng; không mở `DAILY_PUBLISHING_ENABLED` và không chuyển sang fanpage chính thức.

## Cách hoạt động

Giao diện Lịch đăng hiển thị caption gồm dấu phân cách, footer chuẩn và ảnh gốc P01 trong R2 riêng tư. Người quản lý lưu bản đăng thử; hệ thống ghim phiên bản active, check version, caption, checksum ảnh, ứng dụng và Trang đích. Không dựng ảnh mới và không sửa 40 dấu duyệt đã nhập.

Trước khi gửi, hệ thống kiểm tra lại review, nguồn, ảnh, token/quyền và thời hạn tối thiểu 24 giờ. Transaction ghi một ý định gửi duy nhất khi ứng dụng dừng, không bảo trì và không có công việc khác chưa giải quyết. Hai yêu cầu đồng thời chỉ một yêu cầu được gửi ảnh qua Graph API. Cookie Google và CSRF bắt buộc; health token không có quyền đăng.

Nếu có kết quả thành công, đọc lại Facebook để so sánh Page ID, caption và thời điểm tạo bài, lưu receipt và thông báo Telegram trong một transaction. Lịch sử quản lý hiển thị bài thử. Kho 30 bài chính và 10 dự phòng vẫn giữ nguyên để triển khai chính thức sau này; bài thử không tạo slot hoặc publication của lịch hằng ngày.

Nếu timeout hoặc kết quả chưa rõ, giữ trạng thái intent/unknown, không POST lại. Khi có ID bài, cron hoặc nút đối chiếu chỉ đọc Facebook. Lưu được bằng chứng thành công nhưng lỗi bước hoàn tất thì lần đối chiếu sau áp dụng receipt, không gửi lại. Meta từ chối rõ ràng giữ trạng thái rejected để xử lý; bước này không tự lấy dự phòng.

Bài thử là receipt vận hành của môi trường staging, tương tự bài kỹ thuật Bước 21; không nằm trong gói khôi phục kho nghiệp vụ. Không sao lưu hoặc bật lịch khi bài thử chưa rõ kết quả. Bản ghi D1 và bài Facebook được giữ để đối chiếu; phục hồi receipt vận hành cần xử lý riêng.

## Kiểm thử

Các kiểm thử gồm cạnh tranh gửi, thiếu phê duyệt, sai phiên bản P01, ảnh hỏng, nguồn thay đổi khi kiểm tra Meta, timeout, đọc đối soát, lỗi hoàn tất receipt, ngân sách 50 truy vấn D1 và quyền owner/CSRF. Kiểm thử D1/R2 thực trên máy dùng phản hồi Graph giả lập, không đăng Facebook.

Kiểm tra ảnh Facebook thực tế là nghiệm thu trực quan, vì readback API chưa so sánh pixels ảnh đã được Facebook nén. Chỉ ghi hoàn thành nghiệm thu thật sau khi staging đã đăng và kết quả thực được kiểm tra.
