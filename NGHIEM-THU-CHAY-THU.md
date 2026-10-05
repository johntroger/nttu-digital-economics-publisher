# Phiếu nghiệm thu bản chạy thử — v4.3

Tiến độ thực tế05/10/2026: bước1–7 đã có code/local và kết quả kiểm thử.
Năm mẫu caption/PNG và phiếu tự rà soát ở docs/steps/07-content-samples.md;
125 test Node/HTTP,9 dựng ảnh,14+5 ca trình duyệt đạt. Cổng live/production vẫn chưa đạt.
Các ca NOT_RUN phía dưới chỉ được đổi khi có bằng chứng đúng phạm vi, không tính mock là live.

Ngày: 05/10/2026. Căn cứ KE-HOACH-TONG-THE.md v4.3 và THIET-KE-TRUOC-CODE.md. Đây là biểu mẫu/bộ điều kiện, chưa phải kết quả kiểm thử. Không có ứng dụng, credentials hoặc thao tác đăng thật được tạo bởi tài liệu này.

## 1. Cổng sẵn sàng

| Cổng | Phạm vi | Trạng thái |
|---|---|---|
| A | Bắt đầu code/local: scope, schema logic, transitions, API/auth, wireframe, test/runbook đủ | Đủ ở mức thiết kế; chưa test pass |
| B | Live fanpage thử/cloud: đích/quyền/secrets tách, mock đạt, page thử được cung cấp | Chưa đạt |
| C | Production: risk tests/restore/monitor/quota,40ready,release/config,đích/ngày bật | Chưa đạt |

## 2. Phiếu mẫu nội dung–ảnh

Mỗi mẫu điền: mã/version; đối tượng/ngữ cảnh; vấn đề/thông điệp/đầu ra; nguồn trang/mục và facts; caption nối footer đúng một lần; PNG/checksum/template/font/renderer; năm tiêu chí rubric; thời gian viết/đối chiếu/dựng/sửa; lỗi/bản sửa; QA1080/360px/ảnh Facebook; reviewer/date/result và link/file evidence. QA Facebook để chưa chạy đến khi có fanpage thử. Không tự đánh dấu ready vì có brief.

| Mẫu | Đầu ra kỳ vọng | Trạng thái |
|---|---|---|
| P02 | Người đọc biết kiểm tra một kết quả AI theo ví dụ | Caption/PNG/QA local1080/360 đạt; chờ owner; Facebook NOT_RUN |
| P04 | Một dòng CV thể hiện bằng chứng, không bịa số liệu | Caption/PNG/QA local1080/360 đạt; chờ owner; Facebook NOT_RUN |
| P05 | Hiểu mối liên hệ kinh doanh–công nghệ đúng CTĐT | Caption/PNG/QA local1080/360 đạt; chờ owner; Facebook NOT_RUN |
| P06 | Brief dashboard ba dòng | Caption/PNG/QA local1080/360 đạt; chờ owner; Facebook NOT_RUN |
| P08 | Hiểu quy trình công việc sau một đơn hàng | Caption/PNG/QA local1080/360 đạt; chờ owner; Facebook NOT_RUN |

Ba bố cục: checklist; quan hệ/quy trình/so sánh; minh họa ít chữ. Logo gốc cùng hàng, cân bằng ngang/tròn, giữ chi tiết; thông điệp đọc được trên mobile. Bố cục/loại ảnh theo nội dung, tỷ lệ20/20 không ép từng ngày. Đào tạo3,5năm khóa2026 và footer giữ nguyên.

## 3. Phiếu kiểm thử

Mỗi lần chạy ghi: test ID/nhánh; local/mock/live; release/config/schema; preconditions (slot/post/gate/attempt/maintenance); failpoint và thời gian giả lập/thực; số remote requests; evidence/publication/usage/slot/outbox cuối; notification; đường phục hồi; PASS/FAIL/NOT_RUN; file/log/ID/link đã loại secret; người chạy và thời điểm. NOT_RUN không được tính PASS. 36 nhóm ca kế hoạch là căn cứ phạm vi, bảng dưới là luồng chứng minh đầu tiên.

| Luồng | Expected result | Kết quả |
|---|---|---|
| Đăng bình thường | Đúng đích/payload, một publication, slot/usage/outbox đúng; delivered có bằng chứng | NOT_RUN |
| Lỗi riêng bài | ≤3 lần đủ điều kiện,5phút mặc định; reserve đúng ưu tiên cùng ngày | NOT_RUN |
| Lỗi kết nối/rate limit | Dừng/chờ đúng phạm vi, không tiêu kho vô ích | NOT_RUN |
| Timeout Facebook | Unknown giữ chặn; reconcile trước request mới | NOT_RUN |
| Crash sau confirmed evidence | Finalizer hoàn tất một lần, không publish lại | NOT_RUN |
| Claim0 dòng/tranh page gate | Không request hoặc ghi phụ sai | NOT_RUN |
| Backup begin tranh intent | Chỉ bên thắng được thao tác; bên kia deferred/blocked | NOT_RUN |
| Export xong/copy ảnh dài | DB maintenance gỡ đúng owner; pin còn,package chưa complete không restore | NOT_RUN |
| Restore sau publication | Quarantine và reconcile, không tự phát lại/khôi phục phiên cũ | NOT_RUN |
| Telegram timeout | Có thể lặp cùng event_id, không gọi Facebook, không giả delivered | NOT_RUN |
| Worker chết/monitor state lỗi | Monitor báo ngoài Cloudflare; checkpoint/recovery có căn cứ hoặc nêu best effort | NOT_RUN |
| Admin trực tiếp trước/sau10h | Không tiêu slot/kho/guard,không dừng lượt tự động;caption giống không gán job | NOT_RUN |

## 4. Nghiệm thu vận hành/live

- GitHub checkpoint: tên riêng intent/result, đọc run trước kể cả failed, refresh24h,expiry/retention≥7ngày; đo quyền,APIcalls,Actionsminutes,artifact/quota. Chưa chạy.
- Backup: giải mã thật,đúng schema và đủ file/checksum;phân biệtexport_finished/complete;stagingquarantine,secrets/session loại trừ,đăng nhập lại. Chưa chạy.
- Owner: tìm/sửa bài lỗi,bổ sung kho,chọn mốc tiếp tục,đọc unknown;hướng dẫn rõ bước cần kỹ thuật,không bắtSQL/lease. Chưa chạy.
- Fanpage thử: API/quyền,caption/ảnh/logo/footer,time/ID/link,Telegram,lịch khi PC tắt;mock không thay live. Chưa có đích/quyền được thử.
- Production chỉ sau cổngC,đúngSHA/config và người dùng xác nhậnfanpage/ngàybật. Bài admin trực tiếp bổ sung độc lập.

## 5. Kết luận hiện tại

Đủ bắt đầu lập trình bản chạy thử local theo thiết kế. Chưa đủ đăng thật hoặc bật production. Năm mẫu và các thử nghiệm là công việc triển khai tiếp theo; không cần thêm vòng mở rộng kế hoạch trước code. Lượt lập phiếu chỉ cập nhật tài liệu, chưa bắt đầu ứng dụng.

Mốc bước 8: 135/135 Node, 8/8 editor browser, 14/14 UI, 5/5 sample browser, 9/9 image đạt.
Xem docs/steps/08-local-editor.md. Kết quả local chưa thay cho nghiệm thu fanpage thật.

Mốc bước 9: 145/145 Node, 8/8 source + 8/8 editor + 14/14 UI + 5/5 sample browser,
9/9 image đạt. Kiểm định cấu trúc/toàn vẹn nguồn và caption trùng nguyên văn, chưa xác minh
ngữ nghĩa mọi nhận định; rà soát cần người quản lý. Xem docs/steps/09-source-review.md.

Mốc bước 10: 154/154 Node, 7/7 backup + 14/14 UI + 5/5 sample + 8/8 editor + 8/8 source
browser, 9/9 image đạt. Sao lưu thực tế kho local hoàn tất; khôi phục kiểm thử vào kho riêng
paused/quarantined, giữ nguồn/ảnh/lịch sử. Chưa nghiệm thu backup mã hóa/cloud/production.
Chi tiết và runbook local: docs/steps/10-local-backups.md.

Mốc bước 11: 157/157 Node local, 9/9 image, 121/121 portable. CI GitHub thực tế trên Ubuntu và
Windows thành công; repository riêng tư đã tạo/main đã push. Private tài liệu/logo/ảnh mẫu,
database/backup và tài khoản giữ ngoài Git. Xem docs/steps/11-github-ci.md.

Mốc bước 12: 169/169 Node local, 133/133 portable, smoke Workers/D1 local đạt (bundle,
7 migration, status bảo vệ, cron heartbeat). CI Ubuntu/Windows đạt. Đã có Cloudflare account
và D1 staging riêng; chưa deploy/bằng chứng cron thật; cổng cloud chưa đạt. Pipeline staging
giữ tắt chờ token/phê duyệt setup. Xem docs/steps/12-staging-foundation.md.
