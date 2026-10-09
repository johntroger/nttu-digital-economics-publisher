# F4 — nghiệm thu cloud đang thực hiện

Ngày 09/10/2026. F4 đã được phê duyệt. Trạng thái: **chưa đạt nghiệm thu CPU, chưa rollout production**. Không nâng Workers Free, không POST Facebook thật và chưa cấp quyền publisher production.

Production tiếp tục dùng F2 `130a6ff98c9ff4cc4b7d54c330389890396f5fb8`, schema14. Bản sao SQL schema14 thật được giữ tại `tmp/step38/f4/backup/production-schema14.sql`. Môi trường đo là hai Worker và D1 clone có tên `nttu-f4-*`; chỉ đọc R2 gốc. Mọi Graph GET/POST chuyển đến mock riêng qua mạng, dùng credential giả. Không gọi Google, Telegram hoặc Meta thật trong lượt giả lập.

## Kết quả hiện có

Luồng sáu giai đoạn và trạng thái quản lý/giám sát đạt kiểm tra chức năng. Bản `87d2ba7` có mẫu warm gửi bài trung bình 10,9 ms / cao nhất 15 ms (19 mẫu), monitor trung bình 9,3 ms / cao nhất 15 ms (91 mẫu); finalizer có một mẫu 13 ms. Chưa đủ 30 mẫu ở mọi pha. Bộ đo ngừng nhận sự kiện mới giữa lượt; đã dừng tiến trình đo riêng, giữ bằng chứng và dọn cache qua bộ chạy. Không coi HTTP200 hoặc invocation outcome `ok` là đủ nghiệm thu.

Bản `d180a35` giảm SDK/database overhead, đạt 450 kiểm thử local và CI Windows/Linux [37880594581](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37880594581). Probe 19 request chạy đúng toàn chuỗi nhưng vẫn có mẫu CPU vượt mục tiêu. Bằng chứng riêng được giữ trong `tmp/step38/f4/probe-1791517680812-{requests,tail}.json`. Số đo này không được gộp với phiên bản tối ưu tiếp theo.

Bản `7114240` đạt 453 kiểm thử và [CI Windows/Linux](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37882130612). CF version `91da11b7-126a-41e7-8a90-2a3c4c5ddd8d`, deployment đo 5. Sau khi deploy có một probe nhận content từ release cũ: hàng rào release hủy job ở pha ảnh, không POST. Probe sau lan truyền chạy đúng toàn chuỗi. Lượt đo đầy đủ `publish-1791519150983` có 2.242 request / 706 sự kiện, đủ ít nhất 30 warm cho mọi pha, **vẫn chưa đạt CPU**:

| Pha | Warm | Trung bình ms | p95 ms | Cao nhất ms |
| --- | ---: | ---: | ---: | ---: |
| Nội dung | 33 | 7,6 | 13 | 15 |
| Ảnh | 35 | 6,1 | 12 | 12 |
| Kết nối | 35 | 6,2 | 11 | 11 |
| Gửi mock POST | 45 | 10,5 | 22 | 22 |
| Đối soát GET | 37 | 6,0 | 12 | 14 |
| Chốt evidence | 30 | 4,7 | 10 | 11 |
| Monitor | 221 | 5,0 | 9 | 15 |

Chỉ tính warm có `outcome=ok`, đúng CF version và deployment. Các request lỗi, cold, fixture reset và dữ liệu thô đã bỏ bí mật được giữ riêng; không bỏ đỉnh cao để làm đẹp kết quả. Không dùng số liệu phiên bản này để nghiệm thu ứng viên kế tiếp.

## Tối ưu tiếp theo trong F4

Chốt projection phê duyệt và snapshot các trường điều kiện trong cùng transaction SELECT của D1. Ghi snapshot bất biến vào journal schema15 chưa phát hành. Trước intent và ngay trước POST, SQL so sánh lại snapshot cùng điều kiện hiện hành, khóa ngày/Page, lease, generation, revision, hạn proof và permit. Request POST vẫn đọc/xác minh bytes R2; nội dung phiên bản, review và file hoàn tất vẫn được bảo vệ bằng trigger bất biến. Không tin biên nhận do client tạo và không chuyển phép duyệt thành quyền đăng.

Monitor tải thống kê cần thiết thay vì lịch sử thông báo và kiểm Meta cũ không dùng; giảm lượt đọc trạng thái trùng. Kiểm thử bổ sung: snapshot không sửa được; nguồn/phiên bản/hạn duyệt thay đổi; thay đổi trước claim và sau intent đều không POST. Thay đổi schema15 trong vòng lặp đo chỉ áp dụng lên clone; production hiện chưa có schema15.

Ứng viên tiếp theo giảm leased read từ chín response D1 xuống hai, bỏ job snapshot và library metadata không dùng; giữ một transaction và fresh fences trước outbound. SHA/Blob dùng đúng lát ArrayBuffer, giữ checksum và bản sao bất biến của native API, tránh copy PNG thêm lần nữa. 454 kiểm thử local đạt, gồm upload/hash không đọc bytes nằm ngoài lát ảnh; còn phải qua CI và đo cloud của đúng phiên bản.

Bản `7343e6f` đã đạt [CI Windows/Linux 37884100902](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37884100902), triển khai trên clone ở deployment6 / CF version `f37da61b-1f20-435a-84e0-211229ab4e89`. Probe `probe-1791528811027` chạy đúng 19 request nhưng pha gửi có 14 ms. Lượt `publish-1791528841709` dừng sớm khi đã xác nhận không đạt: send có 9 warm, trung bình 11,2 ms, max21; content max12, image/connection max11, monitor max13. Không đủ mẫu để nghiệm thu và không gộp số liệu với ứng viên kế tiếp. Đã dừng đúng child đo, bộ chạy dọn cache và xóa một tail riêng; giữ bằng chứng.

Ứng viên mới đóng gói multipart bằng Blob một lần thay vì serialize FormData thêm lần nữa; giữ nguyên bytes/checksum, kiểm lại UTF-8 caption và dữ liệu nguồn bằng HTTP parser cho cả send/dispatch. 455 kiểm thử local đạt. Bộ đo dừng sớm khi vượt 10 ms, vẫn yêu cầu ít nhất 30 warm mỗi endpoint để đạt, và làm mới tail cả lượt reads/stock. Chưa có kết quả CPU cloud cho ứng viên này; không coi thay đổi đóng gói là đã giải quyết lỗi.

Bản multipart `47c59d7` đạt [CI Windows/Linux 37896741427](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37896741427). Deployment7 đo trong `publish-1791529657845`: 19 request chức năng đúng, 16 sự kiện, nhưng content15/image11/send15/monitor17 ms. Max22 gồm fixture; không quy con số22 cho publisher. Bộ đo đã dừng, tự đóng tail và dọn cache. Chưa đủ30 warm và **không đạt** ngay vì có mẫu vượt10 ms; không tiếp tục lặp để tìm một lượt đẹp hơn. Production được đọc lại sau lượt đo: 40 bài, 56 asset, schema14, permit/job/intent/publication0, enabled0, paused1. Không rollout. Đề xuất thay đổi phạm vi tại `38-f5-free-runner-proposal.md` chờ duyệt.

Đã xóa hai Worker đo/mock và D1 clone thuộc F4; ledger giữ ID kiểm toán nhưng bỏ token và đánh dấu deleted. Giữ backup thật, log triển khai/CI và số đo đã bỏ bí mật. Cấu hình clone/SQL fixture và helper tạm được dọn sau khi tiến trình đóng. F4 vẫn chưa hoàn tất nghiệm thu; kế hoạch rollout bên dưới là điều kiện còn thiếu, không phải thao tác đã thực hiện.

## Việc còn lại trước nghiệm thu

1. Chốt kiểm thử local, native và CI của đúng phiên bản ứng viên.
2. Đo ít nhất 30 mẫu warm mỗi endpoint/giai đoạn, ghi cold quan sát được riêng, p95/max/outcome. Làm mới tail theo đợt; thiếu mẫu là chưa đạt.
3. Kiểm đầy đủ F1, F2, sáu pha publisher, stock và monitor. Nếu còn mẫu vượt mục tiêu thì tiếp tục xử lý.
4. Khi đạt, triển khai Worker tương thích schema14/15 với cửa đóng **trước** migration15; xác minh kho, cổng, Telegram/monitor và owner UI.
5. Xóa Worker/mock/D1 clone cùng credential đo; giữ bản sao lưu thật và bằng chứng đã bỏ bí mật.
6. Chuẩn bị hồ sơ một bài mới và xin duyệt riêng trước Facebook POST thật. Phê duyệt F4 không tự bật lịch thường.
