# Đánh giá workflow v4.1 trước triển khai

Ghi chú sau đánh giá, 05/10/2026: người dùng xác nhận hệ thống đăng một bài/ngày, bài thủ công là bổ sung độc lập. Khuyến nghị yêu cầu skip/pause khi đăng trực tiếp ở mục 4.3, dòng quy ước bài ngoài hệ thống trong bảng ưu tiên và ca 8 không còn áp dụng. Kế hoạch/thiết kế hiện hành đã cập nhật: không tiêu slot tự động, không dừng lịch vì bài thủ công. Những phần khác của đánh giá giữ làm căn cứ lịch sử.

Ngày đánh giá: 05/10/2026. Căn cứ: KE-HOACH-TONG-THE.md v4.1, THIET-KE-TRUOC-CODE.md và LICH-CONTENT-40-BAI.md. Đây là đánh giá thiết kế, không phải kết quả kiểm thử ứng dụng. Không cập nhật kế hoạch chính trong lượt đánh giá này.

## 1. Kết luận và mức độ sẵn sàng

Workflow phù hợp với một fanpage giáo dục và một người quản lý: nội dung/ảnh chuẩn bị theo đợt, không gọi AI lúc vận hành, đăng một bài mỗi ngày, tách thử nghiệm/chính thức và chạy trên cloud. V4.1 đã xử lý đúng nhiều vấn đề của các vòng trước: page gate, evidence độc lập, usage theo bài gốc, rubric nội dung, ảnh theo ngữ cảnh, backup full export và giới hạn miễn phí có kiểm chứng.

Không cần mở rộng phạm vi. Khoảng trống còn lại chủ yếu là thứ tự và cơ chế thực thi: quyền bảo trì phải phối hợp nguyên tử với quyền gửi; evidence tồn đọng phải được hoàn tất sau crash; việc chống lặp cảnh báo ngoài Cloudflare phải có trạng thái riêng; test cần điều kiện đạt cụ thể. Chất lượng marketing/design vẫn chưa thể kết luận vì mới có brief, chưa có năm mẫu caption/PNG hoàn chỉnh.

| Lĩnh vực | Đã đủ ở mức kế hoạch | Cần bằng chứng tiếp theo |
|---|---|---|
| Content | Ma trận, nguồn, rubric, facts 3,5 năm khóa 2026 | Caption cụ thể, đầu ra học tập, độ khác biệt và công sức biên tập |
| Graphic design | Logo gốc, bố cục, font/version, mobile QA | PNG thật, dải logo cân bằng, nội dung đọc được sau Facebook xử lý |
| Workflow | Retry/reserve/unknown/pause/history có chính sách | State transitions khi crash, bảo trì và phản hồi đến muộn |
| Phần mềm | Mô-đun, dữ liệu, scopes và CI/CD đã định hướng | Ràng buộc D1 thật, adapter Meta, restore và benchmark |

Không chấm điểm số vì chưa có phần mềm hoặc dữ liệu hiệu quả fanpage. Cần phân biệt thiết kế hợp lý, triển khai đúng và vận hành đạt mục tiêu: đó là ba mức bằng chứng khác nhau.

## 2. Content marketing

### 2.1. Giữ chiến lược, bổ sung ngữ cảnh sinh viên

Giữ 70/30 sinh viên/học sinh và 80/20 kiến thức–kỹ năng–nghề nghiệp/giới thiệu ngành trong đợt đầu. Đây là lựa chọn hợp mục tiêu, chưa phải tỷ lệ tối ưu được chứng minh. Có learning_level nhưng nên dùng nó cùng ngữ cảnh: mới tiếp cận ngành, đang làm dự án, đang chuẩn bị thực tập/việc làm. Không thêm tỷ lệ cứng hoặc bắt đọc bài trước.

Mỗi bài độc lập có thể giải thích ngắn “bài này hữu ích khi...” và đưa một thao tác/đầu ra nhỏ. P06 tạo brief dashboard; P04 sửa một dòng CV; P08 nhận diện điểm nghẽn của quy trình đơn hàng; P05 hiểu kinh doanh và công nghệ hỗ trợ nhau ra sao. Ví dụ nhỏ tốt hơn liệt kê nhiều thuật ngữ.

### 2.2. Tỷ lệ nhóm bài không phản ánh toàn bộ trải nghiệm đọc

Footer bắt buộc xuất hiện trong 100% bài nên tất cả bài đều có phần giới thiệu ngành. Nhãn 80/20 áp dụng phần thân, không có nghĩa trải nghiệm người đọc chỉ có 20% thông điệp quảng bá. Giữ footer nguyên văn; đưa giá trị lên đầu, tránh thân bài lặp lại cùng mô tả ngành và hạn chế CTA không phục vụ chủ đề. Không tự cắt footer hoặc sửa hashtag.

Chưa nên đặt giới hạn ký tự cứng cho mọi caption. Dùng độ dài theo nhu cầu: bài giải thích cần ngữ cảnh, bài thực hành cần mẫu/đầu vào/tiêu chí. Năm mẫu phải xem toàn bộ caption đã nối footer trên điện thoại, không chỉ đọc phần thân riêng.

### 2.3. Nghiệm thu biên tập bằng sản phẩm

Rubric năm tiêu chí đã đủ cho bản đầu. Bước tiếp theo là áp dụng vào năm mẫu P02/P04/P05/P06/P08 và ghi lỗi cụ thể, người sửa, phiên bản/check đã đạt. Không thêm thang điểm hoặc thêm danh sách tiêu chí dài.

Độ khác biệt cần kiểm tra ở hành động/đầu ra, không chỉ đổi tiêu đề. P24/R10, P26/R02, P08/R05 và P02/R03 đã có hướng phân biệt; kiểm tra caption cuối có thực hiện đúng hay không. Tình huống giả định không được trở thành câu chuyện sinh viên thật. Thời gian đào tạo 3,5 năm khóa 2026 theo xác nhận người dùng giữ nguyên, không sửa PDF gốc.

### 2.4. Công suất biên tập quyết định độ bền của workflow

Không AI runtime và không tái đăng nghĩa là cần sản xuất đợt mới chủ động. Theo dõi giờ viết, kiểm chứng, dựng ảnh và sửa mẫu; không chỉ số bài. Cảnh báo trước ba ngày giữ nguyên, nhưng có thể không đủ thời gian tạo một đợt hoàn chỉnh nếu chưa chuẩn bị. Dùng dashboard dự báo sớm để chủ động; cảnh báo Telegram sớm hơn chỉ là lựa chọn, không tự thay ngưỡng đã chốt.

Sau đợt đầu dùng mốc quan sát thống nhất và mục tiêu từng tuyến. Tương tác thấp không tự chứng minh bài giới thiệu ngành kém; phản hồi ít cũng không tự chứng minh bài thực hành được áp dụng. Không đưa ra kết luận nhân quả từ vài bài có reach khác nhau.

## 3. Graphic design

### 3.1. Ràng buộc nhận diện hợp lý nhưng phải thử bằng logo thật

Ba logo cùng hàng trên, nguyên tỷ lệ/màu và không thêm dòng tên ngành là ràng buộc đã chốt. Logo Trường ngang và hai logo tròn cần cân bằng diện tích nhìn thấy; không lấy cùng chiều cao làm tiêu chí duy nhất. Thử dải nền sáng với bản gốc, giữ chi tiết trắng, không vẽ lại để có thêm chỗ.

Vùng logo 160–190px và các font/lề trong kế hoạch chỉ là thông số thử. Không chốt như quy chuẩn đã đạt khi chưa xem PNG thật ở khoảng 360px và trên Facebook. Nội dung chính phải đọc được; logo còn nhận diện; không hứa mọi chữ nhỏ bên trong logo tròn đều rõ.

### 3.2. Một thông điệp hình ảnh, phần giải thích nằm trong caption

Infographic không cần chứa toàn bộ bài. Một biểu đồ so sánh, một quy trình hoặc vài bước đủ rõ tốt hơn nhiều chữ nhỏ. Ảnh ít chữ phải có ngữ cảnh; CV, bảng số liệu hoặc luồng đơn hàng phù hợp hơn biểu tượng robot lặp lại. Bảng/biểu đồ giả định cần nhãn và đơn vị nếu có số liệu.

Giữ font/lề/phong cách và logo; màu có thể thay đổi. Tỷ lệ 20/20 là mục tiêu cả đợt, không ép một bài so sánh vào ảnh ít chữ chỉ để luân phiên. Một mẫu có vài biến thể bố cục là đủ, không thiết kế lại từ đầu cho mỗi bài.

### 3.3. Kiểm tra toàn bộ quá trình tạo ảnh

Editor cần cho thấy dữ liệu nào sẽ xuất ra PNG. Bản thiếu font/tài sản hoặc tràn chữ không finalize. Khi sửa nội dung, xác nhận lại nghĩa caption–ảnh; phần mềm không có AI chỉ kiểm tra cấu trúc/trạng thái, không tự chứng minh ngữ nghĩa.

PNG final, checksum và phiên bản renderer đã được thiết kế đúng; giữ nguyên cách đăng tài sản dựng trước. Nghiệm thu gồm file gốc, bản thu nhỏ, caption đầy đủ và ảnh sau Facebook xử lý, không dùng preview trong editor làm bằng chứng duy nhất.

## 4. Workflow: những khoảng trống thực thi còn lại

### 4.1. Bảo trì và publish phải tranh cùng một quyền

V4.1 có page gate và backup maintenance, nhưng chưa mô tả đủ thao tác nguyên tử phối hợp hai phần. Đọc “không có request đang bay”, rồi đặt maintenance ở thao tác sau vẫn có cửa sổ cron ghi intent/gửi ở giữa.

Ví dụ: backup đọc trạng thái rảnh → cron giữ quyền gửi → backup đặt maintenance và export → Facebook trả thành công khi D1 bị export chặn. Hệ thống có unknown để tránh repost nhưng đây là sự cố có thể phòng trước bằng phối hợp quyền.

Đề xuất backup begin và publish intent cùng kiểm tra/cập nhật quyền thao tác authoritative trong D1: bên nào giữ quyền trước quyết định bên còn lại chờ. Backup giành quyền trước thì không có intent mới; publish có intent trước thì backup deferred, không export. Unknown đã tồn tại có thể được sao lưu, nhưng không giả định request chưa đăng. Chỉ kiểm tra page gate ở UI hoặc trước giao dịch chưa đủ.

Không phải thêm nền tảng: một giao thức dữ liệu dùng chung trong backend hiện tại là đủ. Hết lease không tự giải quyết tác động mạng hoặc export đang chạy.

### 4.2. Evidence đã lưu cần tác vụ tự hoàn tất

Tách evidence khỏi finalization là cải tiến đúng. Cần chỉ rõ ai tìm và xử lý evidence sau crash. Nếu chỉ có đường xử lý trong request ban đầu, có thể tồn tại evidence confirmed nhưng slot còn requested/unknown, usage/outbox chưa hoàn tất.

Đề xuất reconciliation/finalizer được scheduler chạy theo lô có giới hạn, ưu tiên xử lý trạng thái cũ trước publish mới. Gắn evidence với trạng thái pending/applied/conflict, error và lần xử lý; apply idempotent cùng ràng buộc publication/usage/outbox. Confirmed evidence đủ căn cứ không cần người dùng xác nhận lại chỉ vì worker chết. Evidence không đủ thì giữ unknown; không tự đoán thất bại.

Quan sát cả heartbeat của scheduler và tiến độ công việc: cron đang chạy không chứng minh lượt đăng được xử lý. Hiển thị age của evidence chưa applied/unknown và nguyên nhân chặn, không chỉ last_run.

### 4.3. Một bài/ngày có phạm vi kiểm soát

Ứng dụng có thể giới hạn request của mình; page gate không khóa việc người quản trị đăng trực tiếp trên Facebook. Kế hoạch đã thừa nhận bài ngoài hệ thống, nhưng cần quy tắc vận hành rõ hơn: trong giai đoạn tự động, ưu tiên đăng qua hệ thống; nếu cần bài thủ công, chủ động skip/pause ngày đó.

Nếu muốn hệ thống phát hiện trước khi gửi, có thể kiểm tra remote gần 10h khi API/quyền đã được thử; đây vẫn là kiểm tra best effort, không khóa được một người đăng sau bước kiểm tra. Kiểm tra lịch sử 8h các ID đã biết không tự phát hiện mọi bài mới ngoài hệ thống. Không hứa tổng fanpage luôn chính xác một bài/ngày khi nhiều bên vẫn đăng trực tiếp.

## 5. Kiến trúc và vận hành

### 5.1. Giữ ứng dụng gọn, có một hợp đồng trạng thái chính

Một Worker/backend theo mô-đun, D1 và R2 là hướng phù hợp. Không cần microservices, message broker mới hoặc AI chỉ để thực hiện workflow hiện tại.

Các quy tắc v4.1 nằm ở cả bảng trạng thái, schema, phần bổ sung và runbook. Đây là rủi ro tài liệu: người triển khai có thể làm theo bảng cũ bỏ qua evidence/usage/gate mới. Đề xuất một bảng chuyển trạng thái làm căn cứ chính với các cột: trạng thái trước, sự kiện/bằng chứng, điều kiện dữ liệu, thay đổi nguyên tử, hành động mạng được phép và đường phục hồi. Các mục còn lại tham chiếu bảng này. Không tạo thêm một lớp tài liệu chung nếu chỉ lặp nội dung.

D1 batch rollback khi câu lệnh lỗi nhưng UPDATE 0 dòng không tự tạo lỗi nghiệp vụ. Kế hoạch đã nhận diện điều này; triển khai phải có ràng buộc/conditional writes và test chứng minh mọi bước phụ thuộc claim thành công. Đọc kết quả batch rồi mới phát hiện claim thất bại có thể quá muộn nếu câu lệnh sau đã ghi trạng thái không đúng. Nguồn: [Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/).

### 5.2. Không giữ bảo trì suốt quá trình sao chép ảnh nếu không cần

Backup có ba pha khác nhau: lấy snapshot D1; sao chép/mã hóa tài sản bất biến; upload và xác minh gói. Cần tách database_export_finished khỏi backup_complete. Sau export kết thúc và DB hoạt động, có thể gỡ riêng maintenance của export, giữ pin tham chiếu tài sản đến khi complete/fail. Không tự gỡ pause/block/unknown.

Nếu chặn toàn ứng dụng tới khi tải hết ảnh lên GitHub, dữ liệu lịch sử lớn dần có thể biến backup thành nguyên nhân làm trễ đăng. Đây là điều cần cụ thể hóa, không phải khẳng định v4.1 bắt buộc khóa suốt các pha.

Daily, manual và pre-migration backup cần cùng cơ chế chống chạy chồng trên một environment. GitHub concurrency hỗ trợ kiểm soát các workflow; không cấu hình cancel-in-progress để tiện hủy backup/export hoặc migration đang chạy. Khóa ứng dụng vẫn cần cho các đường thao tác khác. Run bị hủy/crash cần runbook kiểm tra export và maintenance trước tiếp tục. Nguồn: [GitHub workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

### 5.3. Monitor ngoài Cloudflare cần nhớ cảnh báo ngay cả khi app chết

Monitor đọc health và gửi Telegram trực tiếp là đúng. Tuy nhiên chính sách gộp incident, ghi last_alert và gửi một tin phục hồi đòi trạng thái tồn tại giữa các run. Endpoint health read-only không tự cung cấp nơi ghi này; D1 không thể là nơi duy nhất lưu trạng thái khi đang giám sát D1/Worker mất khả dụng.

Trước production phải chọn cơ chế trạng thái tối thiểu ngoài Cloudflare cho monitor, hoặc công khai chấp nhận cảnh báo có thể lặp. Trạng thái gồm incident key/environment, first_seen, last_alert, recovery và kết quả giao tin; có serialization/retention. Chỉ lưu metadata, không thêm quyền đăng Facebook. Khi kho trạng thái lỗi, ưu tiên báo có thể lặp thay vì âm thầm coi đã báo.

Không cần vội thêm nhà cung cấp. Có thể thiết kế nơi lưu bền phù hợp GitHub/quota thực tế, nhưng không coi cache có thể mất là một sổ incident đáng tin. Mục tiêu là thực hiện lời hứa gộp cảnh báo, không phải thêm dashboard giám sát mới.

### 5.4. Telegram cần hợp đồng retry riêng

Ba lần cách nhau năm phút là chính sách Facebook cho lỗi đủ điều kiện, không mặc nhiên là chính sách mọi thông báo. Phân biệt lỗi tạm thời/rate limit với bot bị chặn, chat sai hoặc lỗi định dạng; ghi pending/retry/delivery_unknown/needs_action phù hợp. Telegram cung cấp retry_after cho flood control; cần tôn trọng giá trị đó. Nguồn: [Telegram Bot API](https://core.telegram.org/bots/api#responseparameters).

Nếu Telegram nhận tin nhưng ứng dụng mất phản hồi, retry có thể tạo tin lặp. event_id nội bộ không tự chống trùng ở Telegram. Chọn ưu tiên không bỏ sót thông báo, chấp nhận có thể lặp với cùng mã sự kiện; lưu message_id khi nhận được và không gọi lại Facebook. Tin ngắn gồm tiêu đề, đích, giờ và link như đã chốt; dùng plain text hoặc escape đúng định dạng để ký tự trong tiêu đề không làm hỏng tin.

## 6. Cải tiến theo mức ưu tiên

| Ưu tiên | Việc | Điều kiện đạt |
|---|---|---|
| P0 — trước hoàn tất luồng đăng/backup | Phối hợp maintenance và publish intent nguyên tử | Tranh chấp hai hướng chỉ cho một bên thao tác; không export khi request đang bay |
| P0 — trước nghiệm thu luồng phục hồi | Finalizer xử lý evidence tồn đọng | Crash sau evidence phục hồi publication/usage/outbox một lần, không gửi lại Facebook |
| P0 — trước phát hành | Bảng trạng thái chính và chứng minh conditional writes D1 | Claim 0 dòng không tạo trạng thái phụ sai; conflict vẫn giữ evidence |
| P1 — trước production | Tách pha backup, chống chạy chồng, khôi phục maintenance | Copy ảnh dài không giữ khóa DB thừa; kill workflow không tự mở publish |
| P1 — trước production | Trạng thái monitor và retry Telegram | App chết vẫn báo; gộp/nhắc/phục hồi có căn cứ; Telegram lỗi không repost |
| P1 — trước sản xuất cả kho | Năm caption/PNG thật và checklist di động | Đúng nguồn, đầu ra rõ, logo/tiêu đề đọc được, caption đầy đủ footer |
| P1 — trước bật lịch | Quy ước bài ngoài hệ thống và phạm vi một bài/ngày | Người dùng biết cách skip/pause khi đăng trực tiếp |
| P2 — sau đợt đầu | Điều chỉnh nội dung và công suất biên tập | Dựa phản hồi/mốc metric thống nhất và thời gian chuẩn bị, không tự đổi tỷ lệ |

Ưu tiên không có nghĩa mọi việc phải làm trước viết dòng code đầu tiên. Các giao thức P0 cần rõ khi triển khai mô-đun tương ứng; những kết quả live/benchmark chỉ có thể thu khi xây và chạy thử. Không biến thử nghiệm chưa thực hiện thành một cam kết đã đạt.

## 7. Tình huống nghiệm thu cần cụ thể hóa

Mở rộng các ca hiện hữu, không tăng số test để tạo cảm giác chắc chắn:

1. Backup begin và publish intent cùng lúc, đảo thứ tự hai bên: bên thắng giữ quyền, bên kia deferred/blocked, không có request mạng trái phép.
2. Facebook confirmed, evidence commit rồi worker chết: scheduler hoàn tất trạng thái/usage/outbox, không gọi publish lần hai.
3. Claim UPDATE 0 dòng nhưng câu lệnh sau vẫn có thể chạy: không tồn tại reservation/publication/outbox sai.
4. Export xong nhưng sao chép ảnh kéo dài: maintenance DB được gỡ có điều kiện; asset pin còn; bản backup chưa complete không dùng restore.
5. Hai backup daily/manual/pre-migration: không export chồng; hủy run không được tự resume.
6. Worker không trả health qua nhiều run: cảnh báo có trạng thái, không gộp giả; phục hồi đúng incident. Kho monitor state hỏng phải thể hiện giới hạn.
7. Telegram đã nhận nhưng mất phản hồi: lịch sử Facebook giữ một publication; tin có thể lặp cùng event ID, trạng thái không giả đã giao.
8. Người quản trị đăng trực tiếp: xử lý theo quy ước, không tuyên bố page gate khóa được Facebook bên ngoài ứng dụng.

## 8. Hướng triển khai khuyến nghị

Giữ phạm vi và các yêu cầu đã chốt: 10h đăng, 8h kiểm tra lịch sử, 30 chính +10 dự phòng, ba logo, footer, tỷ lệ, Google owner, Telegram, không AI runtime và CTĐT 3,5 năm khóa 2026. Kế hoạch đã đủ về hướng sản phẩm; nên cụ thể hóa các giao thức còn lại, làm năm mẫu và xây một luồng xuyên suốt trên staging trước hoàn thiện toàn kho.

Không tiếp tục mở rộng kế hoạch bằng tính năng mới. Đánh giá vòng tiếp theo nên dựa sản phẩm mẫu và các kết quả kiểm thử, vì thêm văn bản không chứng minh chất lượng content, độ đọc ảnh hoặc tính đúng của giao dịch.
