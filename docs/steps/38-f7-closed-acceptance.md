# F7 — nghiệm thu đóng, đang thực hiện

Người quản lý phê duyệt F7 ngày 10/10/2026 theo phạm vi `tmp/step38/f6/f7-review.md`. Nhánh riêng: `codex/step38-f7-closed-acceptance`. Chưa merge main, triển khai production, thay cron, sao chép Meta credential, đăng Facebook hoặc gửi Telegram.

## Trạng thái hiện tại, thay thế các số liệu sơ bộ bên dưới

Smokecloud đầu tiên phát hiện lỗi deploy100328: góiFree không cho đặt thuộc tínhCPUlimits, kể cả10ms. Đã bỏ `limits.cpu_ms` khỏi proposalrunner và cloneconfig; dùng giới hạn10ms mặc định củaFree, có regression chặn thuộc tính này. Lượt đầu chưa cóWorkerinvocation hoặcCPUevidence. Sau refreshOAuth, GETWorker/D1/R2 của clone đều404, xác minh dọn hoàn toàn lúc10:13:03Z. Bộ dọn chấp nhận DELETE404 và đọc lại OAuth sau từng lần Wrangler refresh để tránh báo lỗi giả hoặc dùng credential cũ. Cần exactHEADCI mới rồi thử lại; ledger vẫn tính lượt thất bại, không hoàn lại.

Token billing đã hoạt động: run38042280947 ngày10/10/2026 lúc09:41:39Z. Usage toàn tài khoản có16rows productactions, unitMinutes, SKUActions Linux/Windows; adapter đã sửa và có regression. Tổng dự phòng bảo thủ1.116/2.000phút, phínet0USD; còn884phút trước các lượt CI tiếp theo và độ trễ usage. API usage không chứng minh Stop usage. Giữ nguyên budgetTTL24h; chưa tự làm mới hoặc nới hạn.

Dự toán22ngày: monitor mỗi30phút+2fallback/ngày cần1.100phút, runner110phút, CI300phút, tổng1.510 vượt884. Mỗi60phút cũng vượt với tổng982. Đề xuất rollout: monitor GitHub mỗi6giờ+2fallback/ngày, watchdogHTTP trực tiếp, tổng542phút và biên342phút trước usage mới. Không đổi lịch thực tế trong F7.

Kiểm thử native mới biên dịch entrypoint `runner-worker.ts` qua harness privateF7, giữ đồng hồ server thực. Harness chỉ rebase origin trong clone, vẫn chạy guard/whitelist thật; overhead wrapper phải tính vào mẫuCPU. Test dùng workerd/D1/R2 và providerlocalhost, chặn mọi outbound củaWorker. Một mockpost confirmed, stock39(29main/10reserve), heartbeat/watchdog đạt; không gửi lặp; generation thay đổi chặn finalize stock cũ; crash sauintent giữ needs_reconciliation và lần kế tiếp unknown, khôngPOSTlại; giữ đủ40warehouseposts. Không dùng native timing để kết luận CPUcloud.

Preflight Cloudflare09:57:36Z: quyền đọc R2 đạt, D1toàn tài khoản734.967rowsRead/10.585rowsWritten. Receipt phải làm mới trước mỗi lượt cloud. `production-f7-cloud-smoke.mjs` yêu cầu exactHEADCI, cloneWorker/D1/R2 riêng, CPUlimit10ms, capability chỉ trong memory, seed test với ngày thực và image checksum từ backup. Tối đa2smokecycles/ngày bằng ledger không hoàn lại; finally tự xóa ảnh, Worker, bucket, D1 và ghi lỗi cleanup nếu có. Chưa chạy smokecloud; chưa đo cold/warmCPU hoặc nghiệm thu F7.

TypeScript và fulltests500/500 đạt; kiểm thử native F7 đạt. CI Linux được bổ sung nativeF7. Artifact native đã lưu `tmp/step38/f7/native-results.json`; báo cáo thật luôn realMetaPosts0/realTelegramMessages0/cloudCPUAcceptedfalse. Bản cấu hình đóng trước đó và bằng chứng F5 được giữ; F5 không thay thế nghiệm thuCPU F7.

Việc còn lại: exactHEADCI mới, smoke/CPUclone đủcoldwarm, ownerUI/pause/dualengine/rollbackclone, chính sách ngân sách vận hành dài ngày. F7 chưa hoàn tất và production vẫn đóng.

## Lịch sử kiểm tra sơ bộ

## Quota và vận hành đã đọc

GitHub UI lúc khoảng 16:12 giờ Việt Nam: tài khoản johntroger dùng GitHub Free; Actions account budget $0, Stop usage Yes; 968,7/2.000 phút đã sử dụng, 0 GB/0,5 GB storage, billable spend $0. Đây là quan sát UI, không phải receipt có thể tự làm mới bằng API. Credential Git hiện có xác thực đúng johntroger nhưng GET billing usage trả404. Đã hướng dẫn tạo token Account permission Plan: Read-only, lưu repository Secret `PRODUCTION_BILLING_READ_TOKEN`; đang chờ người quản lý hoàn tất. Không gửi token qua chat.

Cloudflare OAuth hiện có được làm mới bằng whoami, không mở rộng scope. Analytics D1 toàn tài khoản ngày UTC10/10 lúc09:15:06Z:733.599 rowsRead/10.567 rowsWritten; analytics có độ trễ. Receipt này chỉ dùng kiểm tra trước, phải đọc lại ngay trước đo tải, không dùng receipt cũ để tạo clone.

Đọc log monitor có sẵn run38039843708: staging issues[]; production issues[heartbeat,meta]; notificationFailed=false. Không kích hoạt workflow hoặc thông báo mới. Timing API cho10run gần nhất báo total_ms0 dù job thực tế có thời gian bắt đầu/kết thúc; không được coi0 này là chi phí monitor0. Cần billing usage đủ quyền để đối chiếu.

## Dự toán thận trọng, chưa phải quyền vận hành

Giữ22ngày dự phòng tới reset, còn floor(2.000−968,7)=1.031phút. Với giả định mỗi lượt monitor dự phòng tối thiểu1phút, cron hiện tại48lượt/ngày và2backup/ngày cần1.100phút. Runner1lượt/ngày, timeout5phút cần110phút; CI dự phòng300phút. Tổng1.510phút, thiếu479phút, chưa tính repo khác. Đây là dự toán bảo thủ, chưa phải số phút monitor đo được từ billing.

Phương án miễn phí để xem xét khi rollout: monitor GitHub mỗi60phút+2backup/ngày, watchdog HTTP trực tiếp theo lịch riêng không cần GitHub runner. Dự toán982phút, chỉ còn49phút trong tháng hiện tại trước usage repo khác, nên chưa đủ biên an toàn để chấp thuận. Không đổi lịch đang chạy trong F7. Cần đo usage và điều chỉnh tần suất trong cấu hình đề xuất trước rollout, không mua thêm quota.

Hạn24h của policy F6 vẫn giữ nguyên; chưa nới hạn hoặc tự làm mới verifiedAt. REST budget hiện được tài liệu hóa cho tổ chức, không được giả định có API budget account cá nhân. Cần chốt cơ chế xác minh budget dài ngày và fresh account usage; không dùng UI receipt cũ hay netAmount0 để chứng minh Stop usage liên tục.

## Chuẩn bị cấu hình đóng

`scripts/production-f7-prepare.mjs` tạo artifact review cục bộ: runner và management giữ đúng tài nguyên production, ba cổng Actions/runner/legacy đóng, crons rỗng. Copy đúng byte UI và WorkSans Regular/Bold/OFL vào assets, lưu SHA256. Giữ OAuth Client ID và thiết lập Telegram; không đọc/copy secret. Chặn output vào cấu hình quản lý hiện có hoặc parent bị junction chuyển hướng.

`scripts/production-f7-forecast.mjs` tính dự phòng monitor/runner/CI/repo khác; kết quả luôn activationApproved=false. Không gọi dịch vụ ngoài.

Kiểm thử riêng F7:4/4 đạt; TypeScript và full suite500/500 đạt. Lượt đầu sandbox không cho tạo junction, lượt chạy được cấp quyền đã kiểm tra thực tế guard và đạt. Bộ run-clean dọn fixture/cache cả lượt thất bại và thành công. Chưa có CI cloud cho nhánh F7.

Metadata GitHub xác nhận Secret `PRODUCTION_BILLING_READ_TOKEN` đã được lưu lúc09:17:58Z ngày10/10. Chưa chứng minh quyền đọc billing thực tế. Thêm chế độ manual `f7_billing_read` vào workflow CI hiện có để đọc Secret ngay trong Actions, chỉ trên nhánh F7; không trích secret ra máy, không có transport Worker/Meta/Telegram. Kết quả chỉ gồm tổng quota và ngày, không chứa tên repo khác hoặc token; luôn budgetVerifiedByAPI=false và activationApproved=false. Chế độ này bỏ qua test/deploy jobs; PR CI bình thường vẫn chạy khi input false hoặc không có input.

## Còn phải hoàn thành trước nghiệm thu

1. Xác minh billing read token hoạt động mà không xuất secret; đo usage đủ quyền và dự phòng đủ biên, giải quyết policy24h.
2. Kiểm bundle cuối trên clone riêng Worker/D1/R2 sau exact-HEAD CI; đủ cold/warm và tất cảphase mới. Chưa tạo clone, chưa đo CPU F7; không lấy evidenceF5 thay thế.
3. Kiểm UI/pause/snapshot/dualengine/crash/unknown/rollback trên clone; lọc evidence và dọn clone/capability.

F7 chưa nghiệm thu, chưa đủ điều kiện rollout.

## Token billing đã kết nối, nhưng báo cáo chưa đủ dữ liệu

Ngày10/10/2026 lúc09:24:03Z, workflow chỉ đọc38041242521 chạy thành công bằng Secret mới; chứng minh API chấp nhận token. Receipt chưa có row product Actions, trong khi UI account ghi968,7phút. Không được coi báo cáo này là đã dùng0phút hoặc quota toàn phần. Bộ đọc F7 được sửa để quotaUsable=false, số phút=null khi thiếu Actions; gate runner cũng trảusage_unavailable. Giữ policy24h, không cấp quyền claim/send. Kiểm thử regression14/14F6 và4/4F7 đạt. Cần đối chiếu schema/report/độ trễ trước khi nghiệm thu quota.

Draft PR17 được tạo trên baseF6, không merge: https://github.com/johntroger/nttu-digital-economics-publisher/pull/17 .

Lượt09:29:39Z đọc16usageItems với product `actions`. Chênh lệch trước đó là lỗi adapter nhận diện chữ hoa/chữ thường, không phải API không có dữ liệu. Đối chiếu [GitHub Product/SKU identifiers](https://docs.github.com/en/billing/reference/product-and-sku-names), bổ sung chính xác `actions` và `actions_linux/actions_windows/actions_macos`, giữ hỗ trợ displaylabel cũ. Không chấp nhận runner nâng cao, SKU/unit không biết, netAmount>0, báo cáo trống hoặc thiếu Actions; không tự nới budgetTTL. Cần đọc lại quota sau sửa adapter.

Lượt09:37xác minh schema thực tế:16rows, productactions, SKUActions Linux/Actions Windows, unitTypeMinutes, quantitynumber. Thêm đúng aliasMinutes đã quan sát (vẫn giữminutes từ tài liệu), không chấp nhận giờ/byte hoặc unit khác. Regression gồm cả định dạng thực tế này; diagnostic chỉ in tên trường/product/SKU/unit, không giá trị token, caption hoặc tên repo.

Nguồn kỹ thuật đã đối chiếu: [GitHub billing usage](https://docs.github.com/en/rest/billing/usage), [GitHub budgets](https://docs.github.com/en/rest/billing/budgets), [budget và Stop usage](https://docs.github.com/en/billing/how-tos/set-up-budgets), [Cloudflare D1 analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/).
