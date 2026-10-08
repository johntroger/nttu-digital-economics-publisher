# Bước 38 / F2 — Chuẩn bị bài theo từng lượt trên Workers Free

F2 được phê duyệt ngày 08/10/2026. Bốn lượt chuẩn bị đã qua kiểm thử chức năng, native runtime, CI và các mẫu CPU hiện tại. F3–F4 chưa được phê duyệt; luồng đăng production chưa nghiệm thu và vẫn đóng.

## Luồng kiểm tra

1. Nội dung: kiểm phiên bản đang dùng, nguồn/facts, biên nhận duyệt, caption/footer và binding ảnh; tạo biên nhận có chữ ký, không có hồ sơ hoàn tất.
2. Ảnh: đọc R2 và kiểm byte/checksum trên server, không tin hash do trình duyệt báo.
3. Kết nối: hai GET có giới hạn timeout/payload, xác minh token/App/quyền và Page chính thức 817593604765443. Không có khả năng gửi POST Meta.
4. Chốt hồ sơ: kiểm lại approval projection và trạng thái D1, đối chiếu biên nhận/byte ảnh/fingerprint; chỉ lúc này trả caption, ảnh và thời điểm thử đề xuất.

Mỗi endpoint có pha cố định; server kiểm pha trong chữ ký trước I/O. Các request đều yêu cầu phiên owner, CSRF và cùng origin. D1 dùng một batch chỉ SELECT mỗi lượt để đọc identity, config, tình trạng bận, snapshot và dữ liệu tương ứng trong cùng transaction. Không migration, không ghi hồ sơ/permit/job vào D1.

Biên nhận ràng buộc loại tác vụ, owner, release, Page, version/post, approval digest, caption hash, image checksum, snapshot/config, credential fingerprint, ngày Việt Nam và hạn năm phút từ đầu chuỗi. Hạn nguồn/fact/token hoặc data access sớm hơn cũng hủy chuỗi. Đổi nguồn, references, binding, operation generation, config hoặc token sẽ bị từ chối. Replay chỉ kiểm lại dữ liệu, không cấp quyền POST. Snapshot chỉ chứa bài đang chọn, nguồn/facts/ảnh/biên nhận liên quan, tài liệu nguồn và trạng thái vận hành; đổi một phiên bản không liên quan không hủy chuỗi. Các danh tính bất biến được bảo vệ bằng trigger/FK; projection đầy đủ được kiểm lại ở pha cuối.

UI chỉ cho kiểm sau khi preview đủ; hiển thị tiến độ từng lượt và chỉ công bố hồ sơ sau pha cuối. Đổi tab/làm mới hủy đọc; phản hồi muộn không thay giao diện mới. Lỗi xóa hồ sơ từng phần và cho bắt đầu lại. Giao diện không lưu token hoặc biên nhận vào storage.

Hồ sơ thử vẫn chỉ đề xuất thời điểm ít nhất hai phút sau khi kiểm xong, theo ngày Việt Nam. Hồ sơ không cấp quyền đăng; F2 không mở endpoint cấp permit/activate. Single-test helper và publisher hiện hành vẫn là phần chưa nghiệm thu F3/F4.

## Kiểm thử

- TypeScript, 429 kiểm thử local và 13 kiểm tra ảnh đạt.
- CI Windows/Ubuntu đạt; native workerd/D1/R2 chạy 10 kịch bản, mọi outbound Meta trong native là mock.
- Kiểm bốn pha giữ dossier/caption/hash/byte ảnh của luồng cũ; kiểm nội dung đủ 40 bài.
- Kiểm chữ ký giả/sai scope, pha sai, thay release/khóa, hết hạn, nguồn/reference/generation/config/binding/token thay đổi, R2 hỏng, Meta Page sai, source deadline, Meta expiry và ngày Việt Nam thay đổi.
- UI kiểm tiến độ chưa đầy đủ, lỗi và phản hồi muộn khi đổi tab.
- UI cloud thật hoàn tất P01, P05, P17, P30 và R10 qua bốn pha với Meta GET thật, giữ footer ============ và ảnh đã duyệt.
- D1 trước/sau: 40 bài, 56 assets, schema 14; permit/job/intent/publication/slot bằng 0, publisher enabled 0, paused 1, publisher heartbeat 0. Không Facebook POST hoặc Telegram test mới. Staging vẫn release 556db22c45e1dcdc76b9628a51415730d007da42.

Runtime đã đo: 130a6ff98c9ff4cc4b7d54c330389890396f5fb8; Cloudflare version 5bae2387-bbf2-4a64-b1dd-697afcec23c8. CI: https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37757545621.

## CPU quan sát được

| Pha | Mẫu CPU | Min–max ms | Trung vị ms | p95 ms |
| --- | ---: | ---: | ---: | ---: |
| content | 11 | 2–7 | 4 | 7 |
| image | 11 | 3–6 | 4 | 6 |
| connection | 9 | 6–9 | 6 | 9 |
| finalize | 8 | 3–6 | 4 | 6 |

Bản đầu F2 có mẫu nội dung 16 ms và kết nối 12 ms nên không được nghiệm thu. Bản snapshot theo bài giảm lượt nội dung, nhưng còn mẫu kết nối 10 ms nên vẫn chưa nghiệm thu. Bản cuối thêm cache khóa HMAC Meta dẫn xuất; luôn ký token hiện hành và chạy xác minh GET, thay khóa khi App Secret đổi. Snapshot fixture P01 giảm từ 12.627 xuống 530 byte. Có 39 mẫu CPU thực của đúng runtime, tất cả outcome ok và dưới ngân sách 10 ms Workers Free. Tail không nhất thiết thu mọi request; không phân loại cold/warm khi chưa có bằng chứng. Các số đo hữu hạn này xác nhận phạm vi triển khai F2, không bảo đảm mọi invocation tương lai. F4 vẫn cần tối thiểu 30 mẫu mỗi endpoint cùng cold quan sát được và thử toàn đường.

Luồng POST/publisher, đối soát, stock scan và monitor còn thuộc F3–F4. Không dùng kết quả F2 để bật đăng. Draft [PR12](https://github.com/johntroger/nttu-digital-economics-publisher/pull/12) chưa merge. Kế hoạch: [phương án Free](38-resource-acceptance-plan.md).
