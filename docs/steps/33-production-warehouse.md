# Bước 33 — Kho nội dung production

Người quản lý phê duyệt ngày 07/10/2026: nhập và đối chiếu 40 bài, ảnh, logo và nguồn vào production; giữ lịch đăng tắt. Nhánh codex/step33-production-warehouse kế thừa Bước 32, không thay deployment staging.

## Chuyển dữ liệu

Công cụ production-warehouse-import.mjs chạy trên máy người quản lý, từ chối CI, chỉ chấp nhận đúng D1 production 09cdecc7-36a2-4196-950e-ef68b1ecd834 và bucket nttu-publisher-production-assets. Import dùng bản gốc đã duyệt của Bước 22–23, không sao chép bảng vận hành staging. Kiểm tra nguyên trạng JSON biên nhận, batch, manifest, caption, ảnh 1080px, ảnh đối chiếu, logo và 13 PDF. Tất cả 56 tệp khớp SHA-256; tổng 19.511.024 bytes.

Guard yêu cầu định danh/schema production, paused=1, enabled=0, chưa có Page connection, job, publication, slot hoặc thông báo. Xuất bản sao D1 riêng tư trước lần nhập mới. R2 dùng khóa theo checksum; object có sẵn được đọc lại, không ghi đè; chỉ upload khi provider xác nhận object chưa tồn tại. Metadata pending thành complete sau khi đọc lại và khớp checksum. Không chạy đồng thời hai importer; CLI R2 không có conditional put.

Sau kiểm tra tệp, file SQL nhập nguyên tử 40 post/version, nguồn theo trang, liên kết ảnh, caption keys và biên nhận duyệt. Dữ kiện nhóm giới thiệu ngành gắn xác nhận owner: khóa 2026, thời lượng 3,5 năm. Fingerprint cố định và ID production riêng chống import lặp; replay kiểm tra active caption/ảnh/nguồn/biên nhận và dừng nếu khác. Lỗi guard hoặc giữa transaction hủy toàn bộ phần caption; tệp đã upload giữ riêng để tiếp tục.

Kho có 30 bài chính và 10 dự phòng; 28 bài cho sinh viên, 12 cho đối tượng tìm hiểu ngành; 20 infographic, 20 minh họa. Biên nhận là chuyển phê duyệt nội dung/thiết kế đã có, không phải tự cấp phê duyệt mới. Version vẫn needs_review, không tạo content_checks hay ready, slot, publication, notification hoặc Page connection.

## Xem kho

Giao diện production thêm ảnh đã duyệt, caption đầy đủ với separator/footer, trang nguồn và liên kết PDF/logo. File chỉ qua route cookie owner; bearer hoặc khách không mở được. Worker kiểm tra size/checksum R2 trước trả bytes; không public bucket. Nội dung hiển thị bằng textContent, ảnh responsive/lazy load; không thêm thao tác chỉnh sửa hoặc đăng bài.

## Kiểm thử trước chuyển thật

Bốn kiểm thử mới: đủ 40 phiên bản/biên nhận, không trạng thái vận hành; transaction rollback khi sai môi trường/asset/lỗi giữa chừng; config staging/missing source/changed image bị từ chối; private file chỉ owner và lỗi R2 integrity bị chặn. Domain eligibility của 40 bản nhập chỉ còn NOT_READY/CHECKS_INVALID đúng phạm vi, không thiếu nguồn, facts hoặc lệch ảnh. Mười một kiểm thử warehouse/management tập trung đạt, TypeScript đạt.

Native workerd smoke áp dụng 40 bài bằng D1 batch thật trong fixture, kiểm tra API đọc kho, current reviews, không lịch/lịch sử và nhập lặp bị chặn; đạt. Google trong fixture giả lập, không gửi cookie giả lên cloud. Các nguồn và PNG riêng tư không được đưa vào Git/CI.

## Nghiệm thu remote — 07/10/2026

CI 37564862190 đạt cho release ece11fa28b5098e7e65c4f3d540d16e60b8fb0f1; 342/342 kiểm thử Node và 13 kiểm tra ảnh trước push đạt. R2 đã đọc lại đủ 56 object, checksum nguyên trạng. D1 nhập thành công lúc 03:19:44 UTC (10:19:44 Việt Nam), đủ 40 bài/40 biên nhận, 30 chính/10 dự phòng, không slot/job/publication/notification/Page connection. Fingerprint c2760cd6e30b410af065f7b495fc57dba6f812a92a0145ef00c8c4109d4221c9.

Snapshot D1 sau nhập được audit độc lập qua readCatalog/eligibility: 40 bài không có lỗi nguồn/facts/binding; chỉ còn NOT_READY và CHECKS_INVALID đúng phạm vi khóa đăng. Integrity và foreign_key_check đạt. Bản trước/sau nhập nằm riêng trong tmp/step33; không đưa caption/PDF/ảnh/snapshot vào Git.

Worker đã triển khai phần xem kho. Health xác nhận DB được kiểm tra, publisher/scheduler không bật; 12 kiểm tra khách/bearer vào API/HTML/JS/file từ chối 401. Staging giữ release 556db22c45e1dcdc76b9628a51415730d007da42, không deploy staging.

Phiên Google owner thật tải 40 bài và 56 tệp. Mở P01/P03: ảnh R2 tải đủ 1080px, caption đúng footer/separator/TikTok/hashtag. P05 hiển thị khóa 2026, 3,5 năm, nguồn theo trang và xác nhận owner. Desktop/mobile 390px đã kiểm tra, scrollWidth 375px không tràn ngang. Nút làm mới và các mục lịch/lịch sử/thông báo/kết nối đã kiểm tra; lịch tắt, lịch sử/thông báo trống và các kết nối vận hành chưa nghiệm thu.

Bằng chứng riêng: tmp/step33/evidence.json, domain-audit.json, web-evidence.json và ảnh giao diện. Bước tiếp theo đề xuất: kết nối/xác minh fanpage chính thức, vẫn chưa bật đăng; cần phê duyệt riêng.

