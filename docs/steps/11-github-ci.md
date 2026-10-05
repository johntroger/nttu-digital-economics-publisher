# Bước 11 — GitHub và kiểm thử tự động

Repository đã tạo: https://github.com/johntroger/nttu-digital-economics-publisher, riêng tư.
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

## Kết quả nghiệm thu 05/10/2026

- Repository riêng tư đã tạo và đẩy nhánh main: https://github.com/johntroger/nttu-digital-economics-publisher.
- Local strict TypeScript và **157/157 Node/SQLite/HTTP** đạt; **9/9 image** đạt.
- **121/121 portable** đạt; CI thật chạy thành công trên Ubuntu và Windows, gồm npm ci,
  TypeScript, test portable và kiểm tra index. Lần chạy xác minh đầu tiên:
  https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37274229044.
- Pre-push hook đã thực sự chạy toàn bộ kiểm thử trước lần push đầu. Gọi Node trực tiếp,
  không ghép lệnh kiểm thử qua shell. Hook cho checkout mới cần cài lại bằng hooks:install.
- Kiểm tra index đạt; không có PDF/logo gốc/ảnh mẫu/database/tmp/backup/private account settings.
  Có ba kiểm thử mới cho file riêng, nhận diện credential và việc kiểm tra index thay vì worktree.
- Byte migration/renderer/sample input trong index trùng file đã ghim checksum local.

Các workflow sau tự chạy theo commit; xem tab Actions để đọc kết quả hiện hành. CI kiểm tra
mã nguồn và core workflow, không thay thế kiểm thử local với tài nguyên thật hoặc fanpage thật.
GitHub không phải nơi chạy scheduler production; ứng dụng vẫn local, các dịch vụ thật chưa nối.

Dừng trước bước 12. Đề xuất: chuẩn bị môi trường staging trên cloud để chạy khi máy tính tắt,
sau đó tích hợp Google/Facebook thử/Telegram theo phạm vi được phê duyệt riêng.
