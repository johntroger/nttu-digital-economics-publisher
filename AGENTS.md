# Quy tắc dọn dữ liệu sau mỗi lần chạy

- Theo yêu cầu của chủ dự án, sau mỗi lần chạy phải tự dọn file tạm, cache của lần chạy và dữ liệu kiểm thử có thể tái tạo, kể cả khi kiểm thử thất bại. Không cần hỏi lại để dọn những dữ liệu này.
- Chạy kiểm thử qua các lệnh npm đã tích hợp `scripts/run-clean.mjs`. Khi cần chạy một script local khác, có thể dùng `node scripts/run-clean.mjs script scripts/<ten-script>.mjs`; chỉ dùng cho script đã được cho phép chạy trong phiên làm việc.
- Cơ chế dọn chỉ xóa tài nguyên tạm mới tạo trong lần chạy, trong danh sách đường dẫn được phép. Không chạy nhiều tác vụ tạo fixture cùng lúc. Không xóa toàn bộ `tmp/` hoặc dựa vào tuổi file để quyết định dữ liệu có quan trọng không.
- Giữ mã nguồn, Git, thư viện cần chạy, nội dung/ảnh/tài liệu gốc, database local đang dùng, bản sao lưu thật, gói phục hồi, cấu hình/tài khoản và bằng chứng nghiệm thu. Kết quả người dùng yêu cầu tạo ra là sản phẩm cần giữ.
- Với thao tác ngoài bộ chạy tự dọn, xác định rõ file tạm thuộc lần chạy và dọn sau khi các tiến trình/database đã đóng. Nếu chưa rõ vai trò của file, giữ lại và báo thay vì xóa.
- Không tự đăng bài, gọi dịch vụ ngoài, triển khai hoặc gửi tin nhắn chỉ để kiểm tra việc dọn file.
