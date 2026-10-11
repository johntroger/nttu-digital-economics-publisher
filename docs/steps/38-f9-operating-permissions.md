# F9 — hoàn tất cấu hình quyền ở trạng thái đóng

Ngày 11/10/2026, sau xác nhận chủ dự án: GitHub environment production-runner có đủ PRODUCTION_META_APP_SECRET, PRODUCTION_META_PAGE_ACCESS_TOKEN và PRODUCTION_RUNNER_TOKEN. Hai secret Meta do owner dán trực tiếp; không đọc giá trị hoặc gọi Meta để thử. Billing read token kế thừa repository đã có. Token nội bộ được tạo riêng và lưu đồng nhất tại environment GitHub cùng nttu-publisher-production/nttu-publisher-runner; chỉ lưu SHA256 nhận diện, không lưu plaintext local. Cổng vận hành vẫn false, HTTP runner/status với token mới trả503 như thiết kế.

Lần cấp token đầu bị automatic approval review từ chối vì phê duyệt F9 chung chưa nêu ba đích nhận credential; không chạy và không tạo token. Owner sau đó phê duyệt riêng đúng ba đích, thao tác được chấp nhận. Phiên OAuth Cloudflare cũ trả401 trước mutation; làm mới phiên hiện có qua Wrangler rồi thực hiện thành công. Thư viện mã hóa sealed box từ npm libsodium-wrappers0.7.15 chỉ được cài trong fixture của lượt chạy và đã được run-clean dọn cùng cache.

Owner xác nhận policy tháng UTC2026-10 cho runtime9ce88cc7. PRODUCTION_BILLING_POLICY đã lưu và readback đúng: budget0USD, Stop usage true, reserve600 phút, job5 phút, expiry01/11/2026 00:00UTC tức07:00 Việt Nam; không tự gia hạn. UI GitHub vừa đọc lại Free/1084,3 trên2000 phút/storage0 trên0,5GB/budget account0USD/Stop usageYes. Giữ usage API cũ bảo thủ1184 phút, không coi là API receipt mới; API usage vẫn phải đọc trước từng lượt vận hành. Policy chỉ chứng nhận xác nhận owner có thời hạn, không phát hiện thay đổi budget giữa tháng.

Đối chiếu live sau cấu hình: schema16, posts40/files56/jobs0/attempts0/publications0/enabled0/paused1. Actionsfalse, runnerfalse, legacyfalse, dailyfalse, lịch chưa bật. Không gửi Facebook/Telegram, không đổi main hoặc cron. Kiểm thử local25/25 đã đạt; không chạy lại CI cho runtime không đổi. Hồ sơ P01 có post/version/caption/image checksum và Page817593604765443, chưa có thời điểm hoặc quyền gửi.

Bằng chứng cuối:tmp/step38/f9/acceptance.json, capability-setup.json, billing-policy-applied.json, billing-ui-observation.json, sample-P01.json, sample-P01-caption.txt, P01.png. Các gói backup thật và hồ sơ F7/F8 giữ nguyên.

## F10 — đề xuất đồng bộ workflow/release đóng, cần phê duyệt bước mới

Main hiện269b0d11 khác release9ce88cc7. Workflow live yêu cầu main SHA trùng PRODUCTION_RUNNER_RELEASE; khóa này chưa vượt qua và chưa đủ điều kiện vận hành. Bước tiếp theo kiểm tra nhánh/PR/checks rồi trình thay đổi main và cổng deploy staging cụ thể, giữ production gửi/lịch tắt. Nếu SHA thay đổi, cần đồng bộ release và policy theo cổng duyệt, không bỏ kiểm tra SHA để dùng lại policy. Đọc quota mới trước mọi CI/dispatch cần thiết. Nghiệm thu Meta token và bài thử thật thuộc bước được duyệt riêng; lưu secret không chứng minh token đúng Page, phạm vi hoặc hạn dùng.

## Nhật ký chuẩn bị ban đầu

Chủ dự án phê duyệt F9 ngày 11/10/2026. Chưa phê duyệt gửi Facebook hoặc bật lịch. Runtime production vẫn là 9ce88cc7, schema16, trạng thái đóng của F8.

Đã tạo GitHub environment production-runner trên repository riêng tư, branch policy chỉ main. PRODUCTION_ACTIONS_ENABLED=false; PRODUCTION_RUNNER_RELEASE trỏ release F8 đã nghiệm thu. Billing read token đã có ở repository, không đọc/copy giá trị. Main hiện khác release; chưa merge/push/dispatch để vượt khóa ref/SHA.

Policy tháng 2026-10/release9ce88cc7 đã chuẩn bị ở tmp/step38/f9/billing-policy-review.json. OwnerApproved=false, chưa áp policy; cần đọc quota/budget mới và chốt xác nhận đúng tháng/release khi cấu hình kết nối hoàn chỉnh. Không tự gia hạn tháng hoặc coi phí0 là bằng chứng budget.

Kiểm thử local:25/25 bài kiểm budget/F6/F7 đạt; cổng Actions=false dừng trước mọi transport, policy chưa xác nhận bị chặn. Lượt trong sandbox gặp chặn localhost/junction; đã giữ log thất bại, chạy lại ngoài sandbox đạt. Không thay mã runtime để xử lý lỗi môi trường. Run-clean dọn fixture/cache cả hai lượt.

## Hướng dẫn lưu Meta secrets

Mở GitHub Settings → Environments → production-runner → Environment secrets → Add environment secret. Lưu hai secret riêng:

| Name | Value lấy từ đâu |
| --- | --- |
| PRODUCTION_META_APP_SECRET | Meta Developers → ứng dụng NTTU Digital Economics Publish (App ID1125636386458970) → Cài đặt ứng dụng → Cơ bản → Mã bí mật ứng dụng |
| PRODUCTION_META_PAGE_ACCESS_TOKEN | Token Trang dài hạn của Ngành Kinh tế số – NTTU, Page ID817593604765443; không dùng token Tập Viết hoặc token người dùng |

Chủ dự án dán giá trị trực tiếp vào GitHub, không gửi qua chat. Không đọc secret từ Cloudflare. Agent đã mở đúng environment và điền sẵn tên PRODUCTION_META_APP_SECRET; Value còn trống, chưa submit. Ảnh hướng dẫn:tmp/step38/f9/environment-secret-guide.png.

## Còn lại trong F9

Xác minh metadata hai secret sau khi chủ dự án lưu; tạo/lưu capability runner trong đúng environment và Worker theo phạm vi được duyệt; chốt policy có thời hạn, đọc quota mới, chuẩn bị hồ sơ bài thử và kiểm các cổng vẫn đóng. Không có quyền gửi được cấp chỉ từ việc lưu secret. Trước vận hành phải xử lý main/release/workflow khớp nhau theo hồ sơ rollout; không đổi cron hoặc schedule trong lượt hướng dẫn này.

Bằng chứng:github-before.json, github-prepared.json, billing-policy-review.json, local-checks.json/txt và local-checks-sandbox-failure.txt trong tmp/step38/f9.
