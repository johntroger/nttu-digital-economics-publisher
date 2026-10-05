# Bước 7 — Năm mẫu nội dung và ba bố cục ảnh

Hoàn tất ngày 05/10/2026 theo phê duyệt bước 7. Dừng trước bước 8.

Điều chỉnh theo yêu cầu người quản lý: caption có một dòng `============` giữa phần thân
và footer, cách mỗi bên một dòng trống. Nội dung footer giữ nguyên; định dạng chuyển
footer-v2 để các checks cũ không được dùng như đã kiểm định định dạng mới.
Đã cập nhật năm caption/manifest, giữ nguyên PNG. Kiểm thử sau sửa: strict và127/127
Node/HTTP đạt;5 ca trình duyệt mẫu đạt, có kiểm tra separator đúng một lần.

## Sản phẩm để người quản lý xem

Mở giao diện local http://127.0.0.1:3789/, chọn **Bài mẫu**. Mỗi mẫu có ảnh,
caption đầy đủ phần kết bắt buộc, trang/mục nguồn và phần do dự án biên soạn.
Có thể mở các mẫu này từ kho bài; các bài khác vẫn hiện đề cương.

| Mẫu | Đối tượng/ngữ cảnh | Đầu ra cho người đọc | Bố cục ảnh |
|---|---|---|---|
| P02 | Sinh viên dùng AI cho bài tập/dự án | Checklist kiểm chứng; tính lại mức tăng 100 → 120 là 20% | Checklist, infographic |
| P04 | Sinh viên chuẩn bị thực tập | Một dòng CV trước/sau và đóng góp cá nhân có sản phẩm minh chứng | Tình huống CV → dự án, ít chữ |
| P05 | Học sinh tìm hiểu ngành | Hiểu kết nối bài toán kinh doanh với dữ liệu/công nghệ | Tình huống cửa hàng–dữ liệu, ít chữ |
| P06 | Sinh viên làm báo cáo dữ liệu | Brief ba dòng: ai xem, quyết định gì, chỉ số nào | Quan hệ/quy trình, infographic |
| P08 | Sinh viên tìm hiểu vận hành thương mại số | Bảng theo dõi đơn giả định và nhận biết việc phối hợp | Tình huống đơn hàng, ít chữ |

Đây là năm bản mẫu đã có caption/PNG, **chưa nhập thành phiên bản ready của kho**.
Kho hiện vẫn gồm 40 đề cương và 0 bài đủ điều kiện đăng. Mẫu đang chờ người quản lý
xác nhận nội dung–ảnh. Chưa sản xuất 35 bài còn lại, gọi Gemini, đăng Facebook hoặc gửi Telegram.

Tệp: `content/samples-2026-v1.json`, `content/samples/v1/Pxx.txt`,
`assets/samples/v1/Pxx.png` và bản nhỏ `Pxx-360.png`.
Manifest ghim hash caption, JSON, ảnh, bản nhỏ, nguồn, logo, font và renderer.
Đường dẫn nguồn không được mở tải công khai qua server local.

## Đối chiếu nguồn và phạm vi xác minh

Đã đọc các trang nguồn liên quan từ PDF gốc: CAREER-08 trang13/15; CAREER-09 trang13;
CAREER-06 trang11/12; CAREER-07 trang5/12; BM03 trang PDF8 (trang in7);
BM11 trang PDF1/2. Đã đối chiếu hình trang BM03 mục1.6 và CAREER-08 mục6 để xác nhận
văn bản trích xuất. Bản tìm kiếm/hình trang ở `tmp/step-07/`.

Mỗi reference ghi phần tuyên bố được hỗ trợ và phần diễn giải/bài tập do dự án phát triển.
Không đánh dấu toàn bộ PDF đã được kiểm chứng. Không dùng bảng lương, tin tuyển,
dự báo tăng trưởng hay các khẳng định tuyệt đối từ cẩm nang. Ví dụ giả định không được
gọi là kết quả thật của sinh viên hoặc doanh nghiệp.

P05 diễn giải mục tiêu đào tạo, không cam kết kết quả việc làm. PDF BM11 còn dòng
khóa2025/04năm và thông tin quyết định để trống; không dùng các dòng đó như xác nhận
mới. Khóa2026 và thời lượng3,5năm dùng đính chính đã được chủ tài khoản xác nhận,
ghi OWNER-2026 riêng. PDF nguồn không bị sửa. BM03/BM11/BM12 đã sao chép vào
assets/sources/program/ và có manifest hash/số trang; BM12 chưa được dùng để tuyên bố
tên học phần trong năm mẫu này.

## Phiếu biên tập năm tiêu chí

Reviewer: Codex, ngày05/10/2026, check_version1. Đây là tự rà soát biên tập local;
chưa phải xác nhận của chủ tài khoản hoặc kiểm định độc lập.

| Mẫu | Nhu cầu đối tượng | Thông điệp/ví dụ | Căn cứ/nhãn giả định | Hành động cho người đọc | Caption–ảnh/footer |
|---|---|---|---|---|---|
| P02 | Đạt: dùng AI trong học tập | Đạt: kiểm chứng trước sử dụng | Đạt trong phạm vi nguồn; phép tính tự biên soạn | Đạt: đánh dấu và kiểm tra một đoạn AI | Đạt local; footer một lần |
| P04 | Đạt: chuẩn bị ứng tuyển | Đạt: công cụ cần bằng chứng | Đạt trong phạm vi nguồn; CV giả định, không bịa số | Đạt: viết lại một dòng CV | Đạt local; footer một lần |
| P05 | Đạt: tìm hiểu ngành | Đạt: kinh doanh kết nối công nghệ | Đạt: mục tiêu CTĐT, đính chính owner, ví dụ giả định | Đạt: chọn bài toán/dữ liệu/công cụ | Đạt local; footer một lần |
| P06 | Đạt: làm dashboard | Đạt: brief trước biểu đồ | Đạt: tư duy bài toán; khung phát triển riêng, không suy luận nhân quả | Đạt: brief ba dòng | Đạt local; footer một lần |
| P08 | Đạt: hiểu việc vận hành | Đạt: phối hợp quanh một đơn hàng | Đạt: nhiệm vụ chung, tình huống giả định; không giả là quy định sàn | Đạt: bảng theo dõi và thử đơn thiếu hàng | Đạt local; footer một lần |

Caption giữ nguyên footer, TikTok đúng địa chỉ và một nhóm hashtag. Tỷ lệ toàn kho
32/8 nội dung và 28/12 đối tượng không thay đổi vì bộ mẫu chỉ là tập con.

## Thiết kế và chỉnh sửa

Philosophy: docs/steps/07-design-philosophy.md. Dải logo trắng cao170px, Trường → Khoa → Ngành,
giữ nguyên màu/tỷ lệ, không thêm dòng tên ngành. Ảnh1080×1080; lề64px; title72px,
body36–43px. Năm palette theo chủ đề. Font Bricolage Grotesque và Work Sans có license OFL
đi kèm trong assets/fonts/. Không tải font hoặc dùng ảnh stock ngoài.

Renderer Pillow dựng hình vector đơn giản rồi xuất PNG ở độ phân giải yêu cầu;
không vẽ lại logo, không sửa các file gốc. Dựng ở2× rồi downsample để đường nét rõ.
Ảnh cuối dưới5MB. Các chữ nhỏ trong logo không được hứa đọc hết ở360px; hình/logo
vẫn nhận diện được. Đã nhìn lại cả năm bản360 và bản1080 đại diện, lược bỏ các chi tiết thừa.

Lỗi/bản sửa ghi nhận:
- Font Instrument Sans thiếu một số glyph tiếng Việt: renderer chặn xuất; thay bằng
  Work Sans và kiểm tra cmap cho mọi chữ được vẽ. Giữ nguyên cỡ chữ thay vì thu nhỏ.
- Kiểm thử độ tương phản ban đầu tính nhãn “Mua” trên màu giấy dù nền thật là trắng:
  sửa metadata nền của từng vùng chữ, kiểm tra trên nền thực. Renderer tự chặn tương phản
  dưới4,5:1; không bỏ ca kiểm thử.
- Chụp modal theo viewport thay cho full-page để hồ sơ điện thoại thể hiện đúng vùng đọc.

## Kiểm thử

- `npm.cmd run check`: TypeScript strict và **125/125 test Node/HTTP đạt**.
- `npm.cmd run test:images`: **9/9 test dựng ảnh đạt**: kích thước, bounding box,
  chữ không đè nhau, ba logo/tỷ lệ/hàng, contrast, tràn title, thiếu glyph/font,
  layout sai, màu khó đọc và tái tạo đúng pixel ảnh đã ghim.
- `node scripts/check-ui-browser.mjs`: **14/14 ca trình duyệt bước6 tiếp tục đạt**.
- `node scripts/check-sample-browser.mjs`: **5/5 ca trình duyệt mẫu đạt**: năm ảnh/caption,
  footer, nguồn/khóa/thời lượng, kho thật vẫn0ready, điện thoại không tràn, tải lỗi và thử lại.
- Kiểm thử thay caption/ảnh/bản360/JSON/PDF/logo/font/renderer đều chặn preview.
  Không sử dụng ảnh cũ như đã đồng bộ khi một đầu vào thay đổi.

Bằng chứng: tmp/step-07/browser-results.json, ảnh desktop/mobile/footer và logs kiểm thử.
Không có lỗi console trong luồng bình thường; một409 do chủ động đưa vào kiểm thử.
Chưa thử ảnh nén sau đăng Facebook, alt text Meta hoặc chất lượng trên mọi trình duyệt.
Không tính các phần chưa chạy là PASS.

Thời gian ghi nhận: mốc đối chiếu nguồn trong JSON04:31UTC, mốc build cuối trong manifest.
Chưa đo riêng thời gian viết/đối chiếu/thiết kế/sửa từ đầu phiên nên không đưa ra số giờ
ước tính hoặc công suất bổ sung. Bước biên tập vận hành cần bổ sung đo riêng từng pha.

## Chạy lại và cổng tiếp theo

`npm.cmd run samples` dựng PNG rồi ghim caption/manifest. Cần Python/Pillow đã có
trong runtime Codex; máy khác đặt SAMPLE_PYTHON. Không cài dependency hoặc tự gọi AI.
`npm.cmd run dev` mở GUI. GUI chỉ xem mẫu, chưa có nút duyệt/sửa/lưu phiên bản.
Source/logo còn local theo .gitignore; không tạo remote GitHub hoặc deploy.

Đề xuất bước8 sau khi chủ tài khoản xem và đồng ý bộ mẫu: lưu/chỉnh sửa/quản lý phiên bản
caption–ảnh và hồ sơ kiểm định trong kho local, với test chặn sử dụng ảnh/checks cũ khi sửa.
Chưa bắt đầu bước8 trong phiên này; tích hợp tài khoản và live là chặng sau.
