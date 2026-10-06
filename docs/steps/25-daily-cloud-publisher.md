# Bước 25 — Luồng đăng hằng ngày trên cloud

## Phạm vi

Thêm bộ điều phối thật sử dụng D1/R2 và Meta Graph API, giới hạn fanpage thử Tập Viết `551227411605506`. Có giao diện lịch, nút dừng và đối soát bằng ID bài. Không bật lịch hoặc đăng thêm Facebook trong bước này. Không kết nối fanpage chính thức.

## Hoạt động

Ba điều kiện cùng cần thiết: biến triển khai `DAILY_PUBLISHING_ENABLED=true`, cấu hình lịch đã được người quản lý xác nhận, và trạng thái ứng dụng không tạm dừng. Mặc định biến chưa được mở; cấu hình mới enabled=0 và chưa có ngày bắt đầu. Phê duyệt nội dung không thay thế phê duyệt bật lịch.

Lịch 10:00 theo Asia/Ho_Chi_Minh. Cron mỗi năm phút chuẩn bị một bài từ 9:55; lượt đến 10:00 mới ghi ý định gửi rồi POST ảnh và caption. Nếu dịch vụ bỏ lỡ lượt chuẩn bị, bài được chuẩn bị khi chạy lại và gửi ở lượt sau. Không cam kết thời điểm tuyệt đối khi cron hoặc Meta bị chậm.

Mỗi lượt chỉ gửi tối đa một lần để giữ ngân sách truy vấn. Cảnh báo kho và giao Telegram chuyển sang lượt kế tiếp khi lượt gửi sử dụng nhiều truy vấn. Đây là giới hạn thực tế của [D1 Free: 50 truy vấn mỗi Worker invocation](https://developers.cloudflare.com/d1/platform/limits/). Kiểm thử đo riêng lượt chuẩn bị, gửi và kiểm kho; heartbeat chiếm thêm hai truy vấn. Bài dự phòng được chuẩn bị ở lượt kế tiếp rồi gửi ở lượt sau, trong cùng ngày khi còn thời gian; không tạo bài bằng AI.

Lỗi được Meta xác nhận rõ ràng mới được thử lại cùng snapshot, tối đa ba lần, cách nhau năm phút. Khi hết lượt hoặc bị từ chối nội dung, giữ công việc lỗi và tìm bài dự phòng cùng nhóm trước, sau đó nhóm khác. Token hoặc quyền lỗi dừng lịch và báo Telegram.

Timeout, 5xx, phản hồi thiếu dữ liệu và kết quả chưa đối chiếu được đều giữ quyền giữ chỗ để tránh đăng trùng. Không tự gửi lại hay lấy dự phòng khi kết quả cũ chưa rõ. Nếu có ID bài từ phản hồi, cron đọc lại Facebook; nếu không, người quản lý nhập ID bài trong giao diện để đọc đối soát. Việc xác minh kiểm tra Page ID, nội dung và thời điểm, chưa đối chiếu bytes ảnh Facebook.

Ý định gửi và từng bằng chứng được lưu bền vững. Khi lưu lịch sử lỗi sau khi đã có bằng chứng thành công, lượt sau áp dụng lại bằng chứng, không POST lần nữa. Lịch sử lưu caption/ảnh/footer và ngày thực tế Facebook tạo bài; xác nhận muộn chặn bài khác của ngày thực tế đó. Bài thủ công của người quản lý không bị điều phối tự động.

Ngày bị bỏ lỡ không đăng bù nhiều bài: lịch cũ hết hạn và bài chưa gửi trở lại dự phòng. Sau 30 ngày tiếp tục lấy kho còn lại, không tự sinh nội dung. Kho còn không quá ba bài cảnh báo theo đợt; hết kho dừng và báo bổ sung.

Trước ý định gửi, transaction kiểm tra lại phiên bản active, review, ảnh, liên kết nguồn, thời hạn, facts khóa 2026/3,5 năm và thế hệ bảo trì. 40 dấu duyệt đã nhập ở Bước 24 được dùng làm căn cứ; không sửa hàng loạt status thành ready. Sao lưu cho phép lịch sử đã giải quyết khi lịch dừng, từ chối công việc chưa rõ kết quả. Khôi phục vẫn cách ly nội dung và giữ cấu hình đăng mặc định tắt.

## Kiểm thử và giới hạn nghiệm thu

Các kiểm thử riêng kiểm tra mặc định tắt, quyền owner/CSRF, đúng giờ, cạnh tranh cron, retry ba lần, thay đổi nguồn/ảnh trong preflight, mất phản hồi, crash finalization, xác nhận muộn, ngày bỏ lỡ, kho trống, cảnh báo kho, ngân sách truy vấn và backup lịch sử. Các Graph/Telegram gọi trong fixture đều là phản hồi giả lập; chúng không chứng minh bài nội dung mới đã đăng được lên fanpage thật.

Cần bước riêng được phê duyệt để đăng thử một bài đã duyệt, kiểm tra caption/ảnh/ba logo trên Facebook và thông báo Telegram. Sau đó mới chốt ngày bắt đầu và mở lịch thử. Kiểm tra bài bị xóa mỗi ngày là phần nghiệm thu vận hành tiếp theo, chưa được thêm ở Bước 25.
