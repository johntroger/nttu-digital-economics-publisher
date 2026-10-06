# Bước 23 — Kho 40 bài hoàn chỉnh để nghiệm thu

## Kết quả và phạm vi

Kho local có 30 bài chính và 10 bài dự phòng, mỗi bài gồm caption đầy đủ, ảnh vuông 1080 × 1080, bản xem 360 × 360 và căn cứ theo trang tài liệu. Có 28 bài dành cho sinh viên và 12 bài dành cho người tìm hiểu ngành; 20 infographic và 20 ảnh minh họa ít chữ. Sáu nhóm chủ đề đều có bài chính và bài dự phòng.

Ba bài P02, P04, P05 đã được người quản lý duyệt ở Bước 22. Caption và các file ảnh của ba bài này giữ nguyên checksum; 37 bài còn lại chờ duyệt. Chưa đặt ngày bắt đầu, chưa nhập các phiên bản hoàn chỉnh vào cloud, chưa bật lịch và chưa đăng thêm bài Facebook.

## Căn cứ nội dung

Đối chiếu các trang được dẫn trong tài liệu chương trình và cẩm nang nghề nghiệp; kiểm tra checksum của cả 13 file PDF nguồn. Đây không phải xác nhận mọi thông tin trong toàn bộ tài liệu. Nội dung giới thiệu ngành dùng chương trình khóa 2026 và thời lượng 3,5 năm theo đính chính của người quản lý; không sửa PDF gốc. Bài P22 có thêm nguồn kỹ thuật NIST IR 8202.

Mỗi bài có mục tiêu cho người đọc, ví dụ hoặc hoạt động thực hành và phạm vi biên soạn. Caption dùng footer chuẩn, đường phân cách `============`, địa chỉ TikTok đúng và nhóm hashtag một lần. Không bổ sung cam kết việc làm, mức lương hoặc thông tin tuyển sinh chưa được xác nhận. Không gọi Gemini hoặc API tạo nội dung.

## Kiểm tra trùng lặp

So sánh 780 cặp bằng Jaccard của cụm hai từ, bỏ tiêu đề và footer; ngưỡng hỗ trợ rà soát là 0,30. Điểm cao nhất khoảng 0,144, không có caption trùng nguyên văn. Chỉ số này không bảo đảm phát hiện mọi nội dung tương đồng về ý nghĩa.

Các cặp gần nhau được phân biệt theo hành động: P10 giới thiệu năng lực chương trình, P24 lập kế hoạch thực hành; P05 giới thiệu tổng quan, R09 đặt câu hỏi tìm hiểu ngành; P15 thực hành Chuyển đổi số, P30 lưu bằng chứng từ Digital Marketing; R10 tự đánh giá bằng sản phẩm. Các bài dự phòng không đòi hỏi đọc bài trước.

Đối chiếu chỉ đọc với lịch sử ứng dụng staging lúc 2026-10-06T07:41:42Z: có một bài kiểm thử kỹ thuật, không có bài lịch đăng thường ngày, không có caption trùng nguyên văn với kho này. Phạm vi này không bao gồm các bài đăng thủ công ngoài lịch sử ứng dụng. Lệnh build chỉ kiểm tra kho local; bằng chứng truy vấn riêng được lưu trong thư mục tmp, không đưa lên GitHub.

## Kiểm thử và bàn giao

- TypeScript và 260 kiểm thử Node đã đạt.
- Bộ 13 kiểm thử ảnh kiểm tra kích thước, hàng ba logo, checksum mẫu đã duyệt, bản thu nhỏ, khả năng dựng lại, font, tương phản, giới hạn khung và giao nhau của chữ.
- PDF tổng hợp có 10 trang, mỗi trang bốn ảnh; đủ 40 mã bài và đã xem kiểm tra từng trang.
- Caption và căn cứ: `content/batch/v1/catalog.md`, mở từng bài để xem đầy đủ.
- Tổng hợp thiết kế: `assets/batch/v1/design-gallery.pdf`.
- Manifest: `content/batch-2026-v1.manifest.json` ghim checksum caption, ảnh, nguồn, font và renderer.

Code, caption và manifest được quản lý trên GitHub. PDF nguồn, logo gốc và ảnh/PDF xuất ra là tài sản local bị loại khỏi Git; giữ các tài sản này khi cần dựng lại. Kiểm tra repository chặn đưa thư mục ảnh batch vào Git.

## Điều kiện sang bước tiếp theo

Người quản lý cần duyệt 37 bài còn lại hoặc chỉ rõ bài cần sửa. Bước tiếp theo đề xuất là nhập kho đã duyệt vào staging, gắn phiên bản caption/ảnh/nguồn, lưu dấu duyệt và kiểm thử điều phối giả lập. Việc triển khai bước đó cần phê duyệt riêng. Duyệt nội dung và thiết kế không đồng nghĩa cho phép đăng Facebook hoặc bật lịch.
