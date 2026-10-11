# F10 — đồng bộ main với production ở trạng thái đóng

Chủ dự án phê duyệt ngày 11/10/2026. Hợp nhất main269b0d11 với release F7 đã nghiệm thu9ce88cc7; giữ ba commit giám sát trên main. Xung đột scripts/monitor.mjs chỉ do CRLF/LF: diff bỏ qua ký tự cuối dòng trống cho cả monitor.mjs, monitor.test.mjs và monitor.yml. Giữ nội dung nhánh F7, merge không force push và không bỏ lịch sử main.

Mã src và workflow không đổi so với9ce88cc7. Bằng chứng CPU F7 thuộc release/version cũ, không gọi đó là đo CPU mới. Local TypeScript,471 kiểm thử portable và kiểm tra repository465 tệp đã đạt trước bổ sung dưới đây. Dữ liệu tạm/cache được bộ run-clean dọn; giữ các bản sao lưu và hồ sơ nghiệm thu thật.

Rà soát phát hiện monitor cũ chỉ hiểu schema13–14, trong khi production dùng16. F10 bổ sung schema15/16, vẫn từ chối schema lạ. Với16, httpPublisher chỉ báo có credential; ba cổng deployment/database/owner approval phải false, engine phải runner, bộ gates phải đủ và đúng kiểu. Schema14/15 giữ yêu cầu mọi gate false. Không bỏ cảnh báo Meta khi node_required mà chưa được xác minh. Hai regression mới kiểm cổng mở/thiếu/lạ, sai engine, unknown và ngân sách truy vấn.

Preflight GitHub: main269b0d11; STAGING_DEPLOY_ENABLED=true; PRODUCTION_ACTIONS_ENABLED=false; PRODUCTION_RUNNER_RELEASE9ce88cc7. Trước cập nhật main phải tạm tắt deploy staging và trả lại giá trị trước đó sau CI. Không tắt lịch staging Tập Viết, không thay cron giám sát. Workflow production vẫn manual-only, main/SHA/environment có kiểm tra và gate false.

Policy tháng2026-10 hiện chỉ được owner xác nhận cho9ce88cc7. SHA mới phải được owner xác nhận cụ thể trước thay policy. Giữ expiry01/11/2026 00:00UTC, reserve600 phút, budget0USD/Stop usage; không tự gia hạn. Việc lưu Meta secrets chưa chứng minh token đúng Page hoặc hạn dùng. Không gửi Facebook/Telegram, không bật runner/daily/legacy/Actions, không tạo permit hay lịch trong F10.

Hồ sơ đang thực hiện:tmp/step38/f10/github-before.json và billing-dispatch.json. CI/PR và readback release cuối sẽ được bổ sung sau khi đạt kiểm tra. F10 chưa nghiệm thu chỉ từ kết quả local.


## Cập nhật 11/10/2026 — F10 đồng bộ release đóng đã hoàn tất

Main, hai Worker production/runner, PRODUCTION_RUNNER_RELEASE và policy tháng UTC2026-10 cùng SHA cd2dd2196d035e3c7e83e1d8959d8773ec2219a0. PR18 đã hợp nhất fast-forward, không bỏ ba commit giám sát. CI PR38109803715 và main38110139785 đều đạt Windows/Linux; pre-push full local tests và13 kiểm tra ảnh đạt. Monitor bổ sung schema15/16 và phân biệt credential có sẵn với cổng gửi mở;28 regression đạt. Source Worker/UI/migration không đổi so với runtime9ce88cc7 đã nghiệm thu CPU, không coi là phép đo CPU mới.

STAGING_DEPLOY_ENABLED tạm false khi main CI chạy, deploy-staging skipped, đã trả true; không đổi lịch Tập Viết hoặc cron giám sát. Hai Worker không cron, mọi cổng production false; schema16/40 bài/56 tệp/0 permit/job/attempt/publication, enabled0/paused1. Runner/status trả503 do gate đóng. Environment chỉ main, ba secret có metadata; không đọc giá trị. Policy đã được owner xác nhận riêng cho F10, giữ budget0USD/Stop usage/reserve600/expiry07:00 Việt Nam01/11/2026, không tự gia hạn.

Hồ sơ: docs/steps/38-f10-closed-promotion.md và tmp/step38/f10/acceptance.json, rollout.json, main-promoted.json, github-readback.json, owner-policy-confirmation.json. File tạm/cache của từng lượt được run-clean dọn; backup thật/bằng chứng giữ lại. Hồ sơ kết thúc và helper quản trị dùng tên job hiển thị đã sửa được giữ local, không push thêm commit sau SHA owner đã xác nhận. Không gửi Facebook/Telegram bằng công cụ F10, không bật lịch hoặc cấp permit. Giám sát đã có vẫn hoạt động theo cấu hình trước; cần rà nhịp chạy theo ngân sách còn lại trước vận hành chính thức.

F11 đề xuất: chốt nhịp giám sát phù hợp Free và xác minh Meta chỉ đọc từ Node, đối chiếu Page817593604765443/phạm vi/hạn token/hồ sơP01. Cần duyệt bước mới; chưa đăng bài thật hoặc bật lịch10:00.
