# Bước 1 — khung dự án và nền dữ liệu

Ngày: 05/10/2026. Phạm vi được thực hiện theo yêu cầu bắt đầu code từng bước của chủ tài khoản.
Không triển khai bước 2 trước khi chủ tài khoản phê duyệt sau báo cáo này.

## Đã xây

- Khung backend TypeScript strict, fetch handler hướng tới Worker, HTTP adapter local bind127.0.0.1.
- Chính sách giờ Việt Nam: đăng10h, kiểm tra8h; chuyển ngày đúng tại UTC17h và kiểm tra ngày lịch hợp lệ.
- Migration0001 gồm14 bảng lõi xuất bản: application state/posts/assets/versions/pages/slots/jobs/gates/attempts/evidence/publications/usage/day guards/outbox.
- Ràng buộc lịch/page, một ứng viên hoạt động/slot, payload đã pin, không giải phóng gate chưa xác minh chỉ vì lease hết hạn, giữ snapshot/evidence và usage theo bài gốc.
- Mọi môi trường bắt đầu paused. Fake mode chỉ local. API đăng chưa xây trả501; health chỉ liveness, không giả đã kết nối DB/Meta/scheduler.
- package lock và TypeScript6.0.3 được cố định; đã cài từ package cache có sẵn vào project, không cần token hoặc dịch vụ ngoài.

## Kiểm thử

Lệnh: `npm.cmd run check` — TypeScript strict và21 test tự động.
Kết quả:21PASS,0FAIL,0SKIP; typecheck đạt. Gồm HTTP loopback thật và SQLite in-memory thật.
Các nhánh nổi bật: slot trùng; khác page; trial request trùng; payload thay giữa retry;
version/page identity đã pin; ảnh complete rồi blocked không bị sửa/reset; lease cũ;
evidence giữ sau rollback; usage không bị coi như mới theo version; hai remote ID vẫn lưu khi guard conflict;
outbox chưa có message_id không được ghi delivered; fake production/missing config bị từ chối.

Giới hạn: kiểm thử SQL trên SQLite local, chưa D1 runtime/cloud; chưa có claim nguyên tử,
eligibility/source/facts hoàn chỉnh, finalizer, adapter Meta/Telegram, OAuth, scheduler hay GUI.
Schema không tự chứng minh các nghiệp vụ chưa xây. Không đăng fanpage hoặc triển khai GitHub/Cloudflare.

## Đề xuất bước 2 để phê duyệt

Xây mô-đun kho nội dung và eligibility phía backend: thêm sources/facts/checks cần thiết;
đọc40brief như bản nháp; phân biệt draft/ready; đếm stock theo bài gốc; ưu tiên dự phòng theo
nhóm/đối tượng/góc và tiền đề. Kiểm thử nguồn hết hạn, bản sửa chưa đồng bộ ảnh, bài đã dùng,
bài đang giữ/unknown và các nhánh chọn reserve. Chưa đăng thật hoặc deploy.

Trạng thái: bước1hoàn tất kiểm thử, chờ chủ tài khoản phê duyệt trước code bước2.
