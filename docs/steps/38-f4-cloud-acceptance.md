# F4 — nghiệm thu cloud đang thực hiện

Ngày 09/10/2026. F4 đã được phê duyệt. Trạng thái: **chưa đạt nghiệm thu CPU, chưa rollout production**. Không nâng Workers Free, không POST Facebook thật và chưa cấp quyền publisher production.

Production tiếp tục dùng F2 `130a6ff98c9ff4cc4b7d54c330389890396f5fb8`, schema14. Bản sao SQL schema14 thật được giữ tại `tmp/step38/f4/backup/production-schema14.sql`. Môi trường đo là hai Worker và D1 clone có tên `nttu-f4-*`; chỉ đọc R2 gốc. Mọi Graph GET/POST chuyển đến mock riêng qua mạng, dùng credential giả. Không gọi Google, Telegram hoặc Meta thật trong lượt giả lập.

## Kết quả hiện có

Luồng sáu giai đoạn và trạng thái quản lý/giám sát đạt kiểm tra chức năng. Bản `87d2ba7` có mẫu warm gửi bài trung bình 10,9 ms / cao nhất 15 ms (19 mẫu), monitor trung bình 9,3 ms / cao nhất 15 ms (91 mẫu); finalizer có một mẫu 13 ms. Chưa đủ 30 mẫu ở mọi pha. Bộ đo ngừng nhận sự kiện mới giữa lượt; đã dừng tiến trình đo riêng, giữ bằng chứng và dọn cache qua bộ chạy. Không coi HTTP200 hoặc invocation outcome `ok` là đủ nghiệm thu.

Bản `d180a35` giảm SDK/database overhead, đạt 450 kiểm thử local và CI Windows/Linux [37880594581](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37880594581). Probe 19 request chạy đúng toàn chuỗi nhưng vẫn có mẫu CPU vượt mục tiêu. Bằng chứng riêng được giữ trong `tmp/step38/f4/probe-1791517680812-{requests,tail}.json`. Số đo này không được gộp với phiên bản tối ưu tiếp theo.

## Tối ưu tiếp theo trong F4

Chốt projection phê duyệt và snapshot các trường điều kiện trong cùng transaction SELECT của D1. Ghi snapshot bất biến vào journal schema15 chưa phát hành. Trước intent và ngay trước POST, SQL so sánh lại snapshot cùng điều kiện hiện hành, khóa ngày/Page, lease, generation, revision, hạn proof và permit. Request POST vẫn đọc/xác minh bytes R2; nội dung phiên bản, review và file hoàn tất vẫn được bảo vệ bằng trigger bất biến. Không tin biên nhận do client tạo và không chuyển phép duyệt thành quyền đăng.

Monitor tải thống kê cần thiết thay vì lịch sử thông báo và kiểm Meta cũ không dùng; giảm lượt đọc trạng thái trùng. Kiểm thử bổ sung: snapshot không sửa được; nguồn/phiên bản/hạn duyệt thay đổi; thay đổi trước claim và sau intent đều không POST. Thay đổi schema15 trong vòng lặp đo chỉ áp dụng lên clone; production hiện chưa có schema15.

## Việc còn lại trước nghiệm thu

1. Chốt kiểm thử local, native và CI của đúng phiên bản ứng viên.
2. Đo ít nhất 30 mẫu warm mỗi endpoint/giai đoạn, ghi cold quan sát được riêng, p95/max/outcome. Làm mới tail theo đợt; thiếu mẫu là chưa đạt.
3. Kiểm đầy đủ F1, F2, sáu pha publisher, stock và monitor. Nếu còn mẫu vượt mục tiêu thì tiếp tục xử lý.
4. Khi đạt, triển khai Worker tương thích schema14/15 với cửa đóng **trước** migration15; xác minh kho, cổng, Telegram/monitor và owner UI.
5. Xóa Worker/mock/D1 clone cùng credential đo; giữ bản sao lưu thật và bằng chứng đã bỏ bí mật.
6. Chuẩn bị hồ sơ một bài mới và xin duyệt riêng trước Facebook POST thật. Phê duyệt F4 không tự bật lịch thường.
