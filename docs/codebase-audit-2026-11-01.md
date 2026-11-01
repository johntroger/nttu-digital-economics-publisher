# Rà soát và tối ưu codebase — 01/11/2026

Theo yêu cầu rà toàn bộ codebase, bỏ phần dư thừa và ngừng dùng staging. Bản gốc là `027ba09e5bdda3a22342468a78dbc6aaf294d92b`. Thay đổi mã hiện nằm trong workspace, chưa push main hoặc triển khai release production mới. Việc tắt nguồn staging đã áp dụng thật, có biên nhận riêng.

## Kết luận và thay đổi

| Vấn đề | Xử lý | Kết quả / giới hạn |
| --- | --- | --- |
| Kiểm tra repository tạo một Git process cho mỗi tệp | Đọc object ID từ index, kiểm tra kích thước trước và đọc blob theo batch tối đa khoảng 8 MiB | Cùng 496 tệp: 51.987 ms → 573 ms trong một lần đo trên máy Windows. Khoảng 91 lần nhanh hơn; đây là phép đo local đơn lẻ, không phải cam kết thời gian CI. Giữ kiểm tra staged content, không tin bản thay thế chưa stage; không đọc toàn bộ blob quá cỡ. |
| Node runner hằng ngày cài cả công cụ phát triển | Chuyển `jose` sang dependencies runtime, giữ nguyên phiên bản và integrity; workflow dùng `npm ci --omit=dev --ignore-scripts` | Không cần cài TypeScript/Wrangler để chạy publisher. Test nạp toàn bộ runner với bộ chặn import dependency phát triển và mạng. Không đổi phiên bản package. |
| Sửa tài liệu vẫn chạy matrix Windows/Linux và D1 nặng | Tích hợp classifier đã chuẩn bị ở nhánh cũ, theo danh sách tài liệu cụ thể | Vẫn quét index; sửa code/config/đường dẫn chưa duyệt, diff lỗi hoặc manual đều chạy đầy đủ. Không dùng `paths-ignore` rộng. |
| Staging còn đường deploy/import/giám sát riêng | Bỏ job deploy, nhánh monitor staging, CLI deploy/import staging và job F7 billing chẩn đoán theo nhánh cũ | Monitor chỉ chấp nhận production. Giữ helper thuần/fixture offline còn phục vụ test và production. |
| Tám script chỉ bọc `node --test` | Xóa wrapper; `run-clean.mjs test` nhận các suite hợp lệ, portable chạy test trực tiếp | Một bộ chạy kiểm thử và tự dọn; tên suite sai bị từ chối. Các lệnh npm stages/runner vẫn dùng được; thêm quota command. |
| Mười hai script phát hành F8–F11 một lần, gắn cứng release cũ | Xóa khỏi cây mã đang làm việc sau khi rà import và lệnh gọi | Không thuộc luồng chạy hiện hành, không có module còn lại import chúng. Nguồn lịch sử vẫn trong Git; backup và biên nhận triển khai không bị xóa. |
| Router đọc identity D1 rồi handler đọc lại | Truyền kết quả đã kiểm tra trong cùng request cho monitor, HTTP tick và preflight; handler vẫn kiểm tra identity khi được gọi độc lập | Bớt một identity query cho mỗi request này. Test monitor/tick xác nhận đúng một lần đọc; không cache quyền giữa các request. Nếu Telegram chạy đủ mỗi 5 phút, tương ứng giảm 288 identity query/ngày, không phải khẳng định giảm 288 hàng D1. |
| Fixture kiểm tra Git nằm ngoài vùng tự dọn | Chuyển fixture mới sang `tmp/tests/repository-guard/` | Bộ chạy dọn cả khi test thất bại; không xóa thư mục cũ theo tuổi hoặc quét xóa toàn bộ tmp. |
| Hai biến snapshot không dùng vẫn gọi JSON.parse | Bỏ phép parse dư trong hai bộ giả lập | Logic so khớp snapshot/eligibility vẫn giữ. Bật noUnusedLocals/noUnusedParameters để chặn tái xuất hiện mã TS không dùng. |
| README mô tả trạng thái dừng ở bước 21 | Viết lại hướng dẫn hiện hành, giữ bản cũ trong docs/history | Tách lịch sử triển khai khỏi chỉ dẫn đang dùng. |

Tổng cộng **22 script cũ bị xóa**, gồm 8 wrapper test, 12 công cụ phát hành một lần, công cụ deploy staging và công cụ upload staging. Phần parser D1 của công cụ upload được chuyển sang `scripts/d1-output.mjs`, vẫn được production dùng. Tách bỏ phần remote transfer của `cloud-batch-import.mjs`; giữ hàm duyệt gói đã được production import và SQL fixture dùng trong test.

## Staging đã dừng trên hệ thống thật

Đọc lại sau thao tác ngày 01/11 xác nhận:

- Cron của Worker `nttu-publisher-staging`: danh sách rỗng.
- GitHub `STAGING_DEPLOY_ENABLED=false`, `MONITOR_ENABLED=false`.
- `PRODUCTION_ACTIONS_ENABLED`, `PRODUCTION_MONITOR_ENABLED` và SHA production giữ nguyên.
- Không sửa database, không xóa object R2, không gửi bài hoặc tin thử. Worker/D1/R2 cũ giữ lại để bảo toàn dữ liệu, chưa xóa tài nguyên.

Yêu cầu API cron đầu tiên dùng sai cấu trúc body và bị Cloudflare trả 400. Đã đối chiếu source Wrangler đang cài, gửi lại mảng rỗng đúng schema và đọc lại xác nhận cron rỗng. Biên nhận trước/sau ở `tmp/staging-retirement-20261101/`.

## Những phần cần giữ

Production có 39 module trong graph import (gồm cả import kiểu TypeScript) của các entrypoint chính. Chín module `src/cloud` vẫn được production sử dụng ở runtime hoặc làm kiểu dữ liệu: auth, catalog, meta, review, runtime, source-registry, storage, telegram và version-guard. Xóa cả thư mục theo tên staging/cloud sẽ làm hỏng production.

Local editor, renderer, kiểm định nguồn, backup/restore, schema/migrations cũ và các fixture cách ly vẫn có người gọi hoặc cần để kiểm tra khôi phục. Chúng không nằm trong bundle production khi không được import. Mã rollback, intent/evidence/finalizer, snapshot/checksum, rào chống trùng và đối soát unknown được giữ; đây là cơ chế bảo toàn dữ liệu, không phải chi phí dư có thể bỏ tùy ý.

Các script quản trị local chưa theo dõi trong Git và tài liệu/ảnh/PDF/DOCX của người dùng được giữ nguyên, ngoài hai helper sửa/đo tạm được tạo riêng trong lượt này rồi dọn. Không xóa backup thật, database local đang dùng, hồ sơ nghiệm thu hoặc nội dung đã duyệt. File cache có trước lượt chạy không bị xóa theo suy đoán.

Không tối ưu bằng cách cache kết quả quyền đăng/identity qua nhiều request, giảm kiểm tra Meta/checksum, gộp gửi Facebook với Telegram hoặc bỏ đối soát khi mất phản hồi. Không thay index/schema D1 đã triển khai trong đợt dọn mã này; các đọc snapshot toàn kho cần phát hiện thay đổi đủ để giữ tính nhất quán.

## Kiểm chứng và trạng thái phát hành

Biên nhận kiểm tra nằm tại `tmp/codebase-audit-20261101/`: static-audit.json, full-check.log, management-runtime.log và monitor-runtime.log. Báo cáo static ghi graph import, module offline/entrypoint khác, file xóa, lỗi cú pháp/import và phép đo checker. Đây là kiểm tra tĩnh và test local, không phải audit bảo mật đầy đủ hoặc đo CPU thật trên Cloudflare.

TypeScript strict cùng **549/549 kiểm thử local** đã đạt trên bản cuối, gồm bộ lọc CI và test dependency runtime. Hai kiểm tra workerd/D1 local cũng đạt, dùng schema production đầy đủ và schema 16, không gọi provider. Kết quả CPU cloud vẫn chưa được đo cho release mới. Bộ chạy đã dọn fixture/cache mới trong các vùng được phép cả khi kiểm thử thất bại. Các thư mục guard-tests ở đường dẫn cũ ngoài vùng tự dọn được giữ lại vì không có snapshot trước lượt baseline để xác định chính xác từng thư mục thuộc lượt nào; không xóa theo tuổi file. Những lượt sau bản sửa dùng đường dẫn tự dọn mới. Lượt baseline đầu bị quyền sandbox chặn loopback; chạy lại ngoài giới hạn loopback đã đạt, không sửa assertion để che lỗi.

Chưa tạo commit/release mới hoặc CI GitHub cho bản tối ưu này. Không dispatch publisher và không gửi bài bù. Policy tháng 10 hết hạn **07:00 ngày 01/11/2026 giờ Việt Nam**; việc tối ưu hoặc tắt staging không gia hạn policy và quyền gửi tháng 11. Cần hồ sơ tháng mới trước khi mở lại lịch production.
