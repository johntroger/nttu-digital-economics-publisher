# Bước 37 — Adapter live, giữ cửa đăng production đóng

Người quản lý phê duyệt phạm vi trong `37-production-live-adapter-plan.md`. Không có phê duyệt đăng Facebook thật hoặc cấp credential publisher cho dịch vụ ngoài.

## Kết quả triển khai

- Adapter D1/R2 thật cố định Page 817593604765443, database/bucket production. Schema 0014 thêm config tắt, permit rỗng, snapshot bất biến, claim/intent/evidence/usage và heartbeat riêng; không nhập dữ liệu fixture. Bảng legacy production_control vẫn giữ CHECK enabled=0/connection_verified=0.
- Provider Meta phải được inject rõ ràng. Kiểm checksum bytes ảnh, token/App/Page/scopes/fingerprint; xác minh bài bằng GET với Page, caption và thời gian tương ứng intent. R2 đọc tối đa 5 giây, xác minh kết nối tối đa 8 giây, POST và đọc bằng chứng cùng ngân sách 10 giây. Không có default fetch trong provider.
- HTTP publisher là endpoint/capability riêng. Token Telegram/monitor bị từ chối; không tạo Secret mới và không tạo tác vụ cron-job.org. Native Cron và HTTP Telegram không gọi adapter Facebook.
- Publication permit khớp chính xác phiên bản/caption/ảnh/ngày/giờ/owner. Permit thường dùng 10:00 Việt Nam; test phải ghi rõ mode test và thời điểm đã duyệt. Chưa có endpoint cấp permit hoặc bật config. Duyệt nội dung/thiết kế 22–23 không trở thành phê duyệt đăng.
- Lease HTTP và unique active Page job ngăn gửi đồng thời. Intent commit trước POST. Timeout/5xx/mất phản hồi giữ unknown và khóa Page qua ngày tiếp theo. Retry chỉ khi Graph trả lỗi từ chối rõ ràng; tối đa ba lượt, cách nhau năm phút. Bài dự phòng cần permit riêng, chạy ở invocation sau.
- Evidence lưu trước finalizer; rollback finalizer phục hồi cả khi paused, không POST lại. Đối soát chỉ GET; ID người dùng cung cấp là gợi ý, chưa phải bằng chứng. Tạm dừng thu hồi permit và hủy held/retry_wait; requested/unknown giữ khóa.
- Event production vào hàng chờ Telegram hiện có. Kiểm tồn kho tách sang lượt sau; không ghép hai provider sends. Publisher heartbeat tách hoàn toàn heartbeat Telegram, ghi số truy vấn và thời gian xử lý; thời gian xử lý là wall time, không phải CPU time.
- Preflight owner-only hiển thị cửa triển khai/dữ liệu/phê duyệt/capability, ngày Việt Nam và trạng thái publisher. GET chỉ đọc; không tạo lịch/job/permit.
- Giám sát chấp nhận schema13 và14, kiểm publisher đóng và báo unknown hoặc vượt query/time budget. Schema13 còn dùng được trong lúc rollout. Không merge mã Worker production vào staging main.

## Kiểm thử và giới hạn

Đã kiểm thử giao dịch migration/rollback rỗng, khóa rollback nếu có permit, cạnh tranh HTTP, ảnh sai checksum, token đổi, nguồn bị thu hồi sau network preflight, pause sau intent, retry ba lượt, unknown qua ngày, evidence rollback và đối soát GET. Workerd dùng D1/R2 native với mọi outbound Meta mock; kiểm checksum bytes thực tế trên máy owner. CI dùng PNG fixture và receipt sinh trong test vì ảnh/PDF riêng tư không được đưa lên GitHub; không coi fixture đó là phê duyệt thật.

Adapter giới hạn 46 câu lệnh được chuẩn bị trong operation và ghi telemetry riêng; trường hợp gửi thành công native hiện ghi 37 truy vấn, cửa đóng 6. Không dùng số liệu wall time để suy diễn CPU production. Chưa kiểm POST Meta thật, chưa nghiệm thu giới hạn CPU khi gửi thật, chưa chứng minh lịch publisher ngoài đã chạy: ba mục này cần bước thử có phê duyệt cụ thể tiếp theo.

## Bằng chứng rollout

- Hoàn thành phạm vi cửa đóng ngày 07/10/2026. Runtime `29a0b1a6b4474d20fa1dc04e2022a4a8b9eca514`, Cloudflare version `0edf875e-7b75-4ce2-aadc-8d473b396672`; schema14 đã áp dụng.
- [CI runtime 37621121330](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37621121330): Windows/Ubuntu success, deploy-staging skipped. Hook bắt buộc và local full: **395/395 tests**, TypeScript PASS, **13 artwork checks PASS**. Native management và live adapter đều PASS; live adapter 6 kịch bản, toàn bộ Meta outbound mock.
- Migration và rollback được thử trên **bản export D1 production thật** trước rollout: giữ 40 approvals, 56 assets, mọi operation count bằng 0 và integrity_check=ok. Bản SQL nằm trong tmp/step37/production-before.sql, không đưa lên GitHub.
- D1 sau triển khai: **40 posts / 56 assets / 14 migrations**, **0 legacy jobs/slots/publications**, **0 permits / publisher jobs / publisher publications**. paused=1, legacy enabled=0/connection_verified=0/page_id=NULL, publisher enabled=0/active_job=NULL/heartbeat=0.
- Telegram HTTP vẫn bật, lượt quan sát heartbeat **416**, completion idle; không coi heartbeat này là publisher đã chạy. Staging vẫn release `556db22c45e1dcdc76b9628a51415730d007da42`, không thay D1/lịch Tập Viết.
- Giao diện owner thực tế đã tải 40/40 receipts và bảng preflight đóng/chưa cấp, unknown=0, publisher heartbeat=0. Screenshot: tmp/step37/preflight-production.png. Anonymous GET preflight/preview/management/me/JS đều 401; anonymous POST publisher tick 401. Native test xác minh token Telegram/monitor cũng 401 với endpoint publisher.
- Tail Cloudflare **thực tế**, chỉ lưu trường đã lọc, không lưu header/token: GET preflight CPU **5 ms**, wall **183 ms**; preview CPU **36 ms**, wall **177 ms**; management CPU **20 ms**, wall **411 ms**; Telegram tick CPU **8 ms**, wall **2139 ms**; tất cả outcome=ok. Đây là mẫu quan sát phần management cửa đóng, không chứng minh CPU của toàn đường gửi Facebook. File tmp/step37/tail-metrics.json.
- Chỉ các tệp monitor/test/workflow giám sát được cập nhật trên main tại `269b0d11d1b4246b8fa80163008dc6a2af829de4`; [CI main 37621708007](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37621708007) success. Cờ STAGING_DEPLOY_ENABLED đã trả giá trị ban đầu; không deploy mã production vào staging.
- [Lượt giám sát sau rollout 37622035123](https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37622035123) success, checkpoint incidents={}. [Draft PR #9](https://github.com/johntroger/nttu-digital-economics-publisher/pull/9) xếp trên Bước36, không merge.

**Real Facebook POST: NOT_RUN. Không tạo/lưu Secret publisher, không tạo cron-job.org job mới, không cấp permit và không bật lịch.** Bước37 đã hoàn thành phạm vi adapter/preflight cửa đóng. CPU của đường chuẩn bị/gửi thật, quyền API khi POST và nhịp publisher ngoài vẫn chưa nghiệm thu; chưa kết luận sẵn sàng đăng chính thức.
