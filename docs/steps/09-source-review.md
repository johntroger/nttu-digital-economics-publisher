# Bước 9 — Căn cứ nguồn và kiểm định kho local

Hoàn tất 05/10/2026 theo phê duyệt bước 9. Dừng trước bước 10.

## Kết quả

Trong **Kho bài → Chỉnh sửa**, có thể thêm/thay/xóa căn cứ: tài liệu, trang PDF từ 1, tên mục, nhận định được hỗ trợ và cách diễn giải/giới hạn áp dụng. Mỗi lần lưu nguồn và caption tạo một phiên bản mới; nguồn của phiên bản cũ giữ nguyên. Sửa nguồn cũng cần dựng ảnh và rà soát lại theo bước 8.

Thư viện gồm 13 PDF người dùng cung cấp và một xác nhận khóa 2026/đào tạo 3,5 năm. PDF mở ở tab local tại trang tham chiếu. API không nhận đường dẫn file tùy ý, không trả đường dẫn máy tính. Xác nhận người quản lý không có trang PDF. Trang thiếu, trùng, phân số, ngoài giới hạn hoặc ID tài liệu không hợp lệ bị từ chối trước giao dịch lưu; giữ bản đang nhập.

**Kiểm tra bản đã lưu** và **Kiểm tra toàn kho** kiểm tra các điều kiện: caption đã lưu, nguồn có căn cứ theo trang và checksum còn khớp, ghi chú đối chiếu, ảnh khớp phiên bản, caption trùng nguyên văn với bài khác đang hoạt động hoặc lịch sử đăng. Kết quả toàn kho nêu việc cần xử lý cho từng mã bài; bấm mã bài để mở biên tập.

Bài giới thiệu ngành cần ít nhất một nguồn BM03/BM11/BM12 và xác nhận OWNER-2026. Giữ chính sách người dùng: khóa 2026, 3,5 năm; không lấy thời lượng/khóa mâu thuẫn trong PDF thay cho xác nhận này.

Năm mẫu đã nhập được giữ nguyên. 35 đề cương còn lại đã có đầy đủ luồng nhập căn cứ, dựng ảnh và ghi nhận rà soát local; bước này không tự viết thêm 35 bài hoặc tự gắn nguồn chưa đối chiếu. Bài đã rà soát vẫn `needs_review`, chưa được bật đăng tự động.

Kho đã nhập mở lại từ SQLite độc lập với file mẫu gốc. Nếu tài liệu bị thiếu/thay đổi, giao diện kho vẫn hoạt động để chỉ rõ lỗi nguồn; PDF liên quan, lưu căn cứ mới và ghi nhận rà soát bị chặn. Lần nhập đầu vẫn kiểm tra toàn bộ artifacts nguồn/mẫu.

## Kiểm thử

- TypeScript strict + **145/145 Node/SQLite/HTTP** đạt, gồm 10 ca mới về thư viện, giới hạn trang, nguồn thay đổi/thiếu, đường dẫn thoát thư viện, lưu nguyên tử, bảo toàn phiên bản, kiểm định 40 bài, nguồn chương trình, trùng caption và HTTP allowlist/origin.
- **8/8 source browser**: kiểm tra toàn kho, 14 lựa chọn nguồn, mở PDF đúng tab/trang, giữ bản nhập khi trang sai, lưu qua restart, biên tập một đề cương có nguồn → dựng ảnh → ghi nhận local, xóa căn cứ, xác nhận chương trình và mobile.
- **8/8 editor + 14/14 UI + 5/5 sample browser** tiếp tục đạt; tổng **35 ca trình duyệt**.
- **9/9 image** tiếp tục đạt. Đã xem screenshot desktop/mobile của form nguồn.
- Bằng chứng: `tmp/step-09/browser-results.json`, `sources-desktop.png`, `sources-mobile.png`. Mọi kiểm thử sửa bài dùng DB riêng trong tmp/step-09; không điền nội dung thử vào kho người dùng.

## Giới hạn

Kiểm tra checksum/trang là xác minh cấu trúc và tính toàn vẹn; không chứng minh mọi nhận định đúng hoặc được tài liệu hỗ trợ. Người quản lý phải đọc trang được dẫn, đối chiếu thông tin và xem ảnh trước khi xác nhận năm mục rà soát. Chưa phát hiện trùng ý khi viết lại bằng câu chữ khác. Không dùng AI/Gemini, không công khai PDF và không kết nối Google/Meta/Telegram/cloud/GitHub trong bước này.

`npm.cmd run dev` tiếp tục sử dụng DB bước 8. Giữ cả database và thư mục assets; chưa có backup/export đầy đủ. `node scripts/check-sources-browser.mjs` chạy kho kiểm thử riêng.

Đề xuất bước 10: sao lưu/xuất và khôi phục kho local (caption, căn cứ, ảnh, phiên bản và rà soát), kiểm thử checksum và phục hồi trước khi mở rộng tích hợp dịch vụ. Chờ phê duyệt riêng trước khi code.
