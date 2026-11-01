# NTTU fanpage publisher

Hệ thống xuất bản nội dung đã duyệt lên fanpage **Ngành Kinh tế số – NTTU**. Quy trình hiện hành chỉ triển khai production. Staging đã được loại khỏi CI và workflow giám sát trong bản dọn mã ngày 01/11/2026.

## Luồng đang dùng

1. cron-job.org kích hoạt GitHub Actions theo lịch 10:00 giờ Việt Nam.
2. `scripts/production-runner-live.mjs` xác minh workflow/release/policy và chạy giao thức claim → intent → gửi → đối soát → finalize.
3. Worker `src/production/runner-worker.ts` giới hạn các thao tác D1/R2; Node runner thực hiện gọi Meta để tránh giới hạn CPU Worker.
4. Worker `src/production/worker.ts` phục vụ quản lý qua Google và hàng chờ Telegram. Nguồn HTTP xử lý một thông báo mỗi lượt, độc lập với đăng Facebook.
5. Workflow `monitor.yml` giám sát riêng production và xác minh Meta bằng GET.

Repository public chỉ được chạy khi GitHub API xác nhận đúng standard runner, workflow và release. Luồng public không yêu cầu policy ngân sách theo tháng; chuyển private hoặc mất xác minh thì dừng. Ngân sách tài khoản 0 USD/Stop usage giữ nguyên. Quyền gửi theo nội dung/ngày, chống trùng và đối soát vẫn bắt buộc; không tự cấp thêm lịch hoặc đăng bù bài.

## Phát triển và kiểm tra

Dùng Node.js 24 và dependency theo lockfile:

```powershell
npm ci --ignore-scripts
npm run check
npm run check:ci
npm run test:images
npm run test:runner
npm run test:quota
# Chạy đúng các suite cần thiết, vẫn tự dọn fixture/cache:
npm test -- tests/monitor.test.mjs tests/production-operations.test.mjs
```

`check` chạy TypeScript và toàn bộ test local; một số suite cần PDF/logo/ảnh gốc từ bản sao lưu riêng. `check:ci` dùng suite portable trên Windows/Linux. CI Ubuntu bổ sung Workers/D1 local cho production, không triển khai staging và không gửi Facebook/Telegram thật.

CI luôn kiểm tra nội dung repository; chỉ bỏ qua matrix nặng khi toàn bộ thay đổi nằm trong danh sách tài liệu đã duyệt. Đường dẫn lạ, sửa mã/cấu hình, không đọc được diff hoặc chạy thủ công đều chạy đầy đủ. Workflow đăng hằng ngày dùng `npm ci --omit=dev --ignore-scripts`: chỉ cài thư viện runtime `jose`, không cài TypeScript/Wrangler để gửi bài.

Các test vẫn dùng một số fixture cloud cũ để kiểm tra module dùng chung. Đây là kiểm thử offline, không phải yêu cầu duy trì môi trường staging. Không xóa `src/cloud` theo tên thư mục: production vẫn dùng auth, storage, Meta, Telegram và các module rà soát tại đó.

`npm test -- tests/<ten>.test.mjs` thay các script bọc kiểm thử riêng trước đây. Không chạy nhiều tác vụ tạo fixture cùng lúc. Bộ chạy `scripts/run-clean.mjs` dọn tài nguyên tạm mới của lượt chạy; giữ dữ liệu đang dùng, gói phục hồi và bằng chứng nghiệm thu. Xem [AGENTS.md](AGENTS.md).

## Vận hành và tài liệu

- [Runbook kỹ thuật](docs/operations.md).
- [Kết quả rà soát và tối ưu](docs/codebase-audit-2026-11-01.md).
- [Hồ sơ public Actions](docs/public-actions-minute-exemption.md).
- [Lịch sử triển khai bước 1–21](docs/history/implementation-steps-01-21.md): chỉ để tra cứu, không dùng như hướng dẫn vận hành hiện hành. Các đường dẫn trong hồ sơ lịch sử được viết tương đối từ thư mục gốc của dự án.

Các migration đã áp dụng, backup/khôi phục, kiểm tra quyền gửi và xử lý `unknown` là dữ liệu hoặc cơ chế bắt buộc. Không bỏ chúng như mã thừa. Không lưu secret, nguồn private, database hoặc ảnh đã dựng vào Git.
