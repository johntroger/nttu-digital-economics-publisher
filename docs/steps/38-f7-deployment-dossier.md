# Hồ sơ triển khai — ngân sách miễn phí và rollout đóng

Ngày chốt thiết kế: 10/10/2026, giờ Việt Nam. Hồ sơ chuẩn bị, chưa phải lệnh triển khai. CPU cloud và UI trình duyệt còn chờ kiểm thử theo yêu cầu của người quản lý. Không merge main, đổi cron, lưu credential ngoài dịch vụ hiện có hoặc bật đăng bài trong bước này.

## Cơ chế ngân sách được chọn

GitHub dùng ngân sách Actions **0 USD, scope toàn tài khoản, Stop usage bật**, kết hợp bộ chặn quota trong Node runner. Không mua phút, đổi gói hoặc tự nâng ngân sách. GitHub cung cấp cơ chế dừng theo budget; usage API không chứng minh budget đang bật. Nguồn chính thức: [GitHub budgets](https://docs.github.com/en/billing/how-tos/set-up-budgets), [hạn mức theo gói](https://docs.github.com/en/billing/reference/product-usage-included).

Trước rollout, người quản lý hoặc agent được ủy quyền đọc UI GitHub đang đăng nhập, lưu bằng chứng budget, rồi người quản lý duyệt policy của **một tháng UTC và một release SHA**. Policy v2 là xác nhận có thời hạn của owner, không phải chứng nhận budget từ API. Không tự sửa verifiedAt, suy ra Stop usage từ phí bằng 0, hoặc chuyển receipt 24 giờ cũ thành receipt tháng.

Policy hết hiệu lực đúng 00:00 UTC ngày đầu tháng kế tiếp (07:00 giờ Việt Nam). Cần xác nhận mới cho tháng mới hoặc khi đổi release/gói/budget; không tự gia hạn. Nếu ngân sách bị thay đổi giữa tháng, phải đóng PRODUCTION_ACTIONS_ENABLED ngay và thu hồi policy. Mã không tự phát hiện được thay đổi budget cá nhân qua usage API; đây là giới hạn có chủ đích của xác nhận owner. Nếu owner không muốn chấp nhận giới hạn này, tiếp tục dùng receipt v1 24 giờ và hệ thống sẽ dừng khi hết hạn.

Ví dụ đóng tại `cloud/production-billing-policy.example.json`: ownerApproved=false, ngày/tháng/SHA để null. **Không dùng mẫu này để bật vận hành.** Chỉ điền bản riêng sau kiểm tra và duyệt; lưu trong GitHub variable PRODUCTION_BILLING_POLICY ở bước rollout được phê duyệt. Không cần gửi token qua chat.

Trước từng lượt chạy, đọc usage **toàn tài khoản** trong tháng hiện tại; tính cả repository khác, làm tròn từng dòng và áp trọng số bảo thủ Linux=1, Windows=2, macOS=10. API lỗi, dữ liệu trống/không hỗ trợ, phí khác 0, thiếu policy, hết tháng, sai release hoặc thiếu quota đều chặn trước claim/POST. Giữ tối thiểu **600 phút** dự phòng và tối đa 5 phút cho một job; không tự thử lại chỉ để vượt quota. Workflow hiện tại vẫn đóng và chỉ dùng standard Ubuntu.

Budget GitHub cũng phải được kiểm tra cho phần storage áp dụng. Runner không upload ảnh/PDF lên Actions artifacts; bản phục hồi giữ ngoài Actions. Cần đọc storage/cache/artifact của toàn tài khoản trước rollout; bộ kiểm minutes hiện tại **chưa đo storage**. Không tuyên bố toàn bộ tài khoản chắc chắn miễn phí chỉ từ số phút.

## Giám sát tiết kiệm quota — cấu hình đề xuất

| Hạng mục | Cấu hình khi rollout được duyệt | Trạng thái hiện tại |
| --- | --- | --- |
| Đăng chính thức | 1 lượt/ngày, 10:00 Asia/Ho_Chi_Minh; một bài/ngày | Đóng |
| Monitor GitHub | External primary 1 lượt/ngày lúc 10:30; fallback GitHub 1 lượt/tuần | Chưa đổi cron đang chạy |
| Watchdog độc lập | cron-job.org gọi HTTP read-only lúc 10:10 và 10:20; báo lỗi/phục hồi qua kênh có sẵn | Cần cấu hình và kiểm thử riêng |
| Node runner | Ubuntu, timeout job 5 phút; không tùy chọn ref hoặc lịch tùy ý | Giữ whitelist và khóa release |
| CI | Chạy khi có thay đổi cần kiểm tra; dự phòng 300 phút | Không chạy lặp để chờ |

Phương án YAML cho bước rollout: primary `30 3 * * *`, fallback `23 14 * * 0` (UTC); khi external primary bật, chỉ fallback GitHub được chạy. Tác vụ ngoài gọi cùng workflow một lần/ngày, không mỗi 30 phút. Đây là thay đổi đề xuất cho monitor hiện đang kiểm cả staging và production; cần duyệt phạm vi trước khi giảm tần suất. GitHub cron có thể trễ; nguồn ngoài cũng cần xác minh job **completed**, không coi HTTP 204 là đăng thành công. Watchdog HTTP độc lập kiểm lượt đăng trong ngày và email báo lỗi; không tiêu thụ GitHub runner.

Dự toán theo timeout đầy đủ, không giả định monitor chỉ tốn 1 phút: 22 ngày còn lại có 22 primary + tối đa 4 fallback tuần = 26 job × 5 phút = 130; runner 110; CI 300; công việc khác 100; tổng **640 phút**. Snapshot usage cũ 1.116/2.000 cho biên 244 phút, **không phải quota hiện tại**. Tháng dài nhất: (31 primary + 5 fallback) × 5 = 180 phút monitor, runner 155, CI 300, khác 100, tổng 735. Reserve 600 giữ phần monitor+CI+khác tối đa 580 phút, có thêm 20 phút biên. So với đề xuất mỗi 6 giờ trước đây, phương án này bảo thủ hơn vì dùng cả timeout 5 phút. Trước rollout phải đọc lại usage và tính lại; repo khác/các retry ngoài dự toán có thể làm thiếu quota, khi đó dừng, không tăng budget. Các ngưỡng này là ngân sách dự phòng, không tự giới hạn CI hoặc việc ở repository khác.

## Cloudflare và R2

Workers giữ gói Free, dùng cap CPU mặc định; không ghi limits.cpu_ms hoặc mua Paid. Giới hạn provider không thay thế nghiệm thu CPU. D1 theo dõi quota toàn tài khoản, ngưỡng thử hiện có 3 triệu rowsRead/50 nghìn rowsWritten mỗi ngày UTC; không reset ledger và không tự thử lặp khi chạm ngưỡng.

R2 **Standard** có miễn phí 10 GB-month, 1 triệu Class A và 10 triệu Class B/tháng; vượt mức có thể tính phí, Infrequent Access không có free tier. [Nguồn R2](https://developers.cloudflare.com/r2/pricing/). Không có bằng chứng hard stop R2 trong hồ sơ này, nên **không hứa chi phí tài khoản tuyệt đối bằng 0**. Chỉ chấp nhận rollout sau khi đọc storage/operation toàn tài khoản, xác nhận Standard và có biên dự phòng; cấm public bucket, upload/clone không giới hạn và lịch backup lặp không cần thiết. Khi usage không đọc được hoặc gần giới hạn, dừng nhập ảnh/tạo clone trước; không xóa ảnh gốc hoặc backup thật để che quota. Bộ chặn R2 tự động đầy đủ chưa được nghiệm thu, phải giữ mục này trong danh sách chờ.

## Điều kiện trước triển khai

| Điều kiện | Bằng chứng / trạng thái |
| --- | --- |
| Cơ chế ngân sách v2 | Đã code, 507/507 kiểm thử local và TypeScript đạt; cần xác nhận owner khi rollout |
| CPU đúng bundle cuối, cold và >=30 warm mỗi phase | Chờ; 14 mẫu tối đa 5 ms không đủ nghiệm thu |
| Owner pause/CSRF, dual engine, rollback có guard | Local đạt; HTTP không thay nghiệm thu UI trình duyệt/cloud |
| Rollback journal hoàn tất | Local schema 16→15, giữ 40 bài và journal |
| Quota và storage mới của GitHub/Cloudflare/R2 | Chờ đọc sát thời điểm rollout |
| CI đúng SHA cuối trên Windows/Linux | Chờ đẩy nhánh và CI |
| Backup production mới, kiểm checksum và thử phục hồi | Cần làm trước migration; giữ bản thật hiện có |
| Credential live, migration và rollout | Chờ phê duyệt riêng; chưa copy credential |
| Bài kiểm thử thật và bật lịch | Chờ nghiệm thu rồi phê duyệt riêng |

## Trình tự rollout để duyệt sau

1. Chốt SHA cuối đã qua CI, CPU và UI/cloud; đọc lại quota/plan/budget/storage. Hoàn tất policy owner tháng hiện tại, expiry UTC và SHA đúng. Nếu còn điều kiện chờ thì dừng.
2. Tạm khóa Actions và cả hai engine; backup mới và xác minh journal không unresolved. Giữ OAuth/Telegram/UI/fonts, D1/R2 hiện có. Lưu phiên bản Worker trước thay đổi; không xóa dữ liệu.
3. Áp migration 15/16 có kiểm checksum sau phê duyệt; triển khai management và runner **vẫn đóng**. Kiểm schema, UI/login, kho 40 bài, pause và trạng thái engine; outbound thực vẫn chưa được cấp.
4. Sau phê duyệt riêng, lưu đúng secret cho runner/GitHub environment production-runner và capability của scheduler. Kiểm Page ID 817593604765443; một SHA ở workflow, config và policy. Publisher cũ luôn false.
5. Đăng một bài kiểm thử thật chỉ khi được duyệt nội dung/ảnh và đích đăng. Xác minh post ID, caption/ảnh, journal confirmed, heartbeat, watchdog; không resend khi unknown.
6. Chỉ sau nghiệm thu bài thử mới bật lịch 10:00 một bài/ngày và đổi monitor sang đề xuất tiết kiệm. Ghi thời gian, SHA, run ID và người phê duyệt; theo dõi lượt lịch gần nhất bằng bằng chứng completed.

## Dừng và phục hồi

- quota_blocked / policy hết tháng: không POST; giữ lịch sử và nội dung, thông báo qua giám sát được cấp quyền. Owner xác minh lại budget/quota; không nâng ngân sách hoặc tự sửa receipt. Nếu policy đúng nhưng hết quota, chờ reset hoặc giảm các tác vụ không thiết yếu sau phê duyệt.
- unknown / needs_reconciliation: pause, giữ attempt/evidence và đối soát GET-only bằng luồng đã được cấp quyền; không tạo permit mới cho cùng bài để thử lại. Quota gate hiện chặn cả runner khi không đủ; không bypass gate để xử lý unknown, dùng đường đối soát được duyệt riêng nếu cần.
- Lỗi sau migration: khóa Actions và runner, giữ publisher cũ false; phục hồi code closed trước. SQL rollback 16→15 chỉ khi enabled=0, không held/requested/retry_wait/unknown và không evidence chưa applied. Nếu guard từ chối, giữ schema 16 và journal, xử lý đối soát trước. Không mở publisher cũ tự động sau rollback.
- Mất DB/ảnh: phục hồi từ gói đã kiểm checksum, giữ post ID/journal để tránh đăng trùng. Không dùng dữ liệu kiểm thử hoặc artifact CPU làm backup production.

## Kết quả bước chuẩn bị

Thiết kế ngân sách đã chốt cho hồ sơ; policy mẫu vẫn đóng. Hồ sơ này không coi các mục chờ là đạt và không cấp quyền triển khai/đăng bài. Các giới hạn platform được tra cứu ngày 10/10/2026; khi triển khai phải xác minh lại.
