# Hướng thiết kế giao diện local

Phạm vi đã duyệt: xem kho/lịch/lịch sử/cảnh báo, chạy demo giả lập; không biên tập hoặc tích hợp thật.

Palette: xanh Trường #0056A6, mực #123453, nền #F3F6FA, trắng #FFFFFF,
vàng nhận diện #B69B3A, xanh trạng thái #0D7569. Màu nhấn tập trung ở thao tác và trạng thái.
Typography: Bahnschrift cho tiêu đề/số, Segoe UI cho nội dung và tiếng Việt; fallback sans-serif.
Không tải font hoặc icon từ mạng.

Bố cục: hàng nhận diện dùng ba logo gốc; sidebar chức năng và khu vực làm việc có chiều rộng linh hoạt.
Tổng quan mở bằng tình trạng kho và việc cần làm, không phải một headline quảng cáo.
Kho dùng danh sách có bộ lọc/tìm kiếm và drawer đọc đề cương. Lịch là danh sách ngày;
lịch sử và cảnh báo dùng bảng/list đúng dữ liệu thay vì các thẻ giống nhau.

```text
Logo Trường / Khoa / Ngành                          Bản local
Điều hướng    Tình trạng kho / thao tác tiếp theo
              Kho bài   Lịch   Lịch sử   Cảnh báo
              Danh sách đọc                        Chi tiết bài
              Mô phỏng có nhãn riêng và các bước đã chạy
```

Đối chiếu brief: cần giúp một quản trị viên thấy bài chưa đủ điều kiện và kiểm tra workflow,
không tạo cảm giác đã kết nối Google/Facebook hoặc có ảnh/caption hoàn chỉnh.
Đã bỏ đề xuất biểu đồ tăng trưởng/engagement vì chưa có dữ liệu; không thêm số liệu marketing giả.
Desktop có sidebar; màn hình nhỏ chuyển điều hướng thành hàng cuộn, drawer thành panel rộng toàn màn hình.
Focus rõ, Escape đóng drawer, trạng thái/loading được thông báo cho trình đọc màn hình.
