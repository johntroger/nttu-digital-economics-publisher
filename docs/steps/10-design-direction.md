# Bước 10 — Thiết kế sao lưu local

Giữ màu xanh #0056A6, mực #123453, nền #EEF5FB và Segoe UI/Bahnschrift của ứng dụng. Một mục Sao lưu trong sidebar; danh sách theo thời gian, dung lượng và số phiên bản/ảnh, nút Tạo bản sao lưu, Kiểm tra, Khôi phục thành kho riêng. Không dùng KPI trang trí.

Khôi phục cần hai lượt rõ ràng: kiểm tra manifest/checksum và xem tóm tắt; sau đó xác nhận tạo kho riêng. Không thay kho đang dùng. Mặc định kho phục hồi paused/quarantined, vẫn giữ lịch sử/rà soát làm tham khảo. Màn hình nhỏ xếp thao tác dọc; lỗi thiếu/hỏng file nêu rõ bản sao lưu chưa dùng được.

ADR local: gói thư mục với manifest SHA-256, database snapshot, assets, PDF/manifest, logo/font/renderer và content gốc; nằm ngoài Git. Không triển khai lịch backup cloud/mã hóa age ở bước local này; thiết kế production age giữ nguyên cho chặng triển khai. Gói chỉ coi hoàn tất sau kiểm tra mọi file và SQLite integrity/foreign keys/schema. Không tự xóa bản cũ. Kho phục hồi có đầy đủ tài nguyên riêng để không phụ thuộc PDF/ảnh của kho gốc.
