# F10 — đồng bộ main với production ở trạng thái đóng

Chủ dự án phê duyệt ngày 11/10/2026. Hợp nhất main269b0d11 với release F7 đã nghiệm thu9ce88cc7; giữ ba commit giám sát trên main. Xung đột scripts/monitor.mjs chỉ do CRLF/LF: diff bỏ qua ký tự cuối dòng trống cho cả monitor.mjs, monitor.test.mjs và monitor.yml. Giữ nội dung nhánh F7, merge không force push và không bỏ lịch sử main.

Mã src và workflow không đổi so với9ce88cc7. Bằng chứng CPU F7 thuộc release/version cũ, không gọi đó là đo CPU mới. Local TypeScript,471 kiểm thử portable và kiểm tra repository465 tệp đã đạt trước bổ sung dưới đây. Dữ liệu tạm/cache được bộ run-clean dọn; giữ các bản sao lưu và hồ sơ nghiệm thu thật.

Rà soát phát hiện monitor cũ chỉ hiểu schema13–14, trong khi production dùng16. F10 bổ sung schema15/16, vẫn từ chối schema lạ. Với16, httpPublisher chỉ báo có credential; ba cổng deployment/database/owner approval phải false, engine phải runner, bộ gates phải đủ và đúng kiểu. Schema14/15 giữ yêu cầu mọi gate false. Không bỏ cảnh báo Meta khi node_required mà chưa được xác minh. Hai regression mới kiểm cổng mở/thiếu/lạ, sai engine, unknown và ngân sách truy vấn.

Preflight GitHub: main269b0d11; STAGING_DEPLOY_ENABLED=true; PRODUCTION_ACTIONS_ENABLED=false; PRODUCTION_RUNNER_RELEASE9ce88cc7. Trước cập nhật main phải tạm tắt deploy staging và trả lại giá trị trước đó sau CI. Không tắt lịch staging Tập Viết, không thay cron giám sát. Workflow production vẫn manual-only, main/SHA/environment có kiểm tra và gate false.

Policy tháng2026-10 hiện chỉ được owner xác nhận cho9ce88cc7. SHA mới phải được owner xác nhận cụ thể trước thay policy. Giữ expiry01/11/2026 00:00UTC, reserve600 phút, budget0USD/Stop usage; không tự gia hạn. Việc lưu Meta secrets chưa chứng minh token đúng Page hoặc hạn dùng. Không gửi Facebook/Telegram, không bật runner/daily/legacy/Actions, không tạo permit hay lịch trong F10.

Hồ sơ đang thực hiện:tmp/step38/f10/github-before.json và billing-dispatch.json. CI/PR và readback release cuối sẽ được bổ sung sau khi đạt kiểm tra. F10 chưa nghiệm thu chỉ từ kết quả local.
