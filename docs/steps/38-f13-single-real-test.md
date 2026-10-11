# F13 — Một bài thật trên fanpage chính thức

Chủ dự án yêu cầu thử một bài thật vào thời điểm gần nhất. Dùng P01 «Một bảng doanh thu có thể kể điều gì?», version production-approved-batch-2026-v1:P01:v1, Page817593604765443; caption/ảnh đã duyệt, separator/footer giữ nguyên. Không bật lịch ngày10:00.

F12 chưa có đường cấp/kích hoạt quyền thử cho schema16. Bổ sung bước Node vào workflow runner hiện có, chỉ khi manual input single_test=true. Không mở route Worker mới, đổi migration, UI, nguồn lịch hoặc transport gửi.

Node kiểm context/main/workflow/run identity/release, policy tháng và quota giữ600; approval riêng giới hạn Page/P01/caption hash/image checksum/một bài/SHA/hạn tối đa một giờ. Trước cấp permit, gọi productionSendPreflight hiện có trên Node qua D1 REST batch và R2 GET: kiểm lại nguồn/facts/biên nhận/phiên bản, byte ảnh thật và hai Meta GET. Hồ sơ hết hạn hoặc dữ liệu thay đổi bị chặn. Cấp/kích hoạt bằng hai hàm issueSingleTestPermit/activateSingleTestPermit đã kiểm thử; local admin binding không mở legacy Worker publisher. Thời điểm do server clock tính gần nhất sau hai phút; Node chờ đến hạn, không tạo cron.

Runner hiện có vẫn kiểm lại dữ liệu/byte ảnh/quyền/token trước intent và grant một lần; POST chỉ tới Page cố định. Finalizer confirmed của mode test tự enabled0/paused1. Cleanup always đóng/revoke quyền thử dù lỗi; intent/requested/unknown được giữ để GET đối soát, không tự gửi lại. Sau workflow, quản trị còn phải trả cổng Actions/runnerfalse và đọc usage/remote ID/ảnh/caption. Không coi success workflow hoặc HTTP204 là bằng chứng bài đã đăng.

Cloudflare token repository hiện có chỉ đưa vào bước chuẩn bị/đóng; runner gửi không nhận token này. Cả hai bước chỉ main trong environment production-runner. Không đọc/copy giá trị secret; token Meta dùng hai environment secret đã đối chiếu F12. REST D1 batch theo tài liệu https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/ ; R2 object GET theo client Wrangler đang khóa phiên bản.

34 kiểm thử tập trung (7 mới và27 preflight/runner) đạt: giả lập đăng một lần/tự pause, approval thiếu/hết hạn/sai SHA/multi-post, caption/ảnh sai, R2 hỏng, nguồn đổi trong GET, context không tin cậy, binding SQL params. Đây chưa phải bằng chứng gửi thật. Mã Worker/UI/migration không đổi; cần CI SHA mới, quota mới và xác nhận policy owner cho SHA cuối trước triển khai. Phê duyệt đăng một bài của owner vẫn có hiệu lực; chỉ policy release cần xác nhận cụ thể theo quy tắc tháng hiện có. Chưa mở cổng hay cấp permit production.

Typecheck và535/535 kiểm thử toàn bộ local đã đạt. Lượt đầu534/535 thất bại ở kiểm tra F6 cấm mọi input; sửa kiểm tra thành chỉ cho phép duy nhất single_test:boolean/defaultfalse và vẫn cấm string/choice/ref/Page/version/time. Cache/fixture cả lượt thất bại và lượt thành công đã tự dọn. Nhánh codex/step38-f13-single-real-test; mọi cổng production vẫn tắt trong khi kiểm CI.
