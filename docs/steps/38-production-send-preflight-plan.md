# Bước 38 — Nghiệm thu chuẩn bị gửi trên cloud và hồ sơ bài thử

Trạng thái: đề xuất, chưa phê duyệt; chưa code Bước38.

Bước37 hoàn thành adapter và preflight khi mọi cửa đăng đóng. Trước khi gửi thử cần đo toàn đường chuẩn bị và có hồ sơ phê duyệt bài/phiên bản/ảnh/Page/thời điểm cụ thể.

## Phạm vi đề xuất

1. Xây dry-run gửi chỉ dành owner có CSRF, dùng server clock Việt Nam, không nhận URL/token/đích do caller chọn. Thực hiện kiểm tra identity, receipts/sources, byte R2 và Meta GET giống adapter live; không claim job, intent, permit, slot hoặc publication; không POST Facebook.
2. Đo CPU/wall/query của dry-run bằng telemetry Cloudflare đã lọc và đọc giới hạn đang áp dụng cho Worker. Nếu vượt ngân sách thì tối ưu rồi kiểm thử lại; không tự nâng gói trả phí hoặc dùng burst thành bằng chứng ổn định.
3. Chuẩn bị giao diện/hồ sơ review một bài cụ thể do người quản lý chọn: caption đầy đủ có dấu ngăn footer, ảnh/version/checksum đã duyệt, Page817593604765443, mốc thử gần nhất theo giờ Việt Nam. Không tự chọn P01 làm bài gửi thật.
4. Hoàn thiện cơ chế permit/cấu hình/pause và đối soát cho một lần thử, kiểm thử native/mock và CI trước triển khai. Các cửa vẫn đóng; chưa cấp permit hoặc bật lịch trong bước này.
5. Bổ sung báo cáo các hạng mục còn cần nghiệm thu và cập nhật kế hoạch tiếp theo. Chưa cấu hình nguồn publisher bên ngoài.

## Phê duyệt riêng trước hành động thật

Phê duyệt Bước38 là phê duyệt code/kiểm thử/dry-run, không phải phê duyệt đăng. Chỉ sau hồ sơ review và kiểm thử đạt mới yêu cầu duyệt chính xác bài, Page, phiên bản và thời điểm thử. Tạo/lưu capability publisher cho cron-job.org phải được xác nhận riêng tại lúc cấp quyền. Không mở rộng token Telegram hiện có. Sau thử thật thành công mới đề xuất lịch thường 10:00 Việt Nam, một bài/ngày.
