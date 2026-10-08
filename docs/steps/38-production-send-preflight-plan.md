# Bước 38 — Nghiệm thu chuẩn bị gửi trên cloud và hồ sơ bài thử

Trạng thái ngày 08/10/2026: người quản lý đã phê duyệt Bước 38; chức năng đã triển khai và qua kiểm thử, nhưng chưa đạt nghiệm thu tài nguyên (dry-run 23 ms CPU, Workers Free 10 ms). Người quản lý đã chọn giữ Free và yêu cầu xem phương án xử lý; đã phê duyệt và hoàn tất phạm vi F1; F2–F4 chưa được duyệt code. Xem [báo cáo F1](38-f1-free-management.md). Cửa đăng vẫn đóng. Xem [báo cáo](38-production-send-preflight.md) và [phương án Free](38-resource-acceptance-plan.md).

Bước37 hoàn thành adapter và preflight khi mọi cửa đăng đóng. Trước khi gửi thử cần đo toàn đường chuẩn bị và có hồ sơ phê duyệt bài/phiên bản/ảnh/Page/thời điểm cụ thể.

## Phạm vi đề xuất

1. Xây dry-run gửi chỉ dành owner có CSRF, dùng server clock Việt Nam, không nhận URL/token/đích do caller chọn. Thực hiện kiểm tra identity, receipts/sources, byte R2 và Meta GET giống adapter live; không claim job, intent, permit, slot hoặc publication; không POST Facebook.
2. Đo CPU/wall/query của dry-run bằng telemetry Cloudflare đã lọc và đọc giới hạn đang áp dụng cho Worker. Nếu vượt ngân sách thì tối ưu rồi kiểm thử lại; không tự nâng gói trả phí hoặc dùng burst thành bằng chứng ổn định.
3. Chuẩn bị giao diện/hồ sơ review một bài cụ thể: caption đầy đủ có dấu ngăn footer, ảnh/version/checksum đã duyệt, Page817593604765443, mốc thử gần nhất theo giờ Việt Nam. Người quản lý đã giao chọn bài; chọn P01 «Một bảng doanh thu có thể kể điều gì?» vì không có điều kiện tiên quyết và có biên nhận duyệt. Đây chỉ là bài lập hồ sơ, chưa được phép đăng.
4. Hoàn thiện cơ chế permit/cấu hình/pause và đối soát cho một lần thử, kiểm thử native/mock và CI trước triển khai. Các cửa vẫn đóng; chưa cấp permit hoặc bật lịch trong bước này.
5. Bổ sung báo cáo các hạng mục còn cần nghiệm thu và cập nhật kế hoạch tiếp theo. Chưa cấu hình nguồn publisher bên ngoài.

## Phê duyệt riêng trước hành động thật

Phê duyệt Bước38 là phê duyệt code/kiểm thử/dry-run, không phải phê duyệt đăng. Chỉ sau hồ sơ review và kiểm thử đạt mới yêu cầu duyệt chính xác bài, Page, phiên bản và thời điểm thử. Tạo/lưu capability publisher cho cron-job.org phải được xác nhận riêng tại lúc cấp quyền. Không mở rộng token Telegram hiện có. Sau thử thật thành công mới đề xuất lịch thường 10:00 Việt Nam, một bài/ngày.
