# Hướng dẫn vận hành Phòng nội dung

## Production hiện tại — cập nhật 07/10/2026

Giao diện chính thức: https://nttu-publisher-production.nttu-kts-johntroger.workers.dev/. Đăng nhập Google của người quản lý; kho 40 bài và tài nguyên riêng đã chuyển, Page chính thức 817593604765443 đã xác minh. Facebook production đang tắt; chưa có bộ đăng được bật. Lịch 10:00 giờ Việt Nam dưới đây đang áp dụng cho staging/Tập Viết, không phải bằng chứng production đã đăng.

Tác vụ «NTTU – Vận hành production» trên cron-job.org gọi POST /api/production/tick mỗi phút, body rỗng và token riêng trong header Authorization. Hiện endpoint chỉ xử lý hàng chờ Telegram, một mục mỗi lượt. Tick mỗi phút không phải đăng Facebook mỗi phút. Giữ tác vụ này bật và job giám sát 30 phút bật. Theo dõi heartbeat HTTP nhận/hoàn tất và các lượt 200; Cron cũ được lưu riêng, không phải nguồn đang được chọn.

Không đưa token kích hoạt vào URL, body, ảnh hoặc chat. Token này không thay token Meta, token giám sát hoặc phiên owner. Tác vụ ngoài có email cảnh báo lỗi/phục hồi/tự tắt. Khi thay token, cập nhật cả Worker và header job rồi xác minh lượt thực tế; không dùng token có quyền rộng hơn để xử lý lỗi xác thực.

Tình trạng chi tiết và bằng chứng ở docs/steps/35-production-operations.md. Phạm vi chuẩn bị publisher cần phê duyệt riêng ở docs/steps/36-production-publisher-plan.md.

## Truy cập và lịch

Staging: https://nttu-publisher-staging.nttu-kts-johntroger.workers.dev/. Đăng nhập Google bằng tranthanhtung37@gmail.com. Nếu phiên hết hạn, đăng nhập lại; không nhập token vào caption hoặc chat. Staging hiện đăng lên Tập Viết, Page ID 551227411605506.

Hệ thống chạy trên cloud khi máy tính tắt. Giờ Việt Nam: 08:00 kiểm tra các bài lịch sử; 09:55 chuẩn bị; 10:00 đăng một bài. Cron xử lý mỗi năm phút nên dịch vụ chậm có thể làm bài đăng muộn. Bài thủ công của người quản lý không được tính thay cho bài tự động và không bị workflow chỉnh sửa.

Mỗi ngày xem lịch, công việc đang xử lý, tồn kho, lịch sử và Telegram. Bài đăng thành công phải có publication ID/lịch sử xác nhận, snapshot và thông báo đã giao; HTTP thành công hoặc trạng thái đang gửi chưa đủ. Bài không còn đọc được trên Facebook được ghi nhận là không truy cập được; lỗi quyền/kết nối không chứng minh bài bị xóa. Hệ thống không đăng lại bài bị người quản lý xóa.

## Nội dung và bổ sung kho

Kho ban đầu gồm 30 bài theo lịch và 10 dự phòng. Bài đã đăng chuyển vào lịch sử; kho giảm theo sử dụng. Không tự gọi Gemini hoặc tạo bổ sung khi hết kho. Còn không quá ba bài đủ điều kiện thì cảnh báo; hết kho thì dừng và báo bổ sung. Thời điểm cảnh báo tương đương khoảng ba ngày chỉ khi mỗi ngày dùng một bài; lỗi/dự phòng có thể làm tồn kho giảm nhanh hơn.

Chuẩn bị nội dung mới từ nguồn đã được xác minh, kiểm tra lịch sử để tránh trùng, tạo ảnh, kiểm tra thiết kế và duyệt đúng phiên bản trước đưa vào kho. Biên nhận duyệt gắn với caption, checksum ảnh, footer và nguồn; chỉnh sửa làm biên nhận cũ mất hiệu lực. Không sửa hàng loạt status thành ready để bỏ qua kiểm tra.

Ảnh vuông, ba logo chuẩn cùng một hàng trên cùng; giữ tỷ lệ và hình dạng logo. Luân phiên infographic và ảnh ít chữ theo chủ đề. Caption có dòng ============ trước footer; chỉ một footer và một nhóm hashtag; TikTok dùng đúng URL đã chốt. Giới thiệu ngành dựa trên tài liệu khóa 2026, thời lượng 3,5 năm; không tự thêm cam kết thu nhập/tuyển sinh.

## Khi đăng gặp lỗi

| Trạng thái | Cách xử lý |
|---|---|
| Facebook xác nhận lỗi có thể thử lại | Hệ thống thử cùng snapshot, tối đa ba lần, cách năm phút |
| Hết lượt hoặc bị từ chối nội dung rõ ràng | Giữ công việc lỗi; chọn dự phòng cùng nhóm trước, rồi nhóm khác; có thể tiếp tục dự phòng trong ngày nếu kết quả trước đã rõ |
| Timeout, 5xx hoặc không rõ đã đăng chưa | Không bấm gửi lại hoặc ép lấy dự phòng. Kiểm tra Facebook, lấy ID bài đã xuất hiện rồi dùng chức năng đối soát |
| Token/quyền Facebook không hợp lệ | Lịch dừng và báo Telegram; thay thông tin kết nối riêng tư, kiểm tra đúng Page, giải quyết công việc tồn đọng trước bật lại |
| Đã có bằng chứng thành công nhưng lịch sử chưa cập nhật | Chờ phục hồi/đối soát; không POST lại. Bằng chứng bền vững ngăn tạo bài thứ hai |
| Hết kho | Bổ sung và duyệt nội dung; kiểm tra cảnh báo/công việc cũ trước bật lại |
| Telegram không rõ đã gửi hay chưa | Kiểm tra cuộc trò chuyện và outbox; không reset hàng chờ hàng loạt để tránh thông báo trùng |

Ngày bỏ lỡ không đăng bù nhiều bài. Bài chưa gửi về dự phòng; ngày hôm sau tiếp tục một bài. Nếu xác nhận muộn một bài đã được Facebook tạo, hệ thống dùng ngày thực tế của bài để chặn bài thứ hai cho ngày đó.

## Giám sát độc lập

cron-job.org gửi POST tới workflow monitor.yml trên main mỗi 30 phút. GitHub giữ logic giám sát/checkpoint và secret Cloudflare/Telegram. GitHub còn hai lượt dự phòng lúc 09:23 và 21:23 giờ Việt Nam, theo lịch best effort. Lượt khỏe mạnh không gửi Telegram.

Theo dõi cả lịch sử cron-job.org và GitHub Actions: HTTP 204 chỉ xác nhận nhận yêu cầu, phải có workflow success và checkpoint nguồn cron-job.org. Bật thông báo lỗi của cron-job.org để biết khi yêu cầu bị từ chối; bước này cần người quản lý thực hiện/xác nhận. Nếu GitHub ngừng thực thi hoàn toàn, workflow không thể gửi cảnh báo trong thời gian đó; cảnh báo khoảng trống chỉ xuất hiện khi có lần chạy lại.

Token riêng cho cron-job.org: chỉ repository này, Actions Read and write, thời hạn hiện tại 06/11/2026 lúc 08:24 giờ Việt Nam. Thay trước hạn: tạo token cùng phạm vi, cập nhật header Authorization trong cron-job.org, thử một lần, kiểm tra workflow thành công rồi thu hồi token cũ. Không thay bằng token có quyền rộng hơn. Quyền Actions áp dụng cho các workflow của repository, không giới hạn riêng monitor.yml.

Token Facebook có thể hết hạn hoặc bị thu hồi trước hạn do thay quyền/tài khoản/ứng dụng; kiểm tra kết nối, không dựa vào ngày đã khai báo. Không lưu token trong GitHub source, URL, tài liệu hoặc ảnh chụp. Token cron-job.org chưa có cơ chế nhắc hạn Telegram tự động; hạn trên cần được quản lý riêng.

## Sao lưu và phục hồi

Bản sao lưu cloud qua giao diện yêu cầu lịch dừng và không có công việc chưa rõ kết quả. Không tự dừng lịch đang bật để tạo backup. Khi đã có phê duyệt bảo trì: dừng, giải quyết công việc, tạo/tiếp tục backup tới complete, đối chiếu manifest/checksum, tải bản riêng tư ra ngoài và kiểm thử restore cô lập.

Gói phục hồi Bước 30 nằm ở tmp/step30/recovery-bundle, dùng bản xuất D1 hiện tại và tài nguyên khớp checksum. Có 40 bài, 80 phiên bản, 59 tài nguyên và 40 biên nhận duyệt. Ứng dụng trong bản sao được chuyển sang dừng để phục hồi an toàn; bản SQL gốc vẫn giữ trạng thái thật và dữ liệu vận hành/thử riêng. Không import SQL gốc thẳng vào cloud đang chạy.

Chỉ dùng CLI restoreCloudBundle với manifest hợp lệ để phục hồi vào thư mục cô lập. Bản khôi phục mặc định quarantined và paused, không tự nhận quyền đăng. Kiểm tra dữ liệu, tài nguyên, lịch sử và quyền trước đưa sang môi trường mới. Secret không nằm trong backup nghiệp vụ, cần cấu hình lại riêng.

Lưu ít nhất một bản đầy đủ ở nơi riêng tư độc lập với máy tính. Kho GitHub chứa code và metadata, không thay thế backup database/ảnh/PDF. Sao lưu định kỳ, retention và khôi phục trực tiếp lên cloud chưa được triển khai.

## Trước khi bật môi trường chính thức

Chờ nghiệm thu, phê duyệt riêng và bước triển khai production. Publisher staging giới hạn Page thử; adapter production dùng tài nguyên và cửa phê duyệt riêng. Chỉ đổi Page ID trên staging không phải quy trình chuyển production. Không cho staging và production cùng đăng vào một Page. Khi production được phép hoạt động, bảo đảm lịch, kho, thông báo, giám sát và backup đều trỏ đúng môi trường.

### Bản xem trước Bước 36

Giao diện production → Lịch đăng → Bản xem trước 30 ngày. Chọn ngày chỉ thay bản xem trước, không lưu lịch. Endpoint GET `/api/production/preview` chỉ dành owner; trigger/monitor token không có quyền đọc. Tại Bước36 chưa có route gửi production; Bước37 bổ sung endpoint riêng nhưng chưa cấp credential hoặc mở cửa đăng. Bộ publisher fake và schema fixture không được đưa vào Worker quản lý hoặc D1 cloud. Báo cáo và các điều kiện còn khóa: `docs/steps/36-production-publisher.md`.

### Adapter và preflight Bước 37

Production → Lịch đăng → Kiểm tra trước khi đăng (cuối trang). Cửa triển khai/dữ liệu phải Đóng, quyền đăng/nguồn kích hoạt Chưa cấp, unknown0 và heartbeat publisher0 trong giai đoạn hiện tại. GET `/api/production/preflight` chỉ owner và chỉ đọc. `/api/production/publisher/tick` là endpoint riêng; token Telegram/monitor không hợp lệ tại đây. Không dùng `/api/production/tick` để đăng Facebook: endpoint đó chỉ xử lý Telegram.

Schema14 bổ sung bảng `production_publisher_*` và `production_send_permits`, không nhập fixture hoặc cấp quyền đăng từ approvals22–23. Không tự sửa enabled, tạo permit bằng SQL hoặc cấp Secret publisher để thử. Cần hoàn tất CPU/full dry-run, duyệt bài/ảnh/version/Page/giờ và phê duyệt cấp capability bên ngoài trước khi thử thật. Báo cáo Bước37 và kế hoạch đề xuất Bước38 nằm trong docs/steps.

Nếu kết quả unknown: giữ khóa, không POST lại; chỉ đối soát GET và bằng chứng khớp intent. Nếu finalizer lỗi mà evidence đã lưu: phục hồi evidence, không gửi lại. Pause thu hồi permit, hủy held/retry_wait nhưng giữ requested/unknown. Migration rollback `cloud/production-publisher-rollback.sql` chỉ dành schema rỗng, tắt, không permit/job/evidence/publication; backup trước, kiểm trên bản sao rồi mới thao tác cloud trong phạm vi bảo trì được duyệt. Không rollback xóa biên nhận vận hành thật.

### Chuẩn bị bài thử Bước 38

Production → Lịch đăng → Chuẩn bị bài thử. Chọn bài rồi bấm Kiểm tra chuẩn bị gửi; request owner/CSRF chỉ đọc, không tạo lịch/permit/job hoặc POST Facebook. Hồ sơ có caption/ảnh/version/checksum/Page và thời gian đề xuất của server; hết hạn sau tối đa năm phút và phải tạo lại trước duyệt thử. Không có nút cấp quyền hoặc đăng trong giao diện hiện tại. Helper permit/activation chỉ được nghiệm thu bằng fixture; không gọi cloud trực tiếp hoặc tự sửa SQL để mở cửa.

Ngày08/10, Bước38 chưa đạt ngân sách CPU: dry-run 23 ms trong khi gói Workers Free có10ms. Giữ publisher tắt/paused đến khi xử lý tài nguyên và nghiệm thu các giao diện điều khiển còn thiếu. Token Telegram/monitor không cấp quyền đăng. Báo cáo: `docs/steps/38-production-send-preflight.md`; hai phương án chờ lựa chọn: `docs/steps/38-resource-acceptance-plan.md`.


### Giao diện đọc F1 trên Workers Free

Tổng quan chỉ tải summary; Kho nội dung đọc 5 tiêu đề mỗi lần, mở bài để đọc caption/ảnh/nguồn. Đọc thêm 5 bài dùng cursor cùng snapshot; nếu dữ liệu đổi thì Làm mới để đọc lại. Thư viện và lịch sử tải riêng. Lịch đăng kiểm từng bài; tiến độ chưa đầy đủ không phải kết quả toàn kho. Chỉ sau đối chiếu snapshot cuối mới hiển thị 40/40 khớp duyệt; lỗi cuối xóa kết quả từng phần. Cursor hết hạn sau 5 phút hoặc khi nguồn/fact đến hạn thì kiểm lại. Đây là màn hình đọc, không cấp quyền đăng. Dry-run gửi còn23ms và production giữ tắt/paused; cần F2–F4 trước thử thật. Báo cáo: docs/steps/38-f1-free-management.md.


### Chuẩn bị bài thử sau F2

Mở Lịch đăng, đợi preview kiểm đủ rồi chọn bài và bấm Kiểm tra chuẩn bị gửi. Hệ thống lần lượt kiểm nội dung, byte ảnh, fanpage và chốt hồ sơ. Chỉ hồ sơ cuối mới là kết quả đầy đủ. Nếu lỗi hoặc đổi tab, kiểm lại từ đầu. Nguồn/ảnh/cấu hình/token thay đổi, hết hạn chuỗi hoặc qua ngày Việt Nam sẽ hủy kết quả. Hồ sơ không cấp quyền đăng Facebook; vẫn cần F3–F4 và phê duyệt riêng bài/thời điểm. Báo cáo: docs/steps/38-f2-free-preparation.md.

### Bộ đăng F3 — chưa rollout

F3 lưu tiến độ chuẩn bị và evidence qua nhiều lượt. Production hiện vẫn chạy F2, tắt/paused; chưa áp dụng schema15 hoặc cấp publisher token/permit. Sau khi F4 được duyệt, cần backup, kiểm migration15 với cửa đăng đóng và đo CPU trước duyệt bài thử thật. Không đổi cron Telegram/monitor thành publisher và không tự mở SQL để kiểm thử.

Khi được vận hành, mỗi tick xử lý một giai đoạn. Chuẩn bị có thể bắt đầu trước giờ ba phút nhưng POST không được trước giờ permit. Mất response sau intent giữ unknown; không bấm đăng lại, không xóa khóa/job/evidence hoặc đổi ngày để né khóa. Hint remote ID cần GET tương quan. Chốt evidence bị lỗi có thể phục hồi kể cả khi pause và không POST lại. Các lệnh npm kiểm thử và hook trước push dùng run-clean; giữ bằng chứng nghiệm thu, chỉ dọn fixture/cache mới thuộc lượt chạy. Chi tiết: docs/steps/38-f3-durable-publisher.md.
