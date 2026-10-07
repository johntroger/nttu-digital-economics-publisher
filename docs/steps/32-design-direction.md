# Hướng giao diện production

Ứng dụng dành cho một người quản lý nội dung Ngành Kinh tế số NTTU. Dùng xanh trường #0055a6, trắng #ffffff, nền #f2f6fa, chữ #19344c và vàng #b59639 để biểu thị lịch chưa bật. Work Sans hỗ trợ dấu tiếng Việt; dùng file đã có, không gọi font bên ngoài. Nội dung căn trái, thanh điều hướng riêng và vùng làm việc rộng. Trên mobile điều hướng cuộn ngang, dữ liệu giữ cùng thứ tự đọc.

Giao diện mở đầu bằng “Phòng nội dung”, trạng thái lịch và bảng hiện trạng thực tế, không dùng biểu đồ giả hoặc chỉ số readiness suy đoán. Kho chưa nhập giải thích bước đối chiếu tiếp theo. Không có nút đăng/bật lịch trong bước quản lý này. Caption render textContent, có dấu phân cách và footer đã chốt. Các trạng thái chưa xác minh hiển thị đúng; không coi secret tồn tại là kết nối đã được kiểm thử.

Luồng: đăng nhập Google → tổng quan → kho/lịch/lịch sử/thông báo/kết nối. Tái sử dụng ngôn ngữ và màu nhận diện của workspace hiện có; không đưa SQL, API hay kỹ thuật triển khai vào thao tác của người quản lý.
