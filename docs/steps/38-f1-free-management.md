# Bước 38 / F1 — Giao diện đọc trên Workers Free

F1 được phê duyệt ngày 08/10/2026. Phạm vi chức năng và số đo đọc hiện tại đạt để trình duyệt F2; F2–F4 chưa được phê duyệt. Nghiệm thu toàn hệ thống production vẫn mở.

## Thay đổi và ràng buộc

Management trả summary/counts; danh sách chỉ năm tiêu đề mỗi trang. Caption, ảnh và căn cứ nội dung tải khi mở một bài. Thư viện, lịch sử và lịch tải riêng khi mở phần tương ứng. Tổng quan không đọc toàn kho hoặc chạy preview.

Preview gồm khởi tạo snapshot, 40 lượt kiểm từng bài và đối chiếu snapshot cuối. Cursor ký riêng loại tác vụ, owner, release, snapshot, manifest, offset, thời điểm và hạn năm phút; hạn nguồn/fact gần nhất cũng chặn chuỗi. Manifest active-version/thứ tự được kiểm lại; snapshot cuối bao gồm eligibility, nguồn/facts và expiry, binding, thư viện, biên nhận bất biến và operation generation. Nếu snapshot cuối đổi, UI xóa kết quả từng phần và yêu cầu kiểm lại. Chỉ sau đối chiếu cuối mới hiển thị 40/40 khớp duyệt. Cursor không cấp quyền đăng.

Snapshot dùng danh tính hàng số thay cho việc sao chép lặp các ID dài; các trường bị bỏ trùng được bảo vệ bởi trigger bất biến/FK và check_version của reference. Rebuild/VACUUM có thể hủy cursor an toàn. Mỗi pha HTTP dùng một batch chỉ SELECT, gồm danh tính D1, manifest và dữ liệu bài hoặc snapshot/deadline trong cùng lượt đọc. [D1 batch là SQL transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/); trường hợp fixture không có batch vẫn giữ kiểm manifest sau đọc. Manifest fixture giảm từ 5.691 xuống 2.673 byte. Mỗi chức năng đọc vẫn kiểm danh tính D1, bỏ lượt kiểm lặp ở router; lỗi danh tính giữ HTTP 503. Cache chỉ giữ khóa HMAC đã dẫn xuất, luôn xác minh chữ ký từng cursor và thay cache khi Secret đổi.

Caption/footer có dấu ============ và byte ảnh đã duyệt giữ nguyên. Không migration; schema 14. Publisher tắt, application paused, chưa cấp Secret publisher. Không tạo permit/job/intent/publication/slot hoặc POST Facebook; staging và nguồn Telegram hiện hành không đổi.

## Kiểm thử và rollout

- TypeScript, 418 kiểm thử local và 13 kiểm tra ảnh đạt.
- CI Windows/Ubuntu đạt, bao gồm native workerd/D1/R2 và chín kịch bản live-adapter giả lập; Graph được mock.
- So sánh đủ 40 bài với projection gốc; thử cursor giả/sai owner/scope/release/hết hạn/thay khóa, đổi nguồn/facts/binding/reference/manifest, expiry không ghi D1, race trong trang, database sai, anonymous/bearer, UI lazy-load/đổi tab/kết quả cuối lỗi.
- UI thật kiểm đủ 40/40, 30 bài chính/10 dự phòng, đọc P01 đủ caption/footer/nguồn, tải thư viện và lịch sử riêng.
- Runtime production: 6312d6ea25814c2a5c92def5ba2480ecbd5288bc; Cloudflare version: 7bab79b2-ec8d-45cc-8720-13b70bbfe4f9. CI: https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37721086508.
- D1 sau đo: 40 bài/56 assets/schema 14, permit/job/intent/publication/slot 0, publisher enabled 0/paused 1/heartbeat 0. Staging vẫn release 556db22c45e1dcdc76b9628a51415730d007da42.

## CPU quan sát được

Workers Free có ngân sách 10 ms/request. Trước F1, management 20 ms/preview 35 ms; các bản trung gian F1 còn có mẫu preview 10–21 ms nên không được nghiệm thu. Bảng dưới chỉ gồm telemetry của runtime cuối nói trên, loại header/token/cursor/nội dung; không trộn số đo các bản cũ.

| Đường đọc | Mẫu CPU | Min–max ms | p95 ms |
| --- | ---: | ---: | ---: |
| /api/management | 1 | 3–3 | 3 |
| /api/management/posts | 2 | 6–8 | 8 |
| /api/management/posts/:id | 2 | 3–5 | 5 |
| /api/production/preview | 48 | 1–8 | 6 |
| /api/management/schedule | 2 | 2–7 | 7 |
| /api/management/library | 1 | 3–3 | 3 |
| /api/management/history | 1 | 8–8 | 8 |

Preview: 48 mẫu, trung vị 3 ms, p95 6 ms, cao nhất 8 ms; 69 invocation quan sát được có outcome ok. Tail có thể không thu mọi request; chỉ báo số mẫu có CPU thực. Không có bằng chứng phân biệt cold/warm cho từng mẫu, không gọi mẫu đầu là cold. Các endpoint có ít mẫu chỉ là kiểm tra triển khai F1; F4 vẫn phải đo ít nhất 30 lượt mỗi endpoint và ghi cold quan sát được. Lấy mẫu hữu hạn không bảo đảm mọi invocation tương lai.

F1 chưa sửa dry-run gửi 23 ms, đường POST hoặc monitor từng có mẫu 19 ms. F2 chuẩn bị bài qua nhiều request; F3 xử lý publisher/đối soát và ngân sách giám sát; F4 nghiệm thu toàn đường trước xin duyệt một bài thật. Không dùng CPU của giao diện đọc để mở cửa đăng.

Thiết kế tiếp theo: [phương án Free](38-resource-acceptance-plan.md). Draft [PR11](https://github.com/johntroger/nttu-digital-economics-publisher/pull/11) chưa merge.


## Tiếp nối F2 (08/10/2026)

Trạng thái và số đo phía trên ghi nhận khi hoàn tất giai đoạn này. F2 nay đã hoàn tất phần chuẩn bị theo bốn request; xem [báo cáo F2](38-f2-free-preparation.md). F3–F4 vẫn chờ phê duyệt; publisher chưa được mở.
