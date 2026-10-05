# Đánh giá và đề xuất cải tiến workflow fanpage Ngành Kinh tế số

Ngày đánh giá: 04/10/2026.

Căn cứ: KE-HOACH-TONG-THE.md và các yêu cầu người dùng đã chốt. Đây là đánh giá thiết kế trước khi triển khai; chưa có kết quả thử nghiệm phần mềm hoặc dữ liệu hiệu quả fanpage. Các đề xuất thay đổi chính sách được phân biệt với yêu cầu đã chốt; bản kế hoạch gốc được giữ nguyên.

## 1. Nhận định chung

Workflow phù hợp để xây một hệ thống xuất bản nội dung giáo dục quy mô nhỏ: một người quản lý, một fanpage chính thức, một bài/ngày, nội dung và ảnh chuẩn bị trước. Việc dùng kho bài giúp giảm phụ thuộc AI, ổn định chi phí và giữ khả năng kiểm soát chất lượng. Giao diện quản lý, dự phòng, lịch sử và thông báo đã bao phủ phần lớn thao tác cơ bản.

Tuy nhiên, thiết kế hiện chưa đủ để khẳng định hiệu quả content marketing, tính nhất quán nhận diện hoặc độ tin cậy khi dịch vụ ngoài lỗi. Chưa nên triển khai nguyên trạng trước khi hoàn thiện phân loại lỗi, trạng thái chưa xác minh, quyền kết nối Meta, dữ liệu phiên bản, kiểm tra chất lượng kho và quá trình phục hồi.

| Góc độ | Điểm mạnh | Khoảng trống cần xử lý |
|---|---|---|
| Content marketing | Đối tượng rõ, tỷ lệ hợp lý, tài liệu đào tạo làm căn cứ | Thiếu mục tiêu từng bài, góc triển khai cụ thể và vòng đo lường |
| Graphic design | Có tài sản thương hiệu, ảnh vuông, hai nhóm định dạng | Chưa có hệ thống bố cục, tiêu chuẩn đọc trên điện thoại và quản lý mẫu |
| Workflow | Có retry, dự phòng, lịch sử và Telegram | Phân loại lỗi/chưa xác minh, phục hồi sự cố và cửa sổ bù còn cần cụ thể |
| Kiến trúc phần mềm | Quy mô nhỏ phù hợp một ứng dụng gọn | Cần ràng buộc dữ liệu, quản lý phiên bản, hàng chờ thông báo và thử nghiệm giới hạn miễn phí |

Không chấm điểm số vì chưa có sản phẩm hoặc dữ liệu vận hành; các nhận định ở đây là đánh giá chuyên môn về thiết kế.

## 2. Content marketing

### 2.1. Đăng đều chưa đủ để chứng minh giá trị

Một bài cần được thiết kế quanh một việc người đọc có thể hiểu hoặc thực hiện. Ví dụ “Tầm quan trọng của dữ liệu” quá rộng; “Ba câu hỏi trước khi dùng một biểu đồ để ra quyết định” có giá trị hành động và hình minh họa rõ hơn.

Đề xuất mỗi bài có: đối tượng chính, trình độ, vấn đề người đọc, thông điệp duy nhất, hành động sau khi đọc, nguồn, nhóm chủ đề và định dạng. Mục tiêu có thể là hiểu khái niệm, thực hành một kỹ năng, hình dung nghề nghiệp hoặc tìm hiểu ngành. Không ép mọi bài có câu hỏi/CTA và không biến mỗi bài thành quảng cáo tuyển sinh.

### 2.2. Cần tách chủ đề, mục tiêu và định dạng

Sáu nhóm chủ đề là khung khởi đầu phù hợp. Tuy nhiên, cùng một nhóm dữ liệu có thể có bài giải thích, checklist, tình huống sai lầm, bài thực hành hay bài nghề nghiệp. Xoay nhóm mà giữ một công thức mở bài và bố cục không tạo ra sự đa dạng thực chất.

Giữ tỷ lệ 80/20 và 70/30; bổ sung các tuyến: khái niệm dễ hiểu, thực hành nhỏ, sai lầm thường gặp, tình huống kinh doanh, hướng nghiệp và giới thiệu ngành có minh chứng. Không nhất thiết chia đều mọi nhóm. Lịch tuần là công cụ biên tập, không phải luật cứng theo thứ trong tuần.

Ví dụ một chuỗi ba bài dữ liệu: đọc bảng doanh thu → chọn chỉ số phù hợp → viết nhận xét kinh doanh. Bài dự phòng phải được gắn nhãn độc lập để không phá thứ tự một chuỗi kiến thức.

### 2.3. Hai nhóm người đọc cần độ sâu khác nhau

- Học sinh: dùng tình huống đời sống, giải thích thuật ngữ và liên hệ ngành học; tránh giả định đã biết quản trị, thống kê hoặc công cụ chuyên môn.
- Sinh viên: có bài thực hành, sản phẩm đầu ra, portfolio và tiêu chí tự đánh giá. “Biết Power BI” không cụ thể bằng “Tạo một dashboard trả lời ba câu hỏi kinh doanh và ghi rõ giới hạn dữ liệu”.
- Phân biệt nghề đầu vào và vị trí sau khi có kinh nghiệm. Không trình bày vị trí quản lý như kết quả mặc định ngay sau tốt nghiệp.

### 2.4. Cần quản lý căn cứ của từng tuyên bố

Nguồn CTĐT chứng minh ngành dạy gì và định hướng năng lực, không tự chứng minh nhu cầu tuyển dụng hiện tại, lương hoặc ưu thế so với trường khác. Khi cần các tuyên bố đó, phải bổ sung căn cứ đúng thời điểm và phạm vi; nếu chưa có thì viết theo định hướng và khả năng phát triển.

Mỗi bài ghi nguồn nội bộ theo tài liệu, mục/trang và phiên bản. Lưu ngày biên soạn, ngày rà soát và mức nhạy theo thời gian. Các số liệu kinh tế theo năm, giao diện phần mềm, tên sản phẩm AI và chính sách nền tảng có thể cũ dù chủ đề chung lâu dài.

Khi nhập kho, kiểm tra nhất quán tên ngành/chuyên ngành, phạm vi chương trình, mốc 2026 do người dùng xác nhận. Không tự sửa tài liệu gốc. Số liệu giả định trong tình huống phải ghi rõ là ví dụ, không trình bày như số liệu khảo sát.

### 2.5. Chất lượng cần được kiểm soát trước khi kho hoạt động

Giữ yêu cầu không duyệt từng ngày. Thay vào đó, trước khi đưa một đợt vào lịch, thực hiện kiểm tra nguồn, tính rõ ràng, trùng lặp, thuật ngữ, ảnh và phần cuối. Trạng thái “sẵn sàng” biểu thị đã hoàn tất kiểm tra kho, không bổ sung bước phê duyệt hằng ngày cho người dùng.

Tự động hóa chỉ kiểm tra được điều kiện hình thức và dữ liệu có cấu trúc. Không có AI hoặc người đọc thì không thể bảo đảm mọi câu đều đúng, mọi nội dung mới đều khác hoặc ý trên ảnh luôn khớp thân bài sau khi sửa tự do.

### 2.6. Phần cuối cố định cần được nhận diện là một đánh đổi

Phần cuối dài so với một bài ngắn, có thể làm bố cục nặng và khiến trải nghiệm đọc lặp lại. Đây là nhận định biên tập, không phải kết luận rằng Facebook giảm phân phối vì khối đó.

Giữ nguyên phần cuối bắt buộc theo yêu cầu. Cải thiện bằng mở bài cụ thể, phần thân gọn, xuống dòng hợp lý và khoảng cách phân tách khối liên hệ. Không thêm quảng cáo lặp ở phần thân. Chỉ thử phiên bản footer khác khi người dùng yêu cầu thay đổi chính sách.

### 2.7. Bổ sung vòng học từ kết quả

Bản đầu nên cho nhập kết quả thủ công theo bài: lượt tiếp cận nếu có, tương tác, chia sẻ, bình luận có nội dung và phản hồi quan tâm ngành. Dữ liệu được nhập ở cùng mốc thời gian để tránh so bài mới với bài đã tồn tại lâu. API Insights chỉ bổ sung sau khi kiểm tra được quyền và metric thực sự hỗ trợ.

Xem theo nhóm mục tiêu/đối tượng/định dạng, không chỉ xếp hạng tổng lượt thích. Khi dùng tỷ lệ tương tác theo reach, xác định trước tử số và mẫu số, không gọi đó là tỷ lệ người tương tác duy nhất nếu dữ liệu không hỗ trợ. Một tháng với một bài/ngày chưa đủ để kết luận chắc chắn về giờ đăng hoặc một thiết kế.

Mỗi đợt 30 ngày chọn những chủ đề/góc có phản hồi tốt, chủ đề cần viết rõ hơn và nội dung không phù hợp để sửa kho tiếp theo. Giữ 10h là lịch vận hành đã chốt, không gắn nhãn là giờ tối ưu khi chưa có dữ liệu.

## 3. Graphic design

### 3.1. Màu linh hoạt vẫn cần cấu trúc nhận diện

Giữ ba logo ở đầu, thay đổi màu theo nội dung. Những thành phần ổn định nên là vị trí logo, khoảng trắng, kiểu chữ, phân cấp tiêu đề, kích thước chữ và ngôn ngữ biểu tượng. Tạo một số phối màu hợp lệ để chọn, thay vì ngẫu nhiên mỗi bài một cách.

Đề xuất 4–6 mẫu khởi đầu là thông số thiết kế để thử, không phải chuẩn bắt buộc: thẻ khái niệm, checklist, quy trình, tình huống nghề nghiệp, hình minh họa chủ đạo và giới thiệu học phần/ngành. Hai mẫu trắng nền kết hợp minh họa có thể dùng lâu hơn một loạt hiệu ứng trang trí.

### 3.2. Ba logo phải cân bằng về cảm nhận

Logo Trường có tỷ lệ ngang xấp xỉ 3,38:1; hai logo còn lại gần hình tròn. Chia ba cột bằng nhau sẽ làm logo Trường nhỏ khó đọc hoặc hai logo tròn quá lớn.

Khởi đầu dùng vùng thương hiệu cao khoảng 160–190 px trên ảnh 1080 px, bố trí logo Trường rộng hơn, logo Khoa/Ngành nhỏ hơn; giữ nguyên hình ảnh và tỷ lệ. Đây là kích thước thử mẫu cần kiểm tra trực quan, không phải hướng dẫn thương hiệu chính thức. Khoảng trắng có thể lấy từ mép nét thực tế, không phải mép ảnh gốc.

Logo ngành hiện có nền trắng; dùng vùng đầu trắng giúp ghép nguyên bản. Hai PNG đã có alpha. Không xử lý toàn bộ pixel trắng thành trong suốt vì có thể mất chữ trắng/chi tiết bên trong logo. Không tự lược khẩu hiệu của logo Trường hoặc vẽ lại logo bằng AI nếu chưa được phép.

### 3.3. Kiểm tra ở kích thước điện thoại

Ảnh 1080 px khi thu về khoảng 360 px làm chữ giảm còn một phần ba. Có thể khởi đầu với tiêu đề 64–80 px, ý chính 36–44 px, lề 48–64 px; sau đó kiểm tra dấu tiếng Việt và bố cục ở bản thu nhỏ. Những con số này là điểm xuất phát, không thay thế kiểm tra thực tế.

Infographic nên có một thông điệp và 3–4 ý ngắn; bài cần nhiều chi tiết thì để caption giải thích hoặc chia thành chuỗi. Không ép mọi bài vào số chữ cố định, không thu chữ vô hạn để nhét nội dung. Nếu chữ vượt vùng, báo cần rút gọn hoặc chọn mẫu khác.

### 3.4. Minh họa phải giúp hiểu nội dung

Tránh dùng lặp robot, não số, tia sáng và biểu đồ tăng trưởng cho mọi bài. Bài dashboard có hình mô phỏng dashboard; bài hành trình khách hàng có sơ đồ điểm chạm; bài portfolio có hình cấu trúc sản phẩm. Có thể dùng icon và sơ đồ vẽ bằng mã, không cần AI trong lúc vận hành.

Khi biểu đồ dùng dữ liệu thật phải giữ nguồn và đơn vị; khi dùng dữ liệu giả định phải ghi “ví dụ minh họa”. Không dùng hình tăng trưởng như bằng chứng bảo đảm thu nhập. Hình mô phỏng giao diện không được khiến người đọc hiểu lầm đó là tính năng thực tế nếu chưa kiểm tra.

### 3.5. Dựng lại ảnh cần giới hạn rõ

Sửa trường tiêu đề/ý chính/nhóm/mẫu: có thể dựng lại PNG tự động. Sửa một đoạn thân bài tự do: chương trình không biết ý nào quan trọng hay hình cũ còn phù hợp nếu không có AI. Phải cho đối chiếu/nhập trường ảnh trong cùng màn hình; thể hiện rõ bản chưa sẵn sàng.

Lưu dữ liệu ảnh có cấu trúc, template_version, asset_version và file PNG cuối. Chờ font/ảnh tải xong trước khi xuất, kiểm tra PNG tạo được và tải lên thành công, rồi mới kích hoạt phiên bản. Không dựng lại ảnh lúc 10h hoặc trong retry.

## 4. Thiết kế workflow

### 4.1. Kho dự phòng xử lý được lỗi bài, không xử lý được mọi sự cố

| Nhóm lỗi | Ví dụ | Hành động phù hợp |
|---|---|---|
| Chưa sẵn sàng | Thiếu ảnh, sửa chưa hoàn tất | Giữ bài, lấy dự phòng; không tạo ba cuộc gọi đăng vô ích |
| Lỗi kỹ thuật thuộc riêng bài | Tệp hỏng hoặc dữ liệu bài không hợp lệ | Sửa kỹ thuật nếu xác định được; đánh dấu bài lỗi; dùng dự phòng khi hết lượt |
| Kết nối/quyền | Token mất hiệu lực, không có quyền | Dừng cho fanpage, báo người quản lý |
| Giới hạn dịch vụ hoặc lỗi tạm thời | Rate limit, sự cố nền tảng | Chờ theo dịch vụ; kiểm tra lại, không coi bài dự phòng là thuốc chữa lỗi kết nối |
| Kết quả chưa rõ | Gửi đăng rồi timeout | Xác minh kết quả trước mọi yêu cầu xuất bản tiếp theo |
| Thông báo | Facebook đã đăng, Telegram lỗi | Giữ thành công Facebook; chỉ retry Telegram |

Mã HTTP không đủ để quyết định; cần xét mã/lý do lỗi của dịch vụ, giai đoạn gửi và bằng chứng có thể đã xuất bản. Không sửa nội dung để né việc Facebook từ chối vì chính sách; đưa trường hợp đó vào xử lý thủ công.

Giữ ba lần và 5 phút làm mặc định cho lỗi đủ điều kiện. Đã có quy tắc dừng lỗi toàn fanpage; cần biến thành logic và kiểm thử, không chỉ ghi trong tài liệu.

### 4.2. Có trạng thái và điều kiện chuyển rõ ràng

Nội dung: nháp → sẵn sàng → đang dùng; bài lỗi → chờ sửa → dự phòng sẵn sàng. Lượt xuất bản: chờ → đang gửi → thành công/thử lại/chưa xác minh/thất bại/hủy. Telegram có trạng thái riêng. Bài vẫn tồn tại khi một lượt đăng thất bại; không trộn hai loại đối tượng.

“Gửi yêu cầu thành công” khác với “Facebook đã tạo bài”. Ghi thành công dựa trên ID và dữ liệu trả về hợp lệ; nếu cần đối chiếu bổ sung thì ghi rõ mức xác minh.

### 4.3. Cần khóa trước hành động bên ngoài và có phục hồi

Khóa lượt fanpage + ngày ở cơ sở dữ liệu; khóa bằng thao tác có điều kiện, không chỉ đọc rồi cập nhật. Lưu phiên bản dự kiến trước khi gọi Facebook. Khóa có thời hạn nhưng hết hạn không đồng nghĩa được phép đăng lại: lượt từng gửi phải được đối chiếu trước.

Tác vụ kiểm tra công việc đến hạn, nên nếu lịch kích hoạt muộn thì vẫn thấy lượt còn chờ. Mỗi invocation xử lý một lượng nhỏ, lưu next_attempt_at thay vì sleep. Nếu tiến trình chết sau khi Facebook đã tạo bài nhưng trước khi lưu kết quả, chuyển sang luồng đối chiếu.

### 4.4. Đăng bù cần giữ chất lượng và giới hạn vận hành

Ưu tiên bài cùng nhóm rồi nhóm khác đã chốt. Bổ sung điều kiện: sẵn sàng, chưa dùng trên fanpage đích, độc lập, phù hợp đối tượng, còn hiệu lực, không đang chờ xác minh và không bị cách ly. Chỉ tiêu tỷ lệ không quan trọng hơn chất lượng hoặc kết quả đăng.

Mười bài dự phòng trải trên sáu nhóm không bảo đảm nhóm nào cũng có bài sau nhiều sự cố. Có thể gắn nhóm chính và nhóm liên quan để chọn linh hoạt; không ép đổi chủ đề chỉ để đủ số.

Nếu ba bài khác nhau lỗi cùng một nguyên nhân, đề xuất mở một lần kiểm tra sức khỏe kết nối trước khi lấy bài tiếp theo. Nếu lỗi từng bài khác nhau và kết nối vẫn ổn, tiếp tục theo chính sách người dùng. Không tự áp đặt giới hạn ba bài dự phòng khi người dùng đã chọn tiếp tục.

Đề xuất cân nhắc cửa sổ đăng bù 10h–18h, thay vì có thể xuất bản sát nửa đêm. Đây là thay đổi chính sách cần người dùng lựa chọn; hiện kế hoạch đang cho bù đến hết ngày. Không tự thay lịch 10h hoặc giới hạn giờ đã chốt.

### 4.5. Ba bài còn lại có thể là quá muộn để sản xuất đợt tiếp

Giữ cảnh báo Telegram ở mức ba bài theo yêu cầu. Giao diện nên có thêm dự báo kho theo nhóm và số ngày lịch đã đủ bài; gợi ý chuẩn bị từ khoảng 7–10 ngày trước để có thời gian viết, kiểm chứng và dựng ảnh. Cảnh báo Telegram sớm hơn là tùy chọn, không tự bật.

Một bài sẵn sàng không bảo đảm một ngày thành công khi có lỗi. Dự báo phân biệt bài chính, dự phòng, lỗi và chưa xác minh; không hiển thị kho 40 bài còn nguyên khi một phần không đủ điều kiện.

### 4.6. Cần theo dõi hoạt động của chính scheduler

Nếu scheduler không chạy thì nó không thể tự gửi thông báo rằng nó không chạy. Lưu last_run, last_success, việc đến hạn quá lâu và hiển thị trên giao diện. Đề xuất dịch vụ giám sát độc lập kiểm tra trạng thái nếu muốn phát hiện lỗi khi toàn bộ ứng dụng dừng; không gọi cùng một scheduler là hệ thống giám sát độc lập.

Gộp cảnh báo lặp của cùng sự cố, nhưng vẫn bảo đảm thông báo thành công từng bài và thông tin các bài lỗi đúng yêu cầu.

### 4.7. Bài bị xóa cần trở thành dữ liệu biên tập

Giữ yêu cầu kiểm tra mỗi ngày và chỉ cập nhật lịch sử. Khi phát hiện bài không còn truy cập được, không kết luận lý do. Cho người dùng tùy chọn gắn lý do: sai thông tin, không phù hợp, trùng, xóa vì mục đích khác hoặc chưa rõ. Chỉ lý do đã xác nhận mới dùng để loại góc nội dung tương tự; không tự coi mọi bài bị xóa là chủ đề bị cấm.

### 4.8. Kiểm thử cần khác quy tắc sản xuất

Kế hoạch hiện ràng buộc nút “Đăng thử ngay” và lịch cùng giới hạn một bài/ngày. Điều đó hạn chế thử lại sau khi đã có một bài thử thành công.

Đề xuất chế độ thử nghiệm cho phép nhiều bài thử theo thao tác rõ ràng, mỗi lượt có ID và ghi log riêng; không tự ăn kho chính thức. Chế độ chính thức tiếp tục ràng buộc một bài/ngày. Fanpage đích được cố định theo lượt, không cho tác vụ đang chờ đổi mục tiêu sau chuyển cấu hình.

Khi chuyển môi trường, chỉ hủy tác vụ thử nghiệm chưa gửi. Lượt đã gửi nhưng chưa xác minh vẫn được đối chiếu với fanpage thử nghiệm và lưu lịch sử ở đó; không xóa trạng thái chờ hoặc gửi lại sang fanpage chính. Lượt kéo dài qua hết ngày không tự dồn sang slot mới; nếu kết quả chưa rõ, xử lý đối chiếu trước các yêu cầu xuất bản mới trên cùng fanpage.

## 5. Kiến trúc phần mềm

### 5.1. Một ứng dụng có các mô-đun rõ là đủ

Không cần microservices hoặc nhiều backend cho một người dùng. Một repo TypeScript, một giao diện và một Worker có mô-đun nghiệp vụ riêng giúp giữ đơn giản và có thể thay nền tảng sau này.

```text
apps/web                 giao diện và xuất ảnh
src/content              kho bài, phiên bản, nguồn và tương đồng
src/editorial            điều kiện sẵn sàng, kiểm tra và cách ly
src/scheduling           lịch và tác vụ đến hạn
src/publishing           trạng thái xuất bản, retry và dự phòng
src/integrations         Facebook, Telegram, Google
src/persistence          truy vấn D1 và lưu ảnh R2
src/observability        nhật ký, trạng thái sức khỏe và thông báo
templates                dữ liệu mẫu và phiên bản thiết kế
migrations               thay đổi cấu trúc dữ liệu
tests                    các nhánh nghiệp vụ có rủi ro
docs                     hướng dẫn thiết lập, vận hành và phục hồi
```

Không đặt toàn bộ logic retry trong route giao diện hoặc một hàm cron rất dài. Các hàm lựa chọn bài/phân loại lỗi được kiểm thử độc lập; các hàm gọi dịch vụ được thay bằng mô phỏng trong test.

### 5.2. Mô hình dữ liệu cần tách các vòng đời

| Đối tượng | Nội dung chính |
|---|---|
| posts | Danh tính bài, nhóm, đối tượng và tình trạng kho |
| post_versions | Thân bài, tiêu đề/ý ảnh, nguồn và phiên bản đã hoàn tất |
| assets | PNG, logo, minh họa, checksum và phiên bản mẫu |
| sources | Nguồn, thời điểm, vị trí dẫn và ghi chú xác nhận |
| page_connections | Fanpage, môi trường, trạng thái kết nối; bí mật nằm ở nơi phù hợp |
| schedule_slots | Ngày nghiệp vụ, thời điểm, fanpage, bài dự kiến và trạng thái |
| publish_jobs / attempts | Lượt gửi, số lần, lỗi, thời điểm thử lại và khóa |
| publications | ID Facebook và snapshot đúng phiên bản đã xuất bản |
| notification_outbox | Tin cần gửi, số lần và trạng thái Telegram độc lập |
| post_checks / editorial_notes | Kết quả kiểm tra Facebook và lý do biên tập đã xác nhận |

Đây là các đối tượng logic; không nhất thiết mỗi đối tượng là một bảng ngay trong bản đầu. Có thể gộp bảng khi vòng đời vẫn rõ, tránh thiết kế quá nhiều tầng chỉ để đủ danh sách.

Các ràng buộc tối thiểu: slot sản xuất duy nhất theo fanpage + ngày Việt Nam; việc giữ bài dự phòng có tính nguyên tử; chỉ một snapshot hoàn tất được dùng; khóa có điều kiện; một phiên bản/footer đã gửi được lưu nguyên vẹn.

Footer cần có phiên bản riêng hoặc được lưu đầy đủ trong snapshot. Đổi thông tin liên hệ không sửa lịch sử các bài đã đăng.

### 5.3. Tách Facebook khỏi Telegram bằng outbox

Khi lưu thành công xuất bản, đồng thời lưu sự kiện cần thông báo. Tác vụ Telegram đọc sự kiện và gửi riêng. Nếu gửi thất bại, thử lại tin; nếu tiến trình chết sau khi lưu Facebook thì tin vẫn còn để xử lý. Outbox và dữ liệu xuất bản cần được ghi đồng bộ bằng cơ chế cơ sở dữ liệu phù hợp.

Telegram cũng có thể mất phản hồi sau khi nhận tin, nên việc chống thông báo lặp là best effort nếu API không cung cấp cơ chế xác minh đầy đủ. Ưu tiên không lặp bài Facebook hơn việc hứa tuyệt đối không trùng một tin Telegram.

### 5.4. Lưu phiên bản trước khi gửi ra ngoài

Thực hiện: nội dung và ảnh hoàn tất → giữ slot/bài → ghi lượt xuất bản và snapshot dự kiến → gọi Facebook → ghi kết quả và thông báo. Không giữ giao dịch cơ sở dữ liệu mở trong thời gian đợi mạng. Khôi phục lượt đang gửi phải xem bằng chứng và đối chiếu trước retry.

Một thay đổi cấu hình sau đó không làm thay payload của lượt đang gửi. Việc sửa nội dung đã đăng là tính năng khác; hiện người dùng sửa kho bài, không tự sửa caption Facebook cũ.

### 5.5. Cloudflare miễn phí cần được đo đúng chỗ

Theo tài liệu hiện hành, Workers Free có giới hạn CPU 10 ms/lượt HTTP và cron; thời gian chờ mạng không tính vào CPU. Một lượt xử lý nhiều bài, tính tương đồng toàn kho hoặc parse payload lớn vẫn có thể vượt CPU dù số request thấp. Nguồn: https://developers.cloudflare.com/workers/platform/limits/.

Đề xuất SPA tĩnh, ảnh dựng trước trong trình duyệt, cron chỉ truy vấn việc đến hạn có chỉ mục và xử lý một lượng nhỏ; tách kiểm tra lịch sử thành lô. Không chạy cả hàng nghìn post trong một invocation, không dùng SSR/AI/dựng PNG trong cron.

Một cron kiểm tra mỗi phút để tìm tác vụ đến hạn là lựa chọn thiết kế có thể thử; logic next_attempt_at quyết định retry sau 5 phút. Dùng UTC cho timestamp và khóa ngày theo Asia/Ho_Chi_Minh. Cron Cloudflare dùng lịch UTC; thay đổi cấu hình cron có thể cần thời gian lan truyền, vì vậy điều khiển bật/tắt bằng cấu hình trong dữ liệu chứ không xóa cron mỗi lần bấm pause. Nguồn: https://developers.cloudflare.com/workers/configuration/cron-triggers/.

Không bảo đảm thời điểm Facebook hiển thị đúng 10:00:00. Theo dõi độ trễ so lịch và kiểm tra thực tế; SLA nếu có phải dựa vào đo đạc.

### 5.6. Đăng nhập Google và tài sản ảnh

Kiểm tra token đăng nhập ở máy chủ: issuer, audience, expiry, email đã xác minh và tài khoản cho phép; dùng phiên an toàn, OAuth state/PKCE tùy flow, bảo vệ các thao tác ghi khỏi yêu cầu giả mạo. Không tin email do trình duyệt gửi lên. Không áp dụng một luồng “Google login” chỉ bằng kiểm tra chuỗi email.

Không để quyền sở hữu ảnh phụ thuộc tệp Desktop hoặc URL phiên chat. Copy tài sản vào project, đưa ảnh đã hoàn tất lên kho triển khai. Ảnh Facebook cần được cấp qua cơ chế upload hoặc URL truy cập được theo luồng API đã kiểm chứng; không vô tình công khai toàn bộ giao diện hoặc tài liệu nguồn chỉ để Facebook lấy ảnh.

### 5.7. Sao lưu và triển khai cần thuộc bản đầu

Git không chứa bản sao của D1 hoặc mọi ảnh R2. Xuất kho bài, nguồn, lịch sử và manifest ảnh; thử phục hồi vào môi trường thử. Nhật ký không được chứa token. Dùng migrations có quản lý phiên bản và một lần diễn tập rollback cấu hình/lịch.

Không cần mua nhiều dịch vụ ngay từ đầu, nhưng tối thiểu phải tải được bản sao lưu và có hướng dẫn phục hồi. Sao lưu không nằm cùng điểm hỏng là phần cần bổ sung cho vận hành dài hạn.

## 6. Thứ tự ưu tiên cải tiến

P0: cần xử lý trước khi cho đăng tự động chính thức. P1: nên có trong bản đầu. P2: mở rộng sau khi có dữ liệu.

| Ưu tiên | Cải tiến | Kết quả cần kiểm chứng |
|---|---|---|
| P0 | Kiểm chứng quyền và luồng Meta với ảnh | Đăng thật trên fanpage thử và lưu ID hợp lệ |
| P0 | Phân loại lỗi, chưa xác minh và khóa slot | Không thử hết kho vì mất quyền; không đăng lại sau timeout chưa rõ |
| P0 | Snapshot nội dung/ảnh/footer và outbox | Sửa bài/Telegram lỗi không thay đổi kết quả đã đăng |
| P0 | Google allowlist ở máy chủ | Tài khoản ngoài không đọc/sửa được dữ liệu |
| P0 | Kiểm tra chất lượng toàn kho trước kích hoạt | 40 bài có nguồn, ảnh hoàn tất, phù hợp đối tượng |
| P1 | 4–6 mẫu và kiểm tra ở kích thước điện thoại | Logo cân bằng, chữ đọc được, không tràn |
| P1 | Bài có mục tiêu, mức độ và sản phẩm học tập | Giảm nội dung chung chung, tăng giá trị thực hành |
| P1 | Thử nghiệm cho nhiều lượt thủ công, tách môi trường | Debug được nhiều tình huống mà không ăn kho chính |
| P1 | Last-run, nhật ký, sao lưu và phục hồi | Phát hiện lịch trễ, khôi phục được dữ liệu |
| P1 | Thu kết quả nội dung thủ công và lý do loại bài | Có căn cứ cải thiện đợt tiếp theo |
| P2 | API Insights khi đủ quyền | Tự thu metric thực sự được hỗ trợ |
| P2 | Giám sát độc lập, tối ưu lịch/mẫu theo dữ liệu | Phát hiện ứng dụng ngừng và cải thiện có bằng chứng |

## 7. Luồng đề xuất sau cải tiến

```text
Biên soạn đợt bài từ nguồn và lịch sử
→ Kiểm tra nội dung, trùng lặp và nguồn
→ Dựng ảnh theo mẫu; kiểm tra bản thu nhỏ
→ Hoàn tất phiên bản; nhập 30 chính + 10 dự phòng
→ Xếp lịch và kiểm tra bài đủ điều kiện
→ 08h kiểm tra kết nối/lịch sử theo lô
→ 10h giữ lượt đăng và snapshot
→ Xuất bản Facebook
  → Thành công: lưu lịch sử + sự kiện Telegram
  → Lỗi riêng bài: retry / dự phòng
  → Lỗi kết nối: dừng kết nối / báo
  → Chưa xác minh: đối chiếu / giữ chờ
→ Thu phản hồi và số liệu
→ Dùng lịch sử/kết quả để biên soạn đợt kế tiếp
```

Không thêm phê duyệt hằng ngày. Mức cảnh báo 3 bài, lịch 8h/10h, tỷ lệ, footer, vị trí logo và chính sách dự phòng vẫn giữ. Những thay đổi chính sách như cửa sổ bù 18h, Telegram nhắc sớm hoặc nhiều bài thử/ngày cần được chốt riêng trước khi đưa vào bản kế hoạch triển khai.

## 8. Nghiệm thu phải kiểm tra sự cố, không chỉ một bài thành công

- Chạy thử lịch thật khi máy người dùng tắt và xác định được log thời gian.
- Mô phỏng Facebook nhận bài nhưng trả lời bị mất; chương trình chết trước/sau mỗi bước lưu; khóa hết hạn; hai invocation trùng nhau.
- Bài dự phòng đang được hai tác vụ chọn; lịch chính chưa sẵn sàng; nội dung thay ngay trước giờ đăng.
- Token/quyền lỗi toàn fanpage; rate limit; Telegram lỗi; lỗi cùng nguyên nhân trên nhiều bài.
- Hết bài; bổ sung nhỏ hơn ngưỡng; cảnh báo không lặp; chuyển fanpage khi còn job chờ.
- Sửa ảnh chưa tải xong/font chưa tải; nguồn ảnh bị mất; khôi phục kho từ backup.
- Tài khoản Google khác; gọi trực tiếp API ghi không qua giao diện.

Các test có thể tăng tốc thời gian retry bằng clock giả lập; không cần chờ 5 phút cho mỗi test. Live test kiểm tra quyền và luồng thực tế; mô phỏng kiểm tra các sự cố khó tái hiện. Không coi nhiều bài thử thành công là bằng chứng đã xử lý được timeout hoặc race condition.

## 9. Giới hạn của đánh giá

Chưa có dữ liệu reach/tương tác của fanpage, nên tỷ lệ, mẫu ảnh và các chuỗi bài là giả thuyết biên tập cần kiểm chứng. Chưa có ứng dụng Meta cấu hình thật; tài liệu trực tiếp Meta tiếp tục lỗi truy cập trong phiên đánh giá, nên không khẳng định trước toàn bộ yêu cầu xét duyệt hay quyền của ứng dụng. Chưa có benchmark Worker, nên mục tiêu miễn phí vẫn cần nghiệm thu thực tế.

Đề xuất xây bản đầu gọn nhưng có đủ kiểm soát xuất bản, căn cứ nội dung, ảnh đọc được và phục hồi. Sau khi chạy một đợt, cải tiến dựa vào cả chất lượng học tập, phản hồi người đọc và độ ổn định vận hành.
