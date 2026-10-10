# F6 — tích hợp runner, cấu hình đóng

Ngày thực hiện: 10/10/2026, giờ Việt Nam. Chủ dự án đã duyệt F6; không mở rộng sang rollout hoặc đăng Facebook thật.

## Kết quả triển khai

Entrypoint `src/production/runner-worker.ts` chỉ nhận các route runner tại origin cố định, dùng D1/R2 production đã xác định. Không có giao diện, OAuth, lịch cron hoặc credential Meta trong cấu hình Worker runner. Giao diện quản lý, health và preflight nhận schema14/15/16; schema16 chọn engine Node. Hai entrypoint publisher cũ bị chặn trên schema16, kể cả khi ai đó đặt đồng thời hai cổng bật.

Nút tạm dừng yêu cầu phiên owner, CSRF và JSON `{}`. Nó tắt cấu hình, thu hồi permit, hủy các hold chưa gửi và giữ nguyên requested/unknown để đối soát. Không có nút bật hoặc route cấp quyền đăng mới trong F6.

Node đọc kho qua sáu nhóm phân trang, tối đa tám hàng mỗi trang; kiểm tra review/source/fact/ảnh bằng projection hiện hành. Số còn lại loại bài đã dùng; tách kho chính/dự phòng và số có prerequisite đã hoàn thành. Chốt cảnh báo kho cùng snapshot mới và receipt CAS trong một D1 batch. Thay đổi dữ liệu, release, pause, thời hạn hoặc tranh chấp scan đều chặn chốt. Không thay caption, thiết kế, tỷ lệ audience 70/30 hoặc các xác nhận chương trình 3,5 năm đã duyệt.

Migration16 được bổ sung cột `commit_token` của stock scan. Migration này chưa từng áp dụng vào production thật; clone F5 đã xóa. Checksum và bundle cuối F6 khác F5, vì vậy số đo CPU F5 không nghiệm thu thay cho F6. Rollback16 bỏ riêng phần runner và cột mới, có guard giữ mọi hồ sơ outbound chưa giải quyết. Các bảng nội dung, journal publisher và usage vẫn giữ.

Wrapper live dùng origin/Page/Graph cố định; kiểm tra workflow_dispatch trên main, workflow path, SHA được duyệt và metadata run từ GitHub trước khi dùng capability runner. Server release phải khớp. Client giả lập vẫn chỉ cho loopback; transport live được kiểm thử bằng cách chuyển toàn bộ URL sang máy chủ giả lập.

Quota adapter đọc usage tháng hiện tại của **toàn tài khoản**, không lọc repository. Nó tính usage có trọng số, giữ phần dự phòng CI/monitor và một chu kỳ tối thiểu năm phút. Sai cấu trúc, không đọc được usage, SKU lạ, phí khác 0 hoặc thiếu ngân sách đã xác minh đều dừng trước claim. Workflow hard timeout năm phút; Node timeout 210 giây, ngân sách xử lý 180 giây. Không lưu artifact/cache trong workflow live.

Receipt budget phải xác nhận account-wide Actions, Free, mức tiền 0, Stop usage bật, allowance và dự phòng thực tế; hạn receipt hiện tại **24 giờ**. API usage không chứng minh budget đã khóa chi phí. Đây là cổng bảo thủ cho rollout thử, chưa phải giải pháp tự vận hành dài ngày: trước vận hành chính thức cần phương án tái xác minh budget mà không yêu cầu owner làm mỗi ngày. F6 không giả định tài khoản hiện đủ quota hoặc đã có budget phù hợp.

Monitor Node thực hiện status → Meta GET → status, dùng kết quả state mới sau xác minh. Watchdog Worker dùng monitor capability riêng, trả 503 khi runner không bắt đầu đúng hạn, bị ngắt hoặc báo lỗi. Có thể để cron-job.org đọc trực tiếp watchdog để nhận email ngay cả khi Actions hết quota; chưa tạo hoặc thay tác vụ thật trong F6. Dispatcher trả 204 không được coi là một lượt runner thành công.

## Cấu hình rollout và rollback được chuẩn bị

`scripts/production-f6-config.mjs` tạo đề xuất thuần dữ liệu, không ghi config đang dùng và không deploy. Hai cổng publisher/runner đều false; biến GitHub Actions false; cron rỗng. Worker runner dùng CPU limit10ms và không nhận credential Google/Meta. Workflow live chỉ manual, khóa main/SHA, dùng environment `production-runner`; không dựa vào khả năng required reviewer của gói GitHub Free private.

Rollout phải giữ nguyên OAuth, Telegram, assets/font và secret hiện có của management Worker khi tạo cấu hình triển khai cuối. Danh sách credential là yêu cầu cho bước kết nối tiếp theo, chưa cấp hoặc sao chép secret. Không tự tải secret từ Cloudflare sang GitHub.

Rollback: tắt cổng Actions và runner trước, owner pause, đọc journal mới. Nếu còn requested/unknown/unapplied evidence thì giữ schema16 và đối soát GET; không chạy SQL hạ schema hoặc xóa journal. Khi mọi trạng thái đã được giải quyết và cổng đóng, rollback16 có guard; management vẫn đọc schema15/14. Khôi phục runtime F2/schema14 phải dùng backup và phương án giữ các publication/usage mới, không ghi đè backup cũ lên journal đã phát sinh.

## Kiểm thử và giới hạn nghiệm thu

Kiểm thử local cuối đã đạt: **496/496 test**, TypeScript và **13/13 kiểm tra ảnh**. Trong đó có14 test F6 và một test UI pause mới. Bundle entrypoint runner thật đã chạy trên workerd/D1 cục bộ: status cửa đóng, origin gate, stock40 (30 chính/10 dự phòng) và chặn finalize thiếu trang đều đạt; cả management và runner đã biên dịch dry-run.

CI chạy thêm bundle entrypoint thật trên workerd/D1 cục bộ cùng toàn bộ hồi quy F5. Receipt CI của commit được giữ tại `tmp/step38/f6/ci.json`, evidence native tại `tmp/step38/f6/native-results.json`. CI phải thành công trên Linux và Windows trước khi coi draft PR qua nghiệm thu code. Không quy kết thời gian local thành phút tính phí Actions hoặc CPU cloud.

Không có migration/deploy thật, thay main/cron, credential mới, Facebook POST hoặc Telegram send thật trong F6. Fixture/cache mỗi lượt được dọn qua run-clean, giữ evidence nghiệm thu và dữ liệu gốc.

## Bước tiếp theo cần duyệt riêng

F7: hoàn thiện cấu hình triển khai đóng với assets/secret giữ nguyên; xác minh quota/budget và kế hoạch kích hoạt miễn phí; đo CPU bundle cuối trên clone riêng (gồm stock/heartbeat/watchdog và cold quan sát được); kiểm thử owner login/pause và rollback trước migration production. Chưa bật đăng hoặc đổi cron production. Chỉ sau nghiệm thu đóng mới xin duyệt một bài POST thật riêng.

Tài liệu đối chiếu: [GitHub billing usage API](https://docs.github.com/en/rest/billing/usage), [budget và Stop usage](https://docs.github.com/en/billing/how-tos/set-up-budgets), [workflow contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts). Các điều kiện plan, allowance và phí phải kiểm tra lại với tài khoản thật tại rollout.
