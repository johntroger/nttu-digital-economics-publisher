# Bước 16 — Dựng ảnh trong giao diện cloud

Phê duyệt ngày 05/10/2026. Đã triển khai staging, chưa bật xuất bản.

Phạm vi: dựng PNG 1080×1080 trong trình duyệt của người quản lý, xem trước và
lưu/gắn ảnh thành phiên bản mới trên R2/D1. Không gọi AI; không có tác vụ dựng ảnh
hằng ngày. Hai mẫu: infographic ba ý chính; minh họa ít chữ với sơ đồ kết nối,
quy trình hoặc hồ sơ năng lực. Minh họa là hình vector tổng quát, không phải ảnh
người thật hoặc số liệu thống kê. Nội dung chữ do người quản lý nhập.

Thiết kế: hàng logo trắng cao 170 px giữ cả ba logo đúng tỷ lệ, nguyên màu, không
vẽ lại. Nội dung căn trái với lề 64 px; một tiêu đề lớn, ba ý hoặc một minh họa.
Màu khởi đầu paper #F2F6FA, ink #163348, accent #07559D, trắng #FFFFFF,
navy #0A2940. Cho đổi paper/ink/accent; chữ phải đạt contrast 4,5. Tiêu đề dùng
Bricolage Grotesque Bold, thân Work Sans Regular/Bold, đều OFL, có checksum và
bảng glyph. UI giữ thiết kế campus, form dọc và canvas xem trước, mobile một cột.
Không dùng font hệ điều hành hoặc font tải bên thứ ba để tránh thay chữ giữa máy.

Mở bài → Dựng ảnh → nhập tiêu đề/ý/định dạng/màu → Xem trước → Lưu và gắn ảnh.
Chỉ dựng từ caption đã lưu; thay đầu vào làm vô hiệu preview. Chặn chữ quá dài,
glyph thiếu, contrast thấp, thiếu/sai logo/font hoặc phiên bản bài đã đổi.
PNG và spec được lưu theo phiên bản; lưu ảnh không tạo ready hoặc review.
Retry giữ request ID/PNG; upload trùng dùng lại. R2 và D1 không giao dịch chung:
ảnh tải thành công nhưng phiên bản lỗi vẫn ở thư viện để dùng lại, không bị mất.

Đây là kiểm tra cấu trúc và renderer trong trình duyệt. Máy chủ kiểm PNG, checksum
logo và spec; không chứng minh PNG do client gửi chứa đúng chữ/logo, hoặc nội dung
ảnh đúng caption. Người quản lý vẫn xem ảnh và xác nhận rubric Bước 15.
Kiểm thử pixel/geometry/font/canvas và CAS trên fixture, không sửa kho cloud thật.
Không thêm API bên ngoài, thay lịch, Gemini, Telegram hoặc Meta.

Metadata logo/font được ghim từ bộ mẫu đã kiểm định. Công cụ tái tạo có chủ đích:
`scripts/build-cloud-design-registry.py` dùng cmap của font và manifest mẫu, chỉ
ghi metadata/ranges, không đưa bản logo gốc vào GitHub. Cloud prepare kiểm lại
checksum font và đóng gói giấy phép OFL. Registry không tự thay khi upload logo khác.

Kiểm thử trước triển khai: TypeScript và 202 Node/SQLite/HTTP tests đạt; Workers
bundle, D1/R2 upload/retry/CAS/binding, OAuth regression đạt. Chrome 16 ca đạt trên
fixture, bao gồm hai mẫu, ba motif, glyph/contrast/overflow, PNG tái dựng giống nhau,
lưu ảnh, vô hiệu preview khi sửa, desktop/mobile và nguồn/rà soát bước trước.
Đã xem PNG và form mobile, cân dòng tiêu đề và sửa pictogram thành chip công nghệ.
Tình huống phản hồi bị mất sau khi máy chủ đã lưu cũng đạt: client giữ PNG/request ID,
retry trả đúng phiên bản đã tạo, không sinh phiên bản thứ hai.

CI Windows/Ubuntu và triển khai mã afcf0e63c385ec42e3d7d4d3c5c23712e4b91780 đạt:
https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37311404089.
Pre-push cũng đạt 9 kiểm thử hồi quy renderer Pillow của bộ mẫu gốc.
Đối chiếu staging ngày 05/10/2026: health step 16 đúng release; giữ 21 tài nguyên,
13 PDF checksum chuẩn, 40 bài. 33 đường dẫn ẩn danh (gồm modules/font/design API)
trả 401; bearer health không đọc được API owner. paused=true, publish trả 501.
Không ghi ảnh/version/review fixture vào kho remote. Thao tác lưu/gắn ảnh đã kiểm
trên D1/R2 và Chrome cô lập; người quản lý còn cần nghiệm thu thao tác trên staging.

Bước tiếp theo đề xuất: sao lưu/khôi phục dữ liệu và tài nguyên cloud. Phải có
phê duyệt riêng trước khi code; chưa bắt đầu trong Bước 16.
