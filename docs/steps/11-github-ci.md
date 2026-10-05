# Bước 11 — GitHub và kiểm thử tự động

Repository dự kiến: https://github.com/johntroger/nttu-digital-economics-publisher, riêng tư.
Git local dùng nhánh main, danh tính johntroger và email noreply GitHub. Chỉ cấu hình Git riêng cho dự án; tài khoản đăng nhập qua Git Credential Manager, không ghi token vào file/repository.

CI chạy khi push main, pull request hoặc workflow_dispatch trên Ubuntu và Windows, Node 24.
Checkout/setup-node ghim commit SHA chính thức; quyền contents:read, không deploy, không secrets,
không upload tài liệu hoặc artifacts cá nhân. npm ci --ignore-scripts dùng lockfile; kiểm tra strict
TypeScript, 121 test portable và repository content check. Không gọi Meta/Telegram/AI.

Các suite cần PDF/logo thật (editor/sources/backups/samples/UI) tiếp tục bắt buộc local:
`npm run check`, `npm run test:images`. Pre-push hook chặn tracked changes chưa commit,
kiểm tra index và chạy đầy đủ hai lệnh trên trước khi gửi. CI portable không được diễn giải là
đã kiểm tra ảnh/tài liệu thật hoặc đăng Facebook thật. Không tự thiết lập self-hosted runner.

.gitignore và script check-repository ngăn PDF nguồn, logo gốc, ảnh mẫu đã dựng, tmp/database/
backup, env, private keys, cache và cấu hình tài khoản vào index. Script kiểm tra nội dung index,
phát hiện một số mẫu credential phổ biến và chỉ báo tên file, không in giá trị bí mật.
Đây không phải bảo đảm nhận diện mọi kiểu secret; tài khoản dịch vụ sau này vẫn dùng secret store.

.gitattributes giữ nguyên byte migration SQL, renderer và sample input có checksum trước Git.
Chính sách LF áp dụng code/workflow/hook mới; font có giấy phép OFL kèm theo được quản lý trong Git.
Helper migration workspace riêng không phải mã nguồn ứng dụng và giữ ngoài Git.

Clone mới chưa có PDF/logo/ảnh private nên chỉ chạy `npm run check:ci`; để chạy đầy đủ ứng dụng,
khôi phục file private từ gói backup bước 10. `npm run hooks:install` cài hook cho từng checkout mới.
Hook là kiểm tra local, không phải branch protection trên máy chủ.

Tài liệu chính thức tham khảo: https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs
và https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax.

Trạng thái kiểm thử/push/CI remote được bổ sung sau xác minh. Dừng trước bước 12.
