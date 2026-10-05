# Bước 13 — Google và giao diện quản lý staging

Được người dùng duyệt ngày 05/10/2026. Đã hoàn thành phạm vi Bước 13;
owner xác nhận đăng nhập Google thật thành công ngày 05/10/2026.

Phạm vi: đăng nhập Google đúng owner; giao diện/API đọc kho, biên tập caption, phiên bản,
khôi phục caption, xem lịch/lịch sử/cảnh báo trên D1 staging. Kho cloud khởi tạo riêng từ
40 đề cương đã quản lý trong Git, không tự ghi đè kho local hoặc chuyển dữ liệu riêng.
Ảnh/PDF/logo gốc, dựng ảnh, kiểm định tài liệu và backup đầy đủ hiện dùng bản local;
đưa các tài sản đó lên R2 cần thiết lập kho lưu trữ và phạm vi upload riêng, chưa nằm trong
pipeline code ở bước này. Không đánh dấu ready hoặc nối Facebook/Telegram.

Thiết kế giữ màu và nhịp của giao diện local: xanh trường #07559D, nền #F2F6FA,
chữ #253347, vàng nhấn #8B751D và trắng #FFFFFF. Segoe UI cho điều khiển, Bahnschrift
cho tiêu đề với fallback sans-serif. Điều hướng trái, danh sách đề cương ở giữa,
biên tập caption bên phải; mobile chuyển một cột. Không tạo mẫu dashboard mới không
liên quan; phân biệt kho staging/kho local và ghi rõ việc chưa hoàn thiện hình ảnh.
Trang đăng nhập chỉ có tên ứng dụng, nút Google và trạng thái cài đặt, không lộ kho bài.

OAuth authorization code với PKCE/state/nonce, xác minh chữ ký Google bằng JOSE,
issuer/audience/expiry/nonce/email_verified và allowlist owner. Cookie phiên ký tại server,
Secure/HttpOnly/SameSite=Lax, hết hạn sau một giờ; không lưu token/cookie/signing key vào D1.
Mutation yêu cầu Origin chính xác và CSRF token của phiên. Logout bằng POST, không GET.
Cloud static assets bắt buộc run_worker_first để mọi đường dẫn quản lý qua xác thực.

Viết D1 qua batch nguyên tử với CAS phiên bản, đối chiếu pause/maintenance/job đang giữ,
idempotency request và khóa caption chuẩn hóa chống trùng giữa hai bài. Phiên bản mới
không sao chép kiểm định/ảnh đủ điều kiện; khôi phục cũng tạo phiên bản mới.

Cổng nghiệm thu: auth/authorization/CSRF/tamper/expiry trên unit test; D1 batch race và
rollback với runtime Workers; GUI desktop/mobile/keyboard; Google login thật của owner
và kiểm tra staging API. Chỉ báo nghiệm thu phần nào có bằng chứng thực tế.

Google client ID do owner cung cấp; client secret lưu trực tiếp Cloudflare. Session signing
key ngẫu nhiên chỉ nằm ở secret store Cloudflare; khôi phục kho không khôi phục phiên cũ.
Không gửi client secret/signing key vào log hoặc Git. Callback cố định:
https://nttu-publisher-staging.nttu-kts-johntroger.workers.dev/auth/google/callback.

Tài liệu: https://developers.google.com/identity/openid-connect/openid-connect,
https://developers.google.com/identity/protocols/oauth2/web-server,
https://developers.cloudflare.com/workers/static-assets/binding/.

## Bằng chứng local ngày 05/10/2026

- TypeScript và toàn bộ 181 kiểm thử Node đạt.
- Workers bundle và 9 migration D1 local đạt; heartbeat ghi được, đăng bài vẫn tắt.
- D1 qua runtime local: CAS hai yêu cầu đồng thời chỉ một thành công, chống caption trùng
  rollback toàn batch, endpoint owner lưu được, JSON lỗi/quá 64 KiB bị chặn.
- Sáu kiểm tra Chrome đạt: truy cập ẩn danh, kho 40 bài, preview text an toàn,
  lưu/khôi phục, tìm kiếm/điều hướng, mobile/bàn phím. Đã xem ảnh desktop/mobile.
- Bộ kiểm thử dùng khóa/phiên fixture riêng trong loopback; không coi đó là đăng nhập Google thật.

Pipeline tạo SESSION_SIGNING_KEY ngẫu nhiên một lần trực tiếp trong Cloudflare secret store;
giữ nguyên khóa đã có và không ghi giá trị vào GitHub, D1, file hoặc log. Google client secret
do owner lưu trực tiếp dashboard. keep_vars giữ Google client ID qua lần triển khai sau.
Staging deployment đã kiểm chứng; owner đã xác nhận Google login thật thành công.

## Bằng chứng staging

Commit d3446b2ee026a7ddacdb6cd78f7b0e174ff20051, pipeline
https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37283297190:
Windows/Linux checks và deploy đều success. Kiểm tra endpoint sau deploy: health 200 đúng
release; D1 private status 200 và paused=true; status ẩn danh/catalog/manager.js 401;
publish endpoint 501. OAuth start 302 đúng accounts.google.com, đúng client ID owner
cung cấp và callback staging, cookie HttpOnly. Không lưu giá trị cookie vào bằng chứng.
Đây là bằng chứng ban đầu trước kiểm thử Google login thật bên dưới.

## Xử lý lỗi đăng nhập thực tế

Owner báo login failed. Chẩn đoán có bảo vệ cho thấy không nhận được HTTP từ Google.
Đã tái hiện trên workerd: fetch HTTP dùng redirect='error' ném TypeError
"Invalid redirect value, must be one of follow or manual" trước khi gửi yêu cầu.
Sửa token exchange sang redirect='manual', từ chối phản hồi 3xx thay vì đi theo chuyển hướng;
form serialize rõ ràng và fetch giữ global context. JWKS cũng dùng customFetch giữ global context.
Không suy ra Client Secret sai từ lỗi này. Diagnostic dùng mã cố ý không hợp lệ, yêu cầu
bearer riêng staging và chỉ trả nhóm lỗi/status; không trả token, secret, body, email hay code thật.
Thêm test OAuth trên bundle chạy trong workerd với outbound provider fixture: HTTP form,
auth diagnostic, lỗi provider và không follow redirect.

## Nghiệm thu phạm vi Bước 13

Release 39d73f471de8bb59ef4523fd7002045106709900; pipeline
https://github.com/johntroger/nttu-digital-economics-publisher/actions/runs/37289284893
đã kiểm tra Windows/Linux và triển khai staging. Bộ Node hiện có 182 kiểm thử đạt,
9 kiểm thử ảnh đạt, OAuth workerd regression đạt. Google probe thật đã nhận HTTP 400
invalid_grant cho mã cố ý không hợp lệ; không dùng kết quả probe làm bằng chứng owner login.
Owner sau đó xác nhận "đã đăng nhập thành công" — đây là bằng chứng Google login thật.
Kiểm tra sau xác nhận: health đúng release 200, D1 private status 200, paused=true,
status ẩn danh 401, publish endpoint 501. Không đăng Facebook.

Lưu/khôi phục caption đã được kiểm thử bằng Chrome và D1 local; chưa ghi nhận owner
thực hiện mutation caption trên D1 remote. Không tuyên bố đã nghiệm thu ảnh/PDF/R2,
Facebook, Telegram, kho production hay toàn bộ workflow. Dừng trước Bước 14.
