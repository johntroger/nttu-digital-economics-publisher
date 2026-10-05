# Bước 2 — kho nội dung và điều kiện chọn bài

Ngày: 05/10/2026. Phê duyệt đầu vào: chủ tài khoản yêu cầu “làm bước 2”.
Trạng thái: hoàn thành phạm vi backend local, kiểm thử đạt; dừng trước bước 3.

## Kết quả

- Migration 0002 thêm danh mục phiên bản đang dùng, lô nhập, nguồn, facts, tham chiếu nguồn/facts,
  tiền đề, liên kết ảnh với phiên bản và hồ sơ kiểm định. Không biến PDF vừa nhận thành nguồn verified.
- Nhập 40 đề cương thật từ content/content-plan-40.json vào SQLite local: 30 chính, 10 dự phòng;
  28 hướng tới sinh viên, 12 hướng tới học sinh; 32 kiến thức/nghề nghiệp, 8 giới thiệu ngành.
  Nhập lại cùng lô không nhân bản. Lô bị sửa bị từ chối; lỗi giữa chừng rollback toàn bộ.
- Hai facts khóa 2026 và thời lượng 3,5 năm có nguồn xác nhận của người dùng riêng;
  không sửa PDF hoặc ghi nguồn tài liệu chưa kiểm tra thành verified. Thông tin khác trong đề cương vẫn cần đối chiếu.
- Một hàm eligibility dùng chung cho đếm kho và chọn dự phòng. Trả lý do chặn cụ thể:
  nháp, chưa ready, nguồn/facts hết hạn/chưa xác minh, sai khóa/thời lượng, ảnh không sẵn sàng,
  ảnh hoặc QA lệch phiên bản/checksum, footer cũ, bài đã dùng, đang giữ/chưa rõ kết quả,
  thiếu tiền đề và thân bài trùng lịch sử sau chuẩn hóa.
- QA yêu cầu cả năm tiêu chí và kiểm tra bắt buộc đạt; không cộng tổng điểm để bỏ qua lỗi bắt buộc.
  Đổi nội dung hoặc tham chiếu tăng check_version, làm QA/ảnh cũ không còn hợp lệ.
  Tham chiếu của phiên bản đã có job bất biến; trạng thái nguồn vẫn có thể bị chặn khi phát hiện lỗi.
- Kho đếm theo post_id, chỉ dùng active_version, không tự quay về phiên bản ready cũ khi bản sửa còn nháp.
  Ngưỡng kho thấp là <=3 bài đủ điều kiện, không phải tổng số đề cương.
- Dự phòng: cùng nhóm/cùng đối tượng → cùng nhóm/khác đối tượng → khác nhóm/cùng đối tượng → còn lại.
  Trong từng nhóm ưu tiên góc chưa xuất hiện gần đây, rồi thứ tự ổn định và ID.
  Repository hiện dùng cửa sổ 14 ngày cho ưu tiên góc; đây là ưu tiên mềm, không chặn bài vì góc gần đây.
  Danh sách excluded cho phép caller loại ứng viên lỗi và chọn tiếp, không giới hạn ba bài dự phòng.
- Lịch sử và giữ bài được đọc theo page connection; staging không tiêu production usage.
  Một phiên bản mới hoặc một ID mới không vượt qua kiểm tra trùng toàn bộ thân bài đã đăng trên cùng page.
  Góc lịch sử lấy từ metadata phiên bản đã pin, không lấy góc hiện tại có thể sửa của bài.
- Footer cố định được nối một lần, giữ TikTok đúng và một nhóm hashtag; đoạn footer lặp/sai vị trí bị từ chối.

## Kiểm thử đã chạy

`npm.cmd run check`: TypeScript strict đạt; **42 PASS, 0 FAIL, 0 SKIP**.
Gồm 21 test nền bước 1 và 21 test bước 2. SQLite in-memory thật, HTTP loopback thật;
dữ liệu ready/ảnh trong test là fixture có chủ đích, không chứng nhận ảnh sản xuất đã dựng.

Nhánh đã kiểm tra: nguồn hết hạn đúng thời điểm, ngày nguồn sai, nguồn kiểm tra sau QA,
facts sai khóa/thời lượng, kiểm tra bắt buộc trượt, ảnh/checksum/footer lệch, usage theo bài gốc,
unknown dù lease hết hạn, tiền đề thiếu, đủ bốn nhánh dự phòng, bỏ nhiều dự phòng liên tiếp,
trùng thân bài sau chuẩn hóa, nhập lại, lô thay đổi, cycle tiền đề và rollback nhập.

Lượt đầu có một test dùng UPDATE trên dòng chưa tồn tại nên không kiểm tra được ràng buộc;
đã sửa thành INSERT sai liên kết và chạy lại toàn bộ thành công.

Chạy thực tế hai lần:

```powershell
node scripts/catalog.mjs --database tmp/step-02/catalog.sqlite
```

Lần đầu nhập 40; lần hai nhập 0, giữ nguyên 40. File kết quả: docs/steps/02-catalog-result.json.
**40 bản nháp, 0 bài đủ điều kiện, 0 ngày phủ kho.** Đây là trạng thái đúng vì chưa có caption/PNG/QA đầy đủ.

## Giới hạn hiện tại

CLI kiểm tra danh mục là local, không phải GUI hay API inventory cho page đã kết nối.
Repository TS không phụ thuộc Node nhưng adapter hiện có chỉ là SQLite local; chưa chạy D1 thật.
Đọc eligibility/stock là kiểm tra tại một thời điểm, chưa phải giữ bài nguyên tử;
bước tiếp theo phải kiểm tra lại trong giao dịch claim và kiểm tra trước gửi.
Schema/eligibility kiểm tra metadata ảnh và QA, chưa tải file R2, kiểm chứng byte PNG hoặc dựng banner.
Mốc kiểm định nguồn được đối chiếu tại thời điểm đánh giá; chưa có scheduler gửi cảnh báo Telegram.
Không có kiểm tra gần giống về nghĩa bằng AI; kiểm tra toàn bộ thân bài và góc chỉ hỗ trợ biên tập.
Chưa có UI sửa/import, Google OAuth, Meta/Telegram adapter, scheduler, GitHub remote hoặc deploy.
Không có thao tác gửi bài hoặc gọi API AI trong bước này.

## Bước 3 đề xuất, chờ phê duyệt

Xây cơ chế giữ slot/bài/page trong giao dịch, ownership/generation, pause/maintenance barrier,
snapshot caption/ảnh/footer và ghi intent trước gửi. Kiểm thử tranh chấp hai lượt chạy,
ngăn giữ lại bài đang unknown, thay đổi pause/maintenance và mất quyền sở hữu.
Chỉ chạy local với dữ liệu giả; chưa gửi Meta/Telegram hoặc triển khai cloud.
