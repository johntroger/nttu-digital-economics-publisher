# Bước 38 — Phương án nghiệm thu ngân sách CPU

Ngày 08/10/2026: người quản lý chọn **giữ Workers Free**, chấp nhận làm chậm để ổn định. Không nâng gói. F1–F2 đã triển khai và kiểm thử trong phạm vi đọc/chuẩn bị. F3 đã được phê duyệt, hoàn tất code và kiểm thử cô lập; chưa rollout cloud hoặc đo CPU F3. F4 vẫn cần phê duyệt riêng. Bằng chứng F3: [báo cáo bộ đăng bền vững](38-f3-durable-publisher.md).

## Phương án A — Workers Paid

Phù hợp với kiến trúc hiện tại và ít thay đổi hơn. [Giá chính thức](https://developers.cloudflare.com/workers/platform/pricing/) hiện có phí nền 5 USD/tháng cộng sử dụng. Người quản lý tự xác nhận và nâng gói trong Cloudflare; agent không thực hiện giao dịch từ phê duyệt code.

Sau khi nâng: đọc lại gói/giới hạn thực, chọn giới hạn CPU phù hợp và triển khai trong phạm vi được duyệt; đo lại dry-run, preview và management bằng các lượt cold/warm. Kiểm tra không có lỗi CPU, thời gian chờ bị giới hạn và trạng thái D1 không phát sinh quyền hoặc công việc. Báo cáo số mẫu và mức sử dụng so với ngân sách; không chỉ lấy HTTP200 làm nghiệm thu. Việc nâng gói không mở cửa đăng.

## Phương án B — Giữ Workers Free

Cần thiết kế lại dry-run, preview và management để từng request nằm dưới 10 ms với khoảng dư. Phân trang preview; tránh tính lại toàn kho khi render management; tách chuẩn bị bài thành các request có công việc CPU nhỏ, thay vì chỉ kéo dài wall timeout.

Mỗi giai đoạn chuẩn bị chỉ trả receipt ngắn hạn gắn owner, release, Page cố định, version, checksum, revision và operation generation. Receipt không cấp quyền đăng. Không đưa token Meta vào trình duyệt hoặc cho caller chọn URL. Bước cuối đọc lại trạng thái D1, kiểm receipt hiện hành và ngày Việt Nam; thay đổi trong khi chuẩn bị phải hủy hồ sơ.

Đường gửi sau này vẫn phải giữ atomic intent/day/Page locks, kiểm version trước outbound, giữ khóa unknown và phục hồi evidence mà không POST lại. Không chia nhỏ bằng cách bỏ các hàng rào này. Cần thử native race/crash/expiry và đo CPU thật từng request, bao gồm finalizer/đối soát; chưa có bằng chứng cho thấy chỉ tách dry-run sẽ đủ cho cả đường gửi.

Trước khi code phương án B: trình thiết kế request/receipt và phạm vi thay đổi để người quản lý duyệt theo quy trình từng bước. Nếu không thể đạt ngân sách mà giữ các ràng buộc trên, báo rõ và đánh giá lại phương án triển khai. Không hứa vận hành ổn định trên Free trước khi đo đạt.

## Điều kiện chung

Giữ production publisher tắt và không cấp permit/credential/job trong quá trình xử lý tài nguyên. Không đổi staging đang đăng trên Tập Viết. Khi đạt ngân sách, tạo lại hồ sơ P01 còn hiệu lực để review; đăng thử thật cần phê duyệt riêng. Chỉ sau thử thật thành công mới xét bật lịch chính thức 10:00 Việt Nam, một bài/ngày.

## Thiết kế cụ thể cho hướng Free

Rà soát code cho thấy `managementData` trả cả 40 caption/metadata và dữ liệu nhiều tab trong một request; `productionPreview` xác minh cả 40 bài rồi dựng toàn lịch; `productionSendPreflight` chạy projection bài hai lần, đọc/kiểm ảnh, xác minh Meta và chốt hồ sơ trong một request. Đây là các công việc cần tách. Chưa có profile CPU từng hàm nên không quy toàn bộ 23 ms cho SHA hoặc một thư viện cụ thể.

### Giai đoạn F1 — giao diện và đo nền

F1 đã hoàn thành phạm vi đọc và số đo hiện tại; xem [báo cáo F1](38-f1-free-management.md). Preview gồm khởi tạo, một bài mỗi request và đối chiếu snapshot cuối; chỉ kết luận toàn kho khi pha cuối đạt. F2 đã hoàn thành; xem [báo cáo F2](38-f2-free-preparation.md).

Tách management thành summary gọn, danh sách bài theo cursor (khởi đầu năm bài/trang), chi tiết một bài, thư viện và lịch sử tải khi mở tab. Giữ xác thực owner trên mọi request. Không gửi body/metadata/caption của cả kho khi chỉ cần tiêu đề. Preview kiểm từng trang nhỏ, cursor do server ràng buộc; hiển thị tiến độ và chỉ ghi kết quả kiểm cho những bài đã đọc. Không hiển thị “40/40 đạt” khi mới kiểm một trang; nếu thay snapshot hoặc phiên bản trong lúc đọc phải làm lại.

Đo baseline xác thực, SELECT và serialization riêng trên cloud để chọn kích thước trang theo ngân sách, không ấn định năm bài là chắc đạt. Giữ các endpoint cũ trong fixture so sánh đủ 40 bài; đổi production UI và routes đồng bộ sau kiểm thử. Chưa sửa publisher hoặc cấp quyền ở F1.

### Giai đoạn F2 — chuẩn bị bài qua nhiều request

Đã hoàn tất phạm vi bốn lượt chuẩn bị và số đo hiện tại; xem [báo cáo F2](38-f2-free-preparation.md). F3 đã được phê duyệt và kiểm thử cô lập.

1. Kiểm phiên bản, nguồn/facts, biên nhận duyệt và trạng thái ban đầu của một bài.
2. Đọc và kiểm byte ảnh R2 gắn đúng checksum/version.
3. Meta GET xác minh kết nối/đích, giới hạn timeout và payload.
4. Đọc lại trạng thái hiện hành, kiểm receipts các bước, chốt hồ sơ ngắn hạn và thời điểm Việt Nam.

Receipt ký bởi server, có loại tác vụ và số bước rõ ràng, chỉ mang digest/identity cần thiết, ràng buộc owner, release, ngày, revision, operation generation và hết hạn. Không tin kết quả hash do trình duyệt tự báo; không đưa token vào receipt. Dry-run giữ SELECT-only: dùng receipt stateless, không tạo quyền/job. Replay receipt chỉ được đọc lại hoặc bị từ chối, tuyệt đối không chuyển thành quyền POST. Toàn chuỗi có hạn; nếu quá hạn, đổi dữ liệu hoặc vượt qua nửa đêm thì bắt đầu lại. Chữ ký/đọc lại trạng thái cũng phải nằm trong số đo CPU mỗi request.

### Giai đoạn F3 — publisher có trạng thái bền vững

Đã hoàn tất code/local/native/mock; xem [báo cáo F3](38-f3-durable-publisher.md). Migration15 là opt-in và chưa áp dụng cloud. Production vẫn F2 với cửa đăng đóng. Nghiệm thu CPU và rollout chuyển sang F4, không coi native/mock là bằng chứng Workers Free đủ ngân sách.

Tách kiểm kho khỏi gửi: đếm theo SQL và kiểm từng bài ở những lượt riêng, không gọi projection 40 bài trong tick. Chuẩn bị công việc ở trạng thái held chưa được gửi; receipt không thay thế permit owner.

Request thực hiện POST phải đọc lại fences/permit/day/Page, chiếm quyền gửi bằng SQL nguyên tử và ghi intent **trước** outbound. Giảm công việc CPU ở request này bằng chuẩn bị snapshot ở các lượt trước; vẫn kiểm bytes/fences cần thiết. Không chia claim và POST thành hai lượt mà lượt sau có thể gửi trùng. Receipt sau POST và finalization có thể xử lý ở lượt kế tiếp từ evidence bền vững; mất response/crash sau intent chuyển unknown, không tự POST lại. Chỉ đối soát GET tương quan mới gỡ khóa. Mỗi lượt cron-job.org xử lý tối đa một giai đoạn đủ ngân sách, không chạy vòng lặp toàn chuỗi hoặc gom vào waitUntil (không tạo ngân sách CPU mới).

Cần đo cả R2/byte hashing/FormData/POST/evidence chứ không chỉ dry-run. Nếu một bước vẫn vượt 10 ms thì tối ưu/chia nhỏ hợp lệ và kiểm lại; chưa cam kết toàn đường gửi sẽ đạt chỉ từ thiết kế này. Không chuyển logic gửi sang máy cá nhân hoặc GitHub scheduled workflow vốn không bảo đảm mốc đăng.

### Giai đoạn F4 — nghiệm thu và thử thật

Mục tiêu nội bộ mỗi request thường dưới 7 ms để có khoảng dư; không coi 9,9 ms là nền ổn định. Mỗi endpoint đo ít nhất 30 lượt warm và ghi riêng cold quan sát được; báo số mẫu, p95/max và invocation outcome. Nếu mẫu nào vượt ngân sách hoặc có exceededCpu, chưa nghiệm thu và tiếp tục xử lý. Không giả nhận warm là cold hoặc khẳng định lấy mẫu hữu hạn bảo đảm mọi request tương lai.

Kiểm thử page cursor/snapshot change, receipt giả/sai owner/hết hạn, thay nguồn/ảnh/token, midnight, pause ở giữa chuỗi, song song/replay, crash trước/sau intent, evidence recovery và unknown. So sánh đủ 40 bài với projection đã duyệt, giữ caption/footer/ba logo. Kiểm trạng thái quản lý và monitor trong chuỗi chia giai đoạn. Native/mock/CI phải đạt trước rollout; đo cloud đạt trước xin duyệt một bài thật. Sau trial xác nhận mới đề xuất bật lịch thường một bài/ngày 10:00.

Thứ tự phê duyệt: F1 trước, kiểm thử và đo; báo kết quả để duyệt F2; tiếp tục tương tự F3/F4. Không triển khai cả bốn giai đoạn từ một yêu cầu xem phương án.
