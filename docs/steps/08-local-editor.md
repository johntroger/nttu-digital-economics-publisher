# Bước 8 — Biên tập và phiên bản local

Hoàn tất 05/10/2026 theo phê duyệt bước 8. Dừng trước bước tiếp theo.

## Phạm vi đã triển khai

- Kho SQLite bền vững tại `tmp/step-08/warehouse.sqlite`, ảnh tại `tmp/step-08/assets`. Năm mẫu được nhập một lần vào đúng mã bài; tổng kho vẫn 40 bài, 0 bài đủ điều kiện đăng.
- Trong Kho bài, chọn **Chỉnh sửa** để chỉnh tiêu đề, nội dung, ghi chú nguồn, bố cục và màu ảnh. Footer và `============` ghép tự động vào caption xem trước.
- Mỗi lần lưu tạo bản mới bất biến; giữ bản cũ và căn cứ nguồn riêng cho từng phiên bản. Khôi phục caption cũ cũng tạo bản mới, không kế thừa ảnh hoặc kết quả rà soát.
- Ảnh chỉ dựng cho bản đã lưu, ghim nội dung/font/logo/renderer và checksum. Dựng xong nhưng bài đã thay đổi thì không gắn ảnh vào bản mới. Chặn tràn chữ, thiếu glyph và tương phản thấp.
- Năm mục rà soát local: tính chính xác, hữu ích, rõ ràng, không trùng và chất lượng hình. Ghi nhận chỉ khi có ảnh khớp, căn cứ nguồn theo trang và ghi chú đối chiếu. Bài vẫn `needs_review`.
- Chặn ghi đè khi hai cửa sổ cùng sửa; giữ bản đang nhập khi lưu lỗi. Cảnh báo rời màn hình khi chưa lưu; khóa biểu mẫu trong thao tác lưu/dựng ảnh.
- API chỉ loopback, mutation yêu cầu cùng origin/header, JSON giới hạn 64 KiB; file ảnh chỉ phục vụ theo ID/checksum.

## Kiểm thử và bằng chứng

- TypeScript strict và 135/135 Node/SQLite/HTTP kiểm thử đạt.
- 8/8 ca trình duyệt editor đạt, gồm restart persistence, xung đột lưu, khôi phục, dựng ảnh, rà soát và mobile không tràn ngang.
- 14/14 ca giao diện bước 6 và 5/5 ca bài mẫu bước 7 tiếp tục đạt.
- 9/9 kiểm thử dựng ảnh tiếp tục đạt.
- `tmp/step-08/browser-results.json`, `editor-desktop.png`, `editor-mobile.png`; kiểm thử sửa bài sử dụng DB riêng, không thay đổi kho người dùng.

## Giới hạn và vận hành

Đây là bản local: máy tắt thì server dừng. Chưa đăng nhập Google, chưa nối Facebook/Telegram/cloud/GitHub. Nhãn người rà soát local chưa xác thực danh tính Google. Không coi kết quả local là kiểm thử đăng thật.

35 bài ngoài năm mẫu có thể biên tập/lưu/dựng ảnh, nhưng chưa thể ghi nhận rà soát vì chưa có căn cứ nguồn theo trang. Không tự suy luận nguồn cho nội dung người dùng sửa: người rà soát phải đối chiếu lại, đặc biệt khi thêm nhận định mới. Các bài mẫu trong mục Bài mẫu là bản thiết kế v1 gốc; bản chỉnh sửa hiện tại nằm trong Kho bài → Chỉnh sửa.

Dữ liệu và ảnh nằm trong `tmp` để tránh đưa tài liệu vào Git; cần giữ thư mục này, không xóa như cache. Backup/export hoàn chỉnh chưa triển khai. `npm.cmd run dev` mở kho bền vững; `node scripts/check-editor-browser.mjs` dùng kho kiểm thử riêng.

Đề xuất bước tiếp theo: quản lý căn cứ nguồn theo trang cho các bài còn lại và kiểm định kho local. Phải được người dùng phê duyệt trước khi code.
