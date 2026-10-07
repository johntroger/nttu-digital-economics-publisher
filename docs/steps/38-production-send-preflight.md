# Bước 38 — Chuẩn bị gửi và hồ sơ thử production

Người quản lý phê duyệt code Bước 38, giao chọn bài để lập hồ sơ. Chọn P01 «Một bảng doanh thu có thể kể điều gì?»; nội dung và thiết kế đã duyệt, không phụ thuộc bài trước. Chưa có phê duyệt đăng Facebook.

## Phần đã xây dựng

- POST `/api/production/send-preflight` chỉ nhận versionId; owner session, CSRF, đúng origin và JSON giới hạn 1 KB. Không nhận thời gian, token, URL hoặc đích từ caller.
- Dry-run chỉ SELECT, không dùng tick/heartbeat, không ghi permit/job/intent/evidence/slot/publication. Transport giới hạn GET tới debug_token và me trên Graph; chặn POST ngay tại capability.
- Dùng cùng identity, biên nhận duyệt, nguồn/facts, checksum và byte R2, Meta GET như adapter live. Đối chiếu lần nữa sau I/O; nguồn, version, cấu hình, operation generation, token hoặc ngày thay đổi làm hồ sơ thất bại.
- Chỉ tính hash đối với bài được chọn, dùng cùng phép đối chiếu trong live adapter. Projection riêng và projection cả kho cho kết quả cùng bài giống nhau.
- Hồ sơ gồm caption có separator/footer, ảnh/checksum/byte count, version/checkVersion/receiptDigest, Page cố định, release, dấu vân tay kết nối, revision, thời điểm đề xuất gần nhất theo server clock Việt Nam. Đề xuất sau ít nhất hai phút, làm tròn lên phút; hồ sơ hết hiệu lực trước thời điểm thử hoặc sau năm phút. Đây không phải lịch hoặc quyền đăng.
- Hàm cấp permit và kích hoạt thử một lần chỉ có thể dùng sau phê duyệt owner khớp hash còn hạn, deployment gate riêng và SQL fences. **Không có route HTTP cấp permit/kích hoạt/đối soát trong bản này**. Các hàm chỉ được gọi trong fixture/native test, không gọi production.
- Thử một lần xác nhận thành công tự tắt config và pause trong cùng batch finalizer; kết quả unknown vẫn giữ khóa Page, pause không gỡ khóa, chỉ bằng chứng GET tương quan mới hoàn tất. Giữ nguyên hành vi lượt thường trong Bước 37.
- Không có migration mới; schema vẫn 14, không thêm credential hay cron job, không đổi staging hoặc nguồn Telegram.

## Kiểm thử trước triển khai

TypeScript và 404/404 kiểm thử local đạt. Native compiled workerd/D1/R2: tám kịch bản, gồm dry-run 18 SELECT, không ghi quyền/job và thử một lần tự đóng; tất cả Graph được giả lập, 0 Meta POST thật. Nguồn/ảnh thay đổi, caller-selected time, CSRF/origin, hồ sơ hết hạn, phê duyệt sai hash, race/dedupe, unknown và đối soát đều được kiểm tra.

## Nghiệm thu cloud

Đang chờ CI và triển khai SHA đã kiểm thử. CPU/wall/query đo thực sẽ bổ sung tại đây. API Worker settings đã xác nhận usage_model standard và không có cpu_ms override, nhưng quyền OAuth không đọc được subscription (403); standard không tự chứng minh gói Free/Paid. Cần đọc dashboard để xác định ngân sách đúng. Không đổi gói trả phí và không coi burst là bảo đảm ổn định.

Tham chiếu chính thức: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) và [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/). Free có ngân sách CPU 10 ms; Paid có ngân sách khác. Chưa gắn ngân sách nào cho tài khoản nếu chưa có bằng chứng gói.

## Điều kiện trước thử thật

Chỉ sau khi kiểm tra CPU, UI và dữ liệu cloud đạt mới trình hồ sơ còn hiệu lực để người quản lý duyệt cụ thể bài, ảnh/version/hash, Page và thời điểm. Chưa bật lịch thường 10:00, chưa cấp publisher token hoặc nguồn kích hoạt ngoài. Phê duyệt code không tự cấp phê duyệt đăng.
