# NTTU fanpage publisher

Bước1–7: backend TypeScript, kho đề cương, claim/intent/evidence/finalizer,
điều phối lịch/retry/reserve/queue giả lập, GUI và năm bản mẫu caption/ảnh.
Bước7 đã kiểm thử; chờ người quản lý xem mẫu và phê duyệt bước8.
Kế hoạch hiện hành: `KE-HOACH-TONG-THE.md` v4.3. Chỉ triển khai từng bước sau phê duyệt của chủ tài khoản.

## Chạy local

Node.js 24, sau cài dev dependencies:

```powershell
npm.cmd run check
npm.cmd run dev
npm.cmd run catalog
npm.cmd run simulate
npm.cmd run samples
npm.cmd run test:images
# Lưu kho kiểm tra local dưới tmp/ và chạy lại không nhân bản:
npm.cmd run catalog -- --database tmp/step-02/catalog.sqlite
```

Giao diện: `http://127.0.0.1:3789/`; liveness: `/health`. Server chỉ bind loopback.
GUI xem kho, chi tiết, lịch, lịch sử, cảnh báo và ba tình huống mô phỏng riêng biệt.
Mỗi mô phỏng dùng SQLite in-memory mới; tải lại trang mất kết quả mô phỏng.
Mục Bài mẫu xem năm caption và PNG hoàn chỉnh trong phạm vi mẫu local, đang chờ owner.
Caption nối phần thân với footer bằng một dòng `============`, cách mỗi bên một dòng trống.
Chưa có biên tập qua GUI, nhập/promote mẫu vào ready, OAuth, cron cloud,
adapter Meta/Telegram thật hoặc deploy.
HTTP mutation chỉ có `/local-api/demo` với kiểm tra origin và dữ liệu giả lập;
API đăng thật chưa triển khai trả501.
Health không xác nhận database/scheduler/quyền Meta. Không đăng bài hoặc gọi dịch vụ ngoài.

## Kiểm thử và giới hạn

`tests/schema.test.mjs` dùng SQLite in-memory thật qua `node:sqlite`; không mô phỏng SQL bằng object.
SQL hướng tới D1 nhưng chưa nghiệm thu trên runtime D1. Không dùng `node:sqlite` trong Worker.
`src/` được TypeScript strict kiểm tra; test runner và server local dùng Node.js.
Adapter local áp dụng migrations một lần, kiểm tra checksum bằng schema_migrations;
migration cloud/D1 setup là bước sau. Lệnh catalog mặc định dùng in-memory,
chỉ chấp nhận đường dẫn lưu dưới tmp/ và từ chối database đã có page connection.

Schema0001 là nền dữ liệu xuất bản; 0002 thêm nguồn/facts/checks/import và ảnh gắn phiên bản.
Trigger giữ job/evidence/publication không bị ghi đè. Eligibility và chọn dự phòng đã có;
0003 thêm snapshot claim/audit/maintenance generation. Claim/ownership/intent đã có trên SQLite local;
0004 thêm incidents/proof ngày publication; 0005 thêm simulation/schedule/stock alert.
Intake/finalizer/outbox và workflow tick đã xây local. Fake publisher chỉ nhận đích fixture:.
Export backup thật và cloud chưa xây. D1 cần adapter và nghiệm thu giao dịch riêng.

Kho hiện là 40 đề cương, **0 bài đủ điều kiện đăng**. Nguồn gợi ý chưa được kiểm định,
chưa có caption/PNG/QA sản xuất cho cả kho; năm mẫu riêng chưa được promote ready.
Không gọi AI hoặc tự sinh thêm bài.
Chi tiết và giới hạn: docs/steps/02-content-catalog.md, docs/steps/03-claims-intent.md,
docs/steps/04-evidence-finalization.md, docs/steps/05-local-workflow.md và docs/steps/06-local-ui.md.
Bộ kiểm thử có125 test Node/HTTP đạt,9 test dựng ảnh và14+5 ca trình duyệt;
ready/ảnh/outcome là fixture, không phải bài hoặc Meta thật. Outbox pending, chưa gửi Telegram.
Lệnh simulate dùng helper fixture/in-memory và clock kiểm soát; không dùng 40 brief thật hoặc gọi mạng.

Kiểm thử trình duyệt: chạy server local trước, rồi `node scripts/check-ui-browser.mjs`.
Script dùng Playwright Node đi kèm Codex và Chrome headless đã cài trên máy;
không thêm dependency dự án. Có thể đặt UI_NODE_BUNDLE (đường dẫn package.json của runtime),
UI_BROWSER_PATH và UI_BASE_URL cho máy khác. Bằng chứng lưu trong `tmp/step-06/`.

Mẫu nội dung/ảnh: docs/steps/07-content-samples.md. `npm.cmd run samples` dùng Python/Pillow
đi kèm Codex để dựng ảnh, kiểm tra glyph/tràn/contrast rồi ghim caption/ảnh/nguồn/font/logo.
Máy khác đặt SAMPLE_PYTHON tới Python có Pillow. Chưa nối renderer vào cron.
Sau sửa input cần dựng/kiểm thử lại; preview từ chối artifacts không khớp.
`node scripts/check-sample-browser.mjs` kiểm thử mục Bài mẫu; bằng chứng ở tmp/step-07/.

Mọi môi trường trong migration bắt đầu paused. Fake configuration chỉ local.
Không có token/password trong mã nguồn hoặc dữ liệu mẫu. Đăng trực tiếp Facebook độc lập
với slot/usage của hệ thống; ứng dụng chưa đọc fanpage ở bước này.

## Bước 8: biên tập local và phiên bản

Đã hoàn tất theo phê duyệt: kho SQLite bền vững, năm mẫu nhập một lần vào kho 40 bài,
chỉnh sửa/lưu bản mới, dựng ảnh, rà soát local và khôi phục caption.
Vào **Kho bài → Chỉnh sửa**. Caption ghép `============` và footer tự động.
Dữ liệu: `tmp/step-08/warehouse.sqlite` và `tmp/step-08/assets`; giữ cả hai thư mục,
không xóa như cache. Chưa có backup/export hoặc dịch vụ cloud.
Báo cáo: `docs/steps/08-local-editor.md`. Kiểm thử editor: `node scripts/check-editor-browser.mjs`.
135 kiểm thử mã nguồn, 27 ca trình duyệt và 9 kiểm thử ảnh đạt. Dừng chờ phê duyệt bước tiếp theo.

## Bước 9: nguồn theo trang và kiểm định kho

Trong **Kho bài → Chỉnh sửa**, thêm căn cứ nguồn (tài liệu, trang PDF, mục, nhận định và cách
áp dụng), rồi lưu bản mới. Có thể mở PDF tại trang tham chiếu và kiểm tra bản đã lưu.
**Kho bài → Kiểm tra toàn kho** nêu các việc còn thiếu của từng bài. Cần người quản lý đọc
nguồn và xem ảnh trước khi ghi nhận rà soát. Chưa bật lịch đăng hoặc đánh dấu sẵn sàng.
Thư viện gồm 13 PDF + xác nhận chương trình khóa 2026/3,5 năm. Nguồn thay đổi, trang sai
và caption trùng nguyên văn bị chặn. Bản nhập được giữ khi lỗi.
Báo cáo: `docs/steps/09-source-review.md`. Kiểm thử: `node scripts/check-sources-browser.mjs`.
145 kiểm thử mã nguồn, 35 ca trình duyệt, 9 kiểm thử ảnh đạt. Bước tiếp theo cần phê duyệt.

## Bước 10: sao lưu và khôi phục local

Mục **Sao lưu** tạo gói thư mục, kiểm tra SHA-256/SQLite/schema và khôi phục vào kho riêng.
Gói nằm tại `tmp/step-10/backups/backup-ID`; chép nguyên thư mục sang ổ khác để giữ riêng.
Khôi phục không thay kho gốc, mọi bài quarantined và lịch dừng. Lệnh mở kho phục hồi:
`node scripts/open-restored.mjs restored-ID` → `http://127.0.0.1:3790/`.
Gói gồm database, tất cả ảnh tham chiếu, PDF/manifest nguồn, logo/font/license/renderer và
content/mẫu; vẫn cần mã nguồn ứng dụng để mở. Local chưa mã hóa, chưa có cron/cloud.
`node scripts/check-backups-browser.mjs` dùng kho kiểm thử riêng.
154 kiểm thử mã nguồn, 42 ca trình duyệt, 9 kiểm thử ảnh đạt. Báo cáo: `docs/steps/10-local-backups.md`.

## Bước 11: Git và CI

Repository riêng tư dự kiến: `johntroger/nttu-digital-economics-publisher`. Node 24 (`.nvmrc`).
`npm run check:ci` chạy TypeScript, kiểm thử portable và kiểm tra nội dung index.
CI GitHub chạy trên Windows/Ubuntu; PDF/logo gốc, ảnh đã dựng, database và backup giữ ngoài Git.
Trước push vẫn chạy đầy đủ `npm run check` và `npm run test:images` qua `.githooks/pre-push`.
Checkout mới cài hook bằng `npm run hooks:install`; cần lấy lại tài nguyên private từ backup để
chạy đầy đủ ứng dụng. GitHub quản lý mã nguồn; ứng dụng hiện vẫn chạy local.
Chi tiết: `docs/steps/11-github-ci.md`.
