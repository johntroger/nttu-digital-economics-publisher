# F5 — runner GitHub Actions đã được duyệt cho code và giả lập

Ngày 09/10/2026. Chủ dự án đã chọn «GitHub Actions: theo đề xuất F5 đã lưu», giới hạn code và kiểm thử giả lập trên nhánh draft. Không chuyển sang Supabase, không thay cấu hình vận hành hoặc cho phép Facebook POST thật. Kết quả thực hiện được ghi tại [hồ sơ F5](38-f5-actions-runner.md).

## Cơ sở lựa chọn

F4 đạt chức năng và 455 kiểm thử local; CI Windows/Linux của `47c59d7` đạt. Cloud mock đúng release vẫn có content15 ms, image11 ms, send15 ms và monitor17 ms ngay lượt đầu. Đây là bằng chứng không đạt ngân sách đã chốt, không phải chứng minh mọi thiết kế Workers Free đều bất khả thi. Các tối ưu vừa rồi chưa tạo được khoảng CPU đủ an toàn; chưa nên rollout pipeline này.

Giữ Cloudflare Free cho giao diện, OAuth, D1, R2 và các API nhỏ. Chuyển kiểm tra nội dung/ảnh, tính hash, dựng multipart, gọi Meta, đối soát và tổng hợp giám sát sang một tiến trình Node trên GitHub Actions Linux tiêu chuẩn. Repo tiếp tục riêng tư. Không dùng máy tính cá nhân làm server, không mua Workers Paid và không thêm một dịch vụ hosting mới.

## Luồng dự kiến

1. cron-job.org kích hoạt workflow publisher riêng theo lịch hằng ngày; nguồn này đã được dùng cho monitor. Giữ lịch 10:00 Asia/Ho_Chi_Minh, tối đa một bài tự động mỗi ngày. GitHub schedule chỉ dự phòng vì thời điểm chạy có thể trễ. Không dispatch publisher mỗi phút.
2. Runner lấy bài đã duyệt và ảnh qua API hạn chế của Worker; từng trang dữ liệu có giới hạn. Worker stream ảnh R2, runner kiểm lại checksum/kích thước/nội dung trước khi lập intent. Không mở bucket công khai.
3. Worker giữ D1 làm nguồn sự thật. API cố định nhận job/attempt đang được cấp, không nhận Page tùy ý, SQL, caption thay thế hoặc đồng hồ client. Thời gian, quyền, lease, revision, ngày đăng, nguồn/fact, snapshot phê duyệt và checksum đều được đối chiếu bằng điều kiện server.
4. Ghi intent bền vững trước outbound; gọi lại cổng kiểm tra ngay trước POST. Sau khi có intent, mọi lần mất kết nối/runner bị hủy đều chuyển sang đối soát, không tự POST lần hai. GitHub concurrency chỉ là lớp bổ sung, khóa D1 mới quyết định việc đăng.
5. Node dùng token Page trong GitHub Actions Secret, thực hiện một POST, sau đó GET đối soát Page/caption/thời gian và gửi bằng chứng về API. API ràng buộc bằng chứng với attempt đang có; chỉ credential runner riêng mới được báo kết quả. Không coi remote ID riêng lẻ hoặc HTTP200 là xác nhận.
6. Nếu thiếu bằng chứng, giữ khóa unknown. Lượt phục hồi chỉ GET; trường hợp không có remote ID phải xử lý bằng hồ sơ đối soát và phê duyệt riêng. Không hứa exactly-once khi Meta và D1 không cùng transaction.
7. Giám sát bên ngoài đọc trạng thái D1 nhỏ, tự kiểm Meta và gửi cảnh báo từ Node. Không tạo bản tin kiểm thử hoặc gọi Meta thật trong giai đoạn giả lập. Luồng Telegram hiện hành giữ nguyên cho tới khi phần thay thế qua nghiệm thu.

## Quyền và bí mật

API runner có capability riêng, khác token monitor/Telegram/owner. Không mở API D1 trực tiếp bằng token quản trị tài khoản. Không trả Meta secret qua HTTP, không đưa token vào log/artifact/URL. Các Secret Meta phải được chủ dự án lưu trực tiếp vào GitHub ở bước kết nối đã duyệt; không trích xuất từ Cloudflare. Workflow chỉ chạy mã đã duyệt từ ref tin cậy, không cấp secret cho PR/fork và không nhận URL outbound tùy ý. Hướng dẫn luân chuyển/thu hồi phải có trước bật lịch.

## Điều kiện giữ miễn phí

Theo [GitHub — dung lượng đi kèm gói](https://docs.github.com/en/billing/reference/product-usage-included), GitHub Free có 2.000 phút Actions/tháng cho repo riêng tư; hạn mức dùng chung với CI và monitor. Cần đọc mức sử dụng thực tế trước khi kết nối. Không coi đây là miễn phí không giới hạn.

Ví dụ để lập ngân sách, nếu monitor mỗi 30 phút dùng một phút/lượt thì tháng31 ngày đã chi khoảng1.488 phút. Publisher31 lượt, giới hạn3 phút/lượt, chi tối đa93 phút trước lượt phục hồi/CI. Đây chỉ là phép tính kế hoạch, chưa phải số đo tài khoản; một lượt monitor có thể dùng nhiều hơn một phút. F5 phải đo số phút thực tế, dành dự phòng, đặt ngân sách chặn chi tiêu vượt gói ở mức0 và kiểm tra quota trước khi bật vận hành. Nếu không đủ quota, trình phương án giảm chi phí monitor và kiểm thử lại, không tự giảm mức giám sát hoặc mở repo công khai. Quota hết thì cảnh báo/giữ bài; không cam kết đăng đúng giờ trong tình huống đó.

## Phạm vi xin duyệt trước mắt

**F5 chỉ code runner Node, API mỏng và kiểm thử giả lập trên nhánh draft riêng.** Chưa thêm secret thật, chưa sửa main/cron đang chạy, chưa thay Worker production và chưa đăng Facebook. Chuẩn bị bản migration/rollback và hồ sơ triển khai đóng để duyệt sau khi có bằng chứng.

Kiểm thử bắt buộc: hai runner cạnh tranh chỉ có một intent; pause/revoke trước và sau intent; thay nguồn/ảnh/phiên bản; clock/Page/credential giả; runner crash trước/sau POST, sau GET và trước callback; callback bị mất/lặp/giả; hết quota; lịch lệch ngày; retry chỉ khi chứng minh chưa gửi; bảo toàn40 bài/56 asset. Dùng HTTP mock có kiểm multipart và native D1, không chỉ mock giá trị trả về.

Đo mỗi API Worker mới ít nhất30 warm riêng đúng release, ghi cold/p95/max/outcome và dừng khi vượt ngân sách. Đo thời gian/minutes của runner, kiểm API phân trang không tăng chi phí theo cả kho. Không đạt thì chưa triển khai. Facebook POST thật và bật lịch chính thức vẫn cần phê duyệt riêng cho bài/cấu hình cụ thể.
