# Bước 10 — Sao lưu và khôi phục kho local

Hoàn tất 05/10/2026 theo phê duyệt bước 10. Dừng trước bước 11.

## Phạm vi đã hoàn tất

Mục **Sao lưu** trên giao diện có Tạo bản sao lưu, Kiểm tra và Khôi phục thành kho riêng. Trước khôi phục, người quản lý xem số bài/phiên bản/ảnh rồi xác nhận. Kho đang dùng không bị thay thế.

Gói là một thư mục local hoàn chỉnh gồm `manifest.json`, snapshot SQLite, toàn bộ ảnh được database tham chiếu, 13 PDF và manifest nguồn, logo gốc, font/license, renderer và các file content/mẫu cần thiết. Manifest ghi thời gian, định dạng, số thực thể, đường dẫn tương đối, dung lượng và SHA-256 từng file. Chỉ hiện bản hoàn tất sau khi kiểm tra toàn bộ gói; gói đang làm/dở lỗi giữ dưới `.building-*`, không hiện như bản dùng được. Không tự xóa bản cũ.

Snapshot dùng SQLite VACUUM INTO, không chép file database đang mở theo cách có thể thiếu WAL. Kiểm tra SQLite integrity, foreign keys và các checksum migration; từ chối schema không tương thích, nguồn/mẫu không hợp lệ, file thiếu/thừa, checksum sai, đường dẫn thoát gói, symlink và ảnh không khớp database. Chỉ hỗ trợ kho local chưa có kết nối hoặc publish job; bảo trì đang hoạt động chặn thao tác.

Khôi phục sao chép vào thư mục mới trong `tmp/step-10/restores`, kiểm tra lại bản sao trước khi ghi trạng thái quarantine. Tất cả phiên bản được giữ, trạng thái chuyển quarantined và check_version tăng; giữ kết quả rà soát cũ làm lịch sử, không coi nó là duyệt bản phục hồi. Mọi môi trường paused, mô phỏng lịch disabled. Muốn sử dụng bài: lưu phiên bản mới, dựng ảnh và rà soát lại.

Kho phục hồi dùng chính PDF, logo, font, renderer và ảnh trong gói. Bản sao lưu gốc giữ nguyên. `origin-manifest.json` trong kho phục hồi là manifest xuất xứ, không phải chứng nhận checksum của working copy đã thay đổi khi quarantine.

## Kiểm thử và bằng chứng

- TypeScript strict + **154/154 Node/SQLite/HTTP** đạt, gồm 9 ca mới về gói hoàn chỉnh, snapshot không đổi sau chỉnh sửa, bảo toàn lịch sử/rà soát, trạng thái quarantine/pause, dựng lại ảnh bằng tài nguyên phục hồi, file hỏng/thiếu, path/schema/database sai, restore replay và API origin/header/giới hạn JSON.
- **7/7 backup browser** đạt: màn hình trống, tạo và kiểm tra gói, hủy xác nhận, khôi phục kho riêng, mở kho phục hồi với PDF/ảnh riêng, giữ nguyên kho gốc và mobile không tràn ngang.
- **14 UI + 5 mẫu + 8 editor + 8 nguồn** tiếp tục đạt; tổng **42 ca trình duyệt**.
- **9/9 image** tiếp tục đạt. Đã xem screenshot mobile mục sao lưu.
- Bằng chứng: `tmp/step-10/browser-results.json`, `backups-desktop.png`, `backups-mobile.png`, `recovered-editor.png`. Các kiểm thử chỉnh sửa/hỏng dữ liệu chạy trong kho riêng.

Đã tạo bản sao lưu thực tế đầu tiên của kho đang dùng:
`tmp/step-10/backups/backup-05732aa1-028a-4675-b8cf-9e8a0c8c4616`
Gói kiểm tra đạt: 40 bài, 45 phiên bản, 5 ảnh, 0 ghi nhận rà soát, 50 file, khoảng 14,3 MiB. Không sửa caption hoặc khôi phục đè lên kho người dùng.

## Cách sử dụng

1. Mở ứng dụng bằng `npm.cmd run dev`, chọn Sao lưu → Tạo bản sao lưu.
2. Chép nguyên thư mục gói từ `tmp/step-10/backups` sang vị trí lưu riêng nếu muốn giữ ngoài máy. Không chỉ chép database hoặc chỉ manifest.
3. Trong giao diện chọn Kiểm tra, sau đó Khôi phục thành kho riêng và xác nhận. Đường dẫn kho mới và lệnh mở được hiển thị.
4. Chạy `node scripts/open-restored.mjs restored-ID` trong terminal dự án để mở kho phục hồi tại `http://127.0.0.1:3790/`. Kho gốc ở cổng 3789 giữ nguyên. ID lấy từ kết quả khôi phục; không dùng ID backup thay cho ID restored.
5. Kết thúc server phục hồi bằng Ctrl+C. Chưa chuyển kho phục hồi thành kho chính hoặc bật đăng tự động ở bước này.

Muốn mang gói từ ổ khác trở lại: chép nguyên thư mục `backup-ID` vào `tmp/step-10/backups`, mở mục Sao lưu để kiểm tra. Chỉ dùng gói cùng phiên bản ứng dụng/schema được hỗ trợ; cần mã nguồn ứng dụng để chạy giao diện. Đây là sao lưu dữ liệu và tài nguyên, không phải bản đóng gói cài đặt phần mềm.

## Giới hạn và quyết định local

Gói local chưa mã hóa; chưa có lịch sao lưu, upload cloud hoặc chính sách retention tự động. Thiết kế production age/mã hóa và backup hằng ngày trong THIET-KE-TRUOC-CODE.md giữ nguyên cho chặng triển khai; không coi bước này là nghiệm thu cloud. SHA-256 kiểm tra toàn vẹn, không xác minh người tạo gói bằng chữ ký. Chỉ phục hồi gói local đáng tin cậy.

Backup/restore hiện không hỗ trợ database đã có page connection/publish jobs/secret dịch vụ. Chưa xử lý đối chiếu remote hoặc phục hồi production đang đăng; giữ các yêu cầu này cho bước tích hợp thật. Thư mục `tmp` vẫn cần giữ và sao chép gói ra vị trí khác để có bản ngoài máy.

Đề xuất bước 11: thiết lập GitHub và CI để quản lý phiên bản mã nguồn và chạy kiểm thử tự động. Cần phê duyệt riêng trước khi thực hiện.
