# Bước 6 — Giao diện quản lý local

Hoàn tất ngày 05/10/2026 theo phê duyệt bước 6. Dừng trước bước 7.

## Kết quả

- Tổng quan kho 40 đề cương, 0 bài đủ điều kiện, lịch chưa bật, giờ dự kiến 10:00 Việt Nam.
- Kho bài: tìm kiếm, lọc chủ đề/đối tượng/loại kho; chi tiết đề cương, hướng ảnh,
  nguồn cần đối chiếu, điều kiện chưa đạt và phần kết bắt buộc.
- Lịch, lịch sử, cảnh báo: kho thật có trạng thái trống; sau mô phỏng có thể xem kết quả
  trong ngữ cảnh riêng và quay về kho thật. Thông báo chưa giao Telegram.
- Ba mô phỏng: thành công, ba lần lỗi rồi lấy dự phòng, timeout chờ đối chiếu.
- Ba logo gốc, chữ tiếng Việt, bố cục desktop/tablet/mobile, focus bàn phím và dialog.

## Kiểm thử và bằng chứng

`npm.cmd run check`: TypeScript strict đạt; **120/120 test đạt**, 0 lỗi, 0 bỏ qua.
Trong đó bốn test HTTP mới kiểm tra allowlist và headers; kho nháp thật;
demo độc lập khi chạy lặp; origin/opt-in/JSON/kích thước đầu vào và chặn API đăng thật.

`node scripts/check-ui-browser.mjs`: **14 ca nghiệm thu đạt** trên Chrome headless,
dùng Playwright Node đã có trong runtime Codex (Python runtime không có Playwright).
Đã kiểm tra lọc kết hợp, tìm/xóa lọc, trạng thái trống, bàn phím/Enter/Escape/focus,
footer TikTok và hashtag, logo tải được, ba mô phỏng và chạy lặp không cộng dồn,
ngữ cảnh lịch sử/cảnh báo, tải lỗi 503 và thử lại, dữ liệu HTML chỉ hiển thị như văn bản.
Không có lỗi console ở luồng bình thường; hai lỗi 503 do chủ động đưa vào kiểm thử.

Bằng chứng: `tmp/step-06/browser-results.json` và các ảnh chụp trong cùng thư mục.
Đã xem ảnh tổng quan desktop/mobile và chi tiết mobile; chữ/logo không bị kéo méo,
không tràn toàn trang ở 390/768px. Bảng kho cuộn ngang trong vùng bảng trên màn hình nhỏ.
Dialog chụp theo viewport; trang nền bị khóa tương tác. Không coi kiểm tra này là
nghiệm thu đầy đủ với screen reader hoặc tất cả trình duyệt.

Hai điều chỉnh trong quá trình kiểm thử: so sánh kho bỏ timestamp kiểm tra thay đổi
theo thời gian; kiểm tra Host dùng HTTP native vì fetch chuẩn hóa header trên Node này.
Đây là sửa công cụ kiểm thử, không bỏ kiểm tra tính độc lập hoặc giới hạn truy cập.

## Chạy và kiến trúc

`npm.cmd run dev`, mở http://127.0.0.1:3789/. Server chỉ bind loopback.
`scripts/ui-handler.mjs` phục vụ tệp theo allowlist và API local;
`scripts/ui-model.mjs` đọc JSON kho qua bộ import/catalog SQLite, lấy readiness từ eligibility.
Kho chỉ đọc, không sửa tệp hoặc ghi DB sau thao tác giao diện.
Demo dùng helper fixture bước 5 và SQLite mới cho mỗi lần chạy; kết quả ở bộ nhớ trang,
không khôi phục sau reload. Không dùng clock thật cho lịch demo.

Worker cloud không được thêm endpoint UI/mutation này. Production chưa triển khai.
Không có OAuth/Google, Meta, Telegram, cron cloud, GitHub hoặc deploy trong bước 6.
“Chỉ dành cho người quản lý” mô tả phạm vi sử dụng; chưa phải kiểm soát đăng nhập.
Không đưa server local này ra Internet. Giao diện chưa có sửa bài hoặc tạo ảnh.

## Bước tiếp theo cần phê duyệt

Đề xuất bước 7: biên tập năm mẫu P02/P04/P05/P06/P08 dựa trên nguồn,
ba bố cục ảnh 1080 × 1080 có ba logo, preview và kiểm định local trước sản xuất đủ kho.
Trình mẫu và kết quả kiểm thử cho chủ tài khoản; chưa kết nối hoặc đăng fanpage thật.
