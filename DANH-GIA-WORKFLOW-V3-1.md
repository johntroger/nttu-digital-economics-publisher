# Đánh giá workflow và kho content — phiên bản 3.1

Ngày đánh giá: 04/10/2026. Căn cứ: KE-HOACH-TONG-THE.md, LICH-CONTENT-40-BAI.md, DANH-MUC-NGUON-CONTENT.md và content/content-plan-40.json. Ghi nhận đính chính thời gian đào tạo **3,5 năm** cho khóa 2026. Đây là đánh giá thiết kế, không phải kết quả kiểm thử phần mềm hoặc xác nhận hiệu quả fanpage. Kế hoạch tổng thể chưa bị thay đổi bởi tài liệu đánh giá này.

## 1. Nhận định tổng thể

Thiết kế phù hợp quy mô một fanpage và một người quản lý: nội dung chuẩn bị theo đợt, ảnh dựng trước, một bài/ngày, GitHub quản lý phiên bản và Cloudflare vận hành. Bản hiện tại đã giải quyết phần lớn rủi ro từng được nêu: phân loại lỗi, pause, cố định phiên bản, kết quả chưa xác minh, khóa có generation, lịch sử bất biến, outbox, tách môi trường, restore dừng và CI/CD.

Đủ căn cứ để bắt đầu đặc tả và dựng luồng mẫu. Chưa đủ bằng chứng để gọi hệ thống ổn định, miễn phí hoặc hiệu quả marketing: chưa có code chạy, caption/ảnh hoàn chỉnh, quyền Meta được thử, benchmark hay dữ liệu người đọc. Không nên thêm nhiều tính năng; nên biến những quy tắc còn mơ hồ thành điều kiện dữ liệu và test.

| Lĩnh vực | Phần đã tốt | Khoảng trống chính |
|---|---|---|
| Content | Hai tỷ lệ, sáu nhóm, nguồn và brief 40 bài | Sản phẩm học tập cụ thể, độ khác biệt giữa các bài, thông tin chuẩn có cấu trúc |
| Design | Logo chuẩn, ảnh vuông, font/template/version và mobile QA | Chưa có mẫu thật; tiêu đề bài và tiêu đề ảnh chưa tách rõ trong dữ liệu hiện tại |
| Workflow | Retry/unknown/pause/pin/restore đã rõ | Định nghĩa thành công, kết quả đến muộn qua ngày, ưu tiên dự phòng và thời gian xử lý đối chiếu |
| Phần mềm | Mô-đun, D1/R2, GitHub và môi trường tách | Adapter Meta thật, schema/transition cụ thể, nghiệm thu và vận hành sau phát hành |

## 2. Content marketing

### 2.1. Giữ chiến lược, đánh giá chất lượng bằng sản phẩm

Tỷ lệ 28 SV/12 HS và 32 kiến thức/8 giới thiệu khớp. Kho có 14 bài mức hiểu, 21 áp dụng, 5 tạo sản phẩm; riêng lịch chính là 9/17/4. Đây là phân bổ hợp lý để thử, không phải bằng chứng tối ưu. Năm bài tạo sản phẩm chỉ đạt tên gọi nếu caption thực sự có đầu vào, yêu cầu, đầu ra và tiêu chí tự kiểm tra.

Đề xuất gắn mỗi bài một việc người đọc làm được trong khoảng ngắn phù hợp: viết brief dashboard ba dòng, sửa một dòng CV, phác quy trình hoặc hoàn thiện một trang dự án. P14/P26/P30 cần mẫu cụ thể thay vì kết thúc ở lời khuyên “hãy làm portfolio”. Không bắt người đọc mua công cụ/chứng chỉ để thực hiện bài cơ bản.

### 2.2. Nguy cơ bài đúng nhưng giống lời khuyên phổ thông

Các tiêu đề đã rõ, nhưng nếu nội dung chỉ có ba gạch đầu dòng, 40 bài có thể giống tài liệu hướng nghiệp rút gọn. Tăng độ cụ thể bằng tình huống sinh viên, cặp ví dụ chưa tốt/tốt hơn, câu hỏi tự kiểm tra và một sản phẩm nhỏ. Giữ giọng gần gũi, giải thích thuật ngữ khi xuất hiện lần đầu trong từng bài độc lập.

Không cần đưa hết danh mục nghề vào một bài. P13 có thể dùng cùng một cửa hàng giả định để phân biệt marketing, vận hành và kinh doanh; P27 phải có phép tính đơn giản minh họa vì doanh thu không tự chứng minh lợi nhuận. Mọi tình huống giả định ghi rõ.

### 2.3. Những bài cần kiểm tra khác biệt

| Cặp | Cách phân biệt đề xuất |
|---|---|
| P24 / R10 | P24 lập kế hoạch năng lực còn thiếu; R10 tự chấm bằng chứng đã có theo rubric ngắn |
| P26 / R02 | P26 đóng gói và trình bày dự án; R02 ghi nguồn/giả định/cách xử lý để người khác kiểm tra |
| P08 / R05 | P08 mô tả quy trình vận hành cho SV; R05 giúp HS nhận diện sở thích qua vai trò |
| P02 / R03 | P02 đánh giá kết quả AI; R03 thiết kế yêu cầu đầu vào và tiêu chí kiểm tra |

Ngoài chống trùng toàn kho, cần xem các bài cùng concept trong cửa sổ gần nhau khi chọn dự phòng. Có thể dùng cảnh báo biên tập theo khoảng gần đây và ưu tiên khác góc; không đặt lệnh chặn mọi bài cùng chủ đề hoặc ép một số ngày chưa được người dùng chốt.

### 2.4. Thông tin chuẩn phải cập nhật được theo quan hệ phụ thuộc

Đã ghi 3,5 năm trong ba tài liệu và JSON, nhưng một số trang PDF vẫn có thông tin cũ. Cần bộ facts có tên ngành/chuyên ngành, thời gian 3,5 năm, khóa 2026 và các dữ kiện khác đã đối chiếu; mỗi fact có nguồn/đính chính, ngày và phiên bản. Bài chỉ tham chiếu fact mình dùng.

Khi đổi fact, xác định các bản nháp/sẵn sàng bị ảnh hưởng để rà soát lại; không sửa snapshot đã đăng. Nếu một lượt đã pin có dữ kiện được xác nhận sai, chặn gửi mới của lượt đó và xử lý rõ theo pause/unknown trước khi dùng bản sửa. Không để quản lý phiên bản trở thành lý do tiếp tục phát thông tin đã biết sai. Đây là kiểm tra theo sự kiện, không thêm duyệt hằng ngày.

### 2.5. Footer và đo lường

Giữ nguyên footer bắt buộc. Vì khối này dài, phần thân cần đưa giá trị chính lên đầu và tránh lặp lời giới thiệu ngành trước footer. Bài hướng nghiệp không biến mục tiêu thu nhập tốt thành lời hứa kết quả.

Mỗi bài có mục tiêu để đọc metric: thực hành quan tâm đến phản hồi/sản phẩm; giới thiệu ngành quan tâm đến câu hỏi đúng nhu cầu hoặc hành động tìm hiểu; không đánh giá mọi tuyến bằng lượt thích. Nếu dùng UTM ở liên kết bổ sung trong thân bài, không thay URL footer và phải có số liệu phía website mới suy luận được hành động tiếp theo. Không coi tương tác là số tuyển sinh.

## 3. Graphic design

### 3.1. Thiết kế cần được chứng minh bằng ba mẫu thật

Luân phiên 20 infographic/20 ảnh ít chữ là mục tiêu đợt đầu, không phải luật chọn ảnh. Một quy trình cần bố cục bước; một so sánh cần hai vế; một bài tình huống cần hình có ngữ cảnh. Nếu mẫu sai cấu trúc thì đổi loại, cân đối cả đợt sau.

Tách title của caption khỏi image_headline ngắn hơn. Brief hiện có hướng ảnh, chưa có đầy đủ chữ trên ảnh. Nên thử ba mẫu: checklist, quy trình/so sánh và minh họa tình huống; mỗi mẫu có vùng nội dung và mức tràn rõ. Không dựng mỗi bài thành poster tiêu đề cộng bullet list.

### 3.2. Dải ba logo là ràng buộc cần đo thực tế

Logo Trường ngang, hai logo còn lại tròn; cân bằng kích thước nhìn thấy, không chia ba ô bằng nhau. Dải sáng phía trên là phương án thử phù hợp để giữ logo gốc. Các con số 160–190 px vẫn là điểm thử; nghiệm thu trên ảnh Facebook ở điện thoại rồi mới chốt. Không cắt chữ/khẩu hiệu hay vẽ lại logo để có thêm chỗ.

Giữ 2–3 font weight, hệ thống lề và phong cách biểu tượng; màu thay đổi trong các phối màu dễ đọc. Không để chủ đề kỹ năng nghề thành một bộ màu hoàn toàn khác bài giới thiệu khiến feed mất nhận diện.

### 3.3. Những tiêu chí ảnh còn cần cụ thể

- Chữ/logo không cắt, nội dung không chồng, dấu tiếng Việt đúng, font fallback không làm đổi bố cục.
- Ảnh xem được ở kích thước nhỏ; đủ nội dung trong caption để người đọc không phải đọc toàn bộ chữ trên ảnh.
- Có image_description hỗ trợ quản lý và tiếp cận nội dung; khả năng gửi alt text qua luồng Meta phải kiểm chứng trước khi cam kết.
- Khi sửa body, người biên tập xác nhận nội dung ảnh còn khớp dù không đổi chữ trên ảnh; phần mềm không tự hiểu ý nghĩa nếu không có AI.
- Lưu final PNG và metadata; không phụ thuộc việc browser phải render lại chính xác vào giờ đăng.

## 4. Workflow

### 4.1. Phải định nghĩa “đăng thành công” theo giai đoạn

Upload ảnh thành công không đồng nghĩa bài đã được xuất bản. Đề xuất tách asset_uploaded, publish_requested, confirmed_published và visibility_checked. Bằng chứng thành công phải gắn đúng fanpage, ID bài và luồng publish đã kiểm chứng; không chỉ HTTP 200 hoặc có ID ảnh.

Chốt ở test plan khi nào tiêu thụ slot và tạo sự kiện Telegram thành công. Sau khi có bằng chứng bài đã xuất bản thì khóa slot, kể cả Telegram/kiểm tra hiển thị sau đó lỗi. Mất khả năng đọc không chứng minh publish thất bại và không tự mở slot để đăng lại. Tài liệu Meta hiện vẫn không truy cập ổn định trong lần rà soát này; khả năng đối chiếu phải thử trên app/fanpage thật.

### 4.2. Kết quả đến sau nửa đêm

Ngừng gửi mới sau 23:59 không bảo đảm Facebook không hoàn tất một yêu cầu cũ sau 00:00. Ví dụ gửi hôm trước, ghi nhận đã xuất bản hôm sau: nếu vẫn đăng lượt hôm sau, fanpage có thể có hai bài trong ngày thực tế.

Lưu scheduled_business_date, requested_at, confirmed_at và remote_published_at nếu lấy được tin cậy. Đề xuất khi biết bài cũ thực sự xuất bản trong ngày mới, tính nó vào giới hạn ngày thực tế và đánh dấu lượt hôm nay được thay thế; bài chưa gửi giữ lại để xếp về dự phòng. Nếu chỉ nhận phản hồi muộn, phải phân biệt với xuất bản muộn. Nếu không xác định được, giữ đối chiếu, không đoán ngày. Chính sách này cần chốt trong đặc tả, hiện chưa tự áp dụng vào kế hoạch.

### 4.3. Kho dự phòng không đủ phủ mọi tình huống

10 bài dự phòng không bảo đảm 10 ngày liên tục; khi lỗi, nhiều bài có thể được sử dụng/cách ly trong cùng ngày. Theo phân bổ hiện tại, S/R/I có ít lựa chọn và một số nhóm chỉ có dự phòng cho SV. Nếu “phù hợp đối tượng” là điều kiện cứng, hệ thống có thể không chọn được bài cùng nhóm dù kho còn bài.

Đề xuất điều kiện cứng là chưa dùng, sẵn sàng, đúng đích, đủ nguồn/ảnh, không pending/blocked và độc lập. Nhóm, đối tượng và khoảng cách concept là ưu tiên mềm nếu bài vẫn phù hợp fanpage chung: cùng nhóm/đúng đối tượng → cùng nhóm/đối tượng khác → nhóm khác/đúng đối tượng → bài hợp lệ khác. Không vượt các chặn nội dung để đủ một bài/ngày. Cần xác định rõ bài có đối tượng phụ và tiêu chí thay thế.

### 4.4. Retry có giới hạn khác retry mù

Giữ 3 lần tổng cộng, 5 phút mặc định cho lỗi đủ điều kiện. Chuẩn hóa ảnh/kỹ thuật trước pin; không thay caption hay bytes PNG giữa retry. URL lấy ảnh có thể cần cấp lại nếu hết hạn nhưng phải trỏ đúng asset có checksum đã pin; kiểm chứng luồng upload để tránh lỗi URL tiêu hao dự phòng.

Nếu có lỗi chung của template, font, R2 hoặc footer, dừng cả nhóm bị ảnh hưởng thay vì coi mỗi bài là lỗi riêng rồi thử hết kho. Ghi phạm vi sự cố: một bản bài, một mẫu, một tài sản, một kết nối hay toàn hệ thống. Không đặt trần ba bài dự phòng vì trái yêu cầu đã chốt.

### 4.5. Unknown và lỗi thông báo phải xử lý được

Đối chiếu cần hiển thị người chịu trách nhiệm, hành động kế tiếp, bằng chứng, lần thử gần nhất và thời điểm cần chú ý. Giữ unknown không giới hạn mà không có mục xử lý sẽ làm lịch ngừng kéo dài. Đề xuất nhắc tình huống chưa xử lý theo chính sách chống spam, còn thời điểm nhắc là cấu hình cần chốt.

Nếu Telegram cũng mất kết nối, ghi trên tổng quan và outbox. Khi ứng dụng/scheduler chết hoàn toàn, nó không tự phát cảnh báo. Đề xuất ưu tiên giám sát độc lập sớm hơn P2 khi vận hành unattended; đây vẫn là khuyến nghị bổ sung, không giả định đã cài. Kiểm tra nhịp scheduler và trễ lượt, không chỉ trang web trả 200.

## 5. Kiến trúc phần mềm và GitHub

Một repo, một backend theo môi trường và các mô-đun hiện có là đủ. Giữ R2/D1 cho ảnh và trạng thái; không render ảnh hoặc gọi AI ở cron. D1 hỗ trợ batch rollback khi statement lỗi, nhưng điều kiện tranh chấp/UPDATE 0 dòng vẫn cần kiểm thử riêng. [Tài liệu D1](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Không thêm microservices hoặc queue chỉ để sơ đồ trông đầy đủ. Job đến hạn lưu D1 với trạng thái/owner; chia công việc thành bước có thể tiếp tục. Đặc tả trước schema: ready là bản nội dung+ảnh+nguồn hợp lệ; held là giữ nguyên tử; sending ghi durable trước gọi mạng; unknown không được giải phóng để gửi lại chỉ vì timeout.

### Bổ sung tối thiểu cho dữ liệu

| Dữ liệu | Mục đích |
|---|---|
| program_facts / fact_references | Đính chính như 3,5 năm có phiên bản và bài phụ thuộc |
| eligibility_reason / incident_scope | Biết vì sao bài bị chặn và lỗi ảnh hưởng bao nhiêu bài |
| scheduled_business_date / remote_published_at | Phân biệt ngày dự kiến và ngày xuất bản thực tế |
| image_headline / image_description | Dữ liệu thiết kế và khả năng mô tả ảnh |
| review_due_at / content_check_version | Nguồn hoặc nội dung thay đổi có thể làm bản ready hết hiệu lực |

Đây là trường/đối tượng logic, không bắt buộc tạo từng bảng riêng. Một hàm đánh giá đủ điều kiện dùng thống nhất cho UI stock, chọn bài, cảnh báo và giữ lượt; kiểm tra lại nguyên tử khi claim, không chỉ tin danh sách xem trước.

### Triển khai và chi phí

Luồng GitHub Actions → staging → release đã nghiệm thu → production phù hợp. Khi deploy, scheduler/API cùng phải tôn trọng schema và application_state; deployment không reset lượt, attempts, pause hoặc enabled. Đường import nội dung cũng cần validate, preview lỗi và mã phiên bản để không tạo trùng khi nhập lại cùng đợt.

Free Worker hiện có CPU 10 ms cho HTTP/cron và bộ nhớ 128 MB; network wait không tính CPU. Benchmark đặc biệt login, đọc JSON lớn, upload/đóng gói backup và similarity; không suy “một bài/ngày” thành chắc chắn nằm trong miễn phí. Export backup chia phần hoặc stream, không dồn mọi PNG vào RAM. [Giới hạn Workers](https://developers.cloudflare.com/workers/platform/limits/).

### Sao lưu và duy trì

Restore đã thiết kế đúng. Điểm yếu là lịch sao lưu và giám sát độc lập còn ở P2; người dùng muốn chạy khi máy tắt nhưng dữ liệu mới sau backup có thể chưa có bản sao. Đề xuất sao lưu trước migration/nhập đợt lớn/chuyển production là bắt buộc cho thao tác đó, còn sao lưu định kỳ độc lập cần đưa vào mức ưu tiên và tần suất được chốt. GitHub chỉ khôi phục code, không đủ khôi phục lịch sử ảnh và trạng thái gửi.

Cần checklist bảo trì: token/quyền/phiên bản API, dependencies, hạn mức lưu trữ, nguồn đã đến kỳ rà soát, unknown còn treo, last-run và dự phòng. Không mặc định token dùng mãi; kiểm chứng cơ chế theo app thực tế.

## 6. Ưu tiên cải tiến và nghiệm thu bổ sung

| Ưu tiên | Việc cần hoàn tất | Bằng chứng |
|---|---|---|
| Trước xây luồng publish | Adapter Meta: upload/publish/ID/link và success | Đăng/đọc lại trên fanpage thử; trường hợp mất phản hồi |
| Trước production | Ngày thực tế, nhận kết quả muộn và slot giới hạn | Test qua nửa đêm, không nhận confirmed_at làm remote time |
| Trước production | Hàm đủ điều kiện, ưu tiên dự phòng, phạm vi lỗi | Kho còn bài nhưng khác đối tượng; hỏng chung template/R2 |
| Trước đưa nội dung ready | Bộ facts và rà soát bài phụ thuộc | Đổi fact làm bài liên quan cần kiểm tra, snapshot cũ giữ nguyên |
| Trong mẫu đầu | Caption có bài tập, ảnh có headline, ba mẫu thực | Năm bài mẫu đọc được, có giá trị khác biệt và nguồn |
| Trước release | Tải, import lặp, migration/deploy và backup | Không reset lịch/attempt; import không trùng; export không quá RAM |
| Nên trước chạy unattended | Giám sát độc lập và nhịp backup | Phát hiện scheduler ngừng; phục hồi với dữ liệu đã đối chiếu |

Thử thêm sáu ca: phản hồi HTTP thành công nhưng mới có ID ảnh; bài hôm trước hoàn tất hôm sau; source/fact đổi khi bài đang pin; lỗi chung ảnh URL/template; chỉ còn reserve khác đối tượng; deploy/import giữa retry không làm reset lần thử. Các ca này bổ sung 28 ca đã có, không thay chúng.

## 7. Trình tự thực hiện đề xuất

1. Viết đặc tả ngắn cho những quy tắc mới và schema/transition, giữ nguyên yêu cầu đã chốt.
2. Biên soạn P02/P04/P05/P06/P08 có caption đầy đủ và 2–3 mẫu ảnh. Đối chiếu nguồn từng tuyên bố; chưa nhập ready chỉ vì có brief.
3. Chứng minh login → ready → publish fanpage thử → snapshot → Telegram trên cloud.
4. Chạy các test tranh chấp, unknown, pause, qua ngày, backup/restore và chi phí.
5. Mở rộng cả kho 40 bài, giao diện, release và hướng dẫn; chuyển chính thức sau nghiệm thu.

Không tự đổi lịch 10h/08h, footer, kho 30+10, hai tỷ lệ, 3 lần/5 phút hoặc bật AI. Không tự chốt giờ kết thúc bù sớm, nhắc kho sớm, giám sát/backup mở rộng hay xuất bản thật. Đánh giá này cho phép ưu tiên công việc, không chứng minh hệ thống đã vận hành ổn định.
