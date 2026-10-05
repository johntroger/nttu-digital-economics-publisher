# Đánh giá kế hoạch v4.0 trước triển khai

Ngày: 04/10/2026. Căn cứ: KE-HOACH-TONG-THE.md v4.0, THIET-KE-TRUOC-CODE.md, LICH-CONTENT-40-BAI.md và đánh giá v3.1. Đây là đánh giá thiết kế, chưa phải kết quả chạy thử. Tài liệu này không thay đổi kế hoạch tổng thể hay các lựa chọn đã chốt của người dùng.

## 1. Kết luận

Kế hoạch phù hợp với một fanpage và một người quản lý. Nội dung và ảnh chuẩn bị trước, không gọi AI khi vận hành, một bài mỗi ngày, Cloudflare chạy độc lập máy tính, GitHub quản lý phiên bản và phát hành. Không cần mở rộng sang nhiều dịch vụ hoặc thêm chức năng để tạo cảm giác hoàn thiện.

So với v3.1, v4.0 đã bổ sung đúng những phần quan trọng: xác nhận đăng thành công theo bằng chứng; xử lý kết quả đến muộn qua ngày; ưu tiên dự phòng; facts theo phiên bản; kiểm tra ảnh và caption; phân loại phạm vi sự cố; giám sát ngoài Cloudflare; sao lưu mã hóa; schema, API, wireframe và bản đồ kiểm thử. Không nên tiếp tục nêu những phần này như thể chưa có.

Khoảng trống còn lại tập trung ở ba chỗ: điều kiện an toàn phải được thực thi ở dữ liệu, các giả định về sao lưu/giám sát phải khớp nền tảng, và chất lượng bài/ảnh phải được chứng minh bằng sản phẩm thật. Có thể chốt các điều chỉnh thiết kế dưới đây rồi triển khai từng phần; không cần kéo dài bằng nhiều vòng kế hoạch tổng quát.

## 2. Content marketing

### 2.1. Chiến lược hợp lý nhưng chưa có bằng chứng về hiệu quả

Giữ tỷ lệ 70/30 sinh viên/học sinh và 80/20 kiến thức–kỹ năng–nghề nghiệp/giới thiệu ngành trong đợt đầu. Đây là giả thuyết biên tập phù hợp mục tiêu, chưa phải tỷ lệ đã được chứng minh tối ưu. Không đánh giá một bài thực hành và một bài giới thiệu ngành chỉ bằng cùng một chỉ số lượt thích.

Kho 40 bài hiện là brief, chưa phải 40 bài sẵn sàng. Nguồn trong lịch là điểm tra cứu, chưa chứng minh mọi phát biểu trong caption. Chỉ tính vào kho có thể đăng sau khi đủ caption, ảnh, nguồn/facts và kiểm tra nội dung–hình ảnh. Duy trì thông tin thời gian đào tạo 3,5 năm cho khóa 2026 theo xác nhận của người dùng; không suy diễn rằng mọi trang PDF gốc đã được sửa hoặc phê duyệt lại.

### 2.2. Chất lượng cần tiêu chí biên tập cụ thể

Mỗi bài nên đạt năm điều kiện trước khi ready:

1. Một nhu cầu rõ của đối tượng chính; không cố phục vụ tất cả trong cùng bài.
2. Một thông điệp chính, có ví dụ đủ cụ thể để hiểu.
3. Phát biểu về ngành/học phần/nghề có căn cứ; tình huống giả định được nhận diện rõ.
4. Một kết quả người đọc có thể mang đi: câu hỏi tự kiểm tra, lựa chọn, thao tác hoặc sản phẩm nhỏ phù hợp chủ đề.
5. Caption và ảnh cùng thông điệp; footer đúng nguyên văn và xuất hiện một lần.

Không cần chấm điểm số giả chính xác. Sai dữ kiện, cam kết việc làm/thu nhập, ví dụ bịa thành câu chuyện thật hoặc ảnh mâu thuẫn là lý do không ready dù bài hấp dẫn. Kiểm tra theo đợt và khi sửa, không thêm bước duyệt hằng ngày.

### 2.3. Tăng giá trị riêng của fanpage

Rủi ro marketing lớn hơn lỗi chính tả là nội dung đúng nhưng giống các trang hướng nghiệp khác. Tăng dấu ấn của ngành bằng liên hệ năng lực/học phần đã đối chiếu với một việc sinh viên có thể làm. Phân biệt mục tiêu đào tạo, gợi ý thực hành và hoạt động đã thực sự diễn ra; chỉ nhóm cuối mới được trình bày như thành tích hoặc sự kiện thật.

Ví dụ P06 phải cho người đọc tạo được brief dashboard ba dòng; P04 có cặp mô tả CV trước/sau nhưng không bịa số liệu; P27 dùng phép tính đơn giản để tách doanh thu và lợi nhuận. Đa dạng cách diễn đạt: tình huống, so sánh, hiểu lầm, bài tập và checklist, thay vì 40 bài đều có cùng cấu trúc ba gạch đầu dòng.

Bốn cặp P24/R10, P26/R02, P08/R05, P02/R03 đã có hướng tách trong đánh giá trước. Khi biên soạn phải kiểm tra khác biệt ở giá trị/đầu ra, không chỉ ở tiêu đề. Chống trùng trong lịch sử nên dựa concept, góc triển khai và bằng chứng; không chặn mọi bài cùng chủ đề.

### 2.4. Kho 40 bài là hữu hạn

Không tự tạo hoặc tái đăng nghĩa là vận hành lâu dài cần bổ sung theo đợt. 40 bài không đảm bảo 40 ngày đăng thành công: bài lỗi, hết hạn kiểm tra hoặc bị chặn có thể giảm số bài dùng được. Giao diện cần tách tổng bản ghi, bài đủ điều kiện và số ngày còn phủ được với nhịp một bài/ngày.

Giữ cảnh báo bắt buộc trước ba ngày theo yêu cầu. Có thể bổ sung cảnh báo sớm hơn như một lựa chọn sau khi đo thời gian thực tế để viết, kiểm tra và dựng một đợt mới. Không tự thay ngưỡng đã chốt hoặc tự thêm AI để bù kho.

## 3. Graphic design

### 3.1. Giữ nhận diện bằng bố cục, cho phép màu thay đổi

Ảnh vuông, ba logo ở trên cùng và màu theo chủ đề phù hợp. Nhận diện nên nằm ở dải logo, lề, font, cách đặt tiêu đề và phong cách minh họa. Thay màu không đồng nghĩa thay mọi thành phần giữa các bài.

Logo Trường nằm ngang trong khi logo Khoa/Ngành tròn, nên cân bằng diện tích nhìn thấy, không chia ba ô bằng nhau rồi ép cùng chiều cao. Không cắt hoặc vẽ lại logo. Dải nền sáng là phương án cần thử với tài sản gốc, không phải kết luận đã nghiệm thu. Đặc biệt không xóa nền trắng tự động nếu làm mất chi tiết trắng bên trong logo ngành.

### 3.2. Nghiệm thu trên sản phẩm thật

Ba mẫu ưu tiên: checklist, quy trình/so sánh và minh họa ít chữ. Kiểm tra PNG 1080×1080, bản thu nhỏ khoảng 360 px và ảnh sau đăng trên fanpage thử. Nội dung chính phải đọc được; ba logo phải còn nhận diện; không yêu cầu mọi chữ rất nhỏ trong logo tròn đều đọc rõ nếu kích thước gốc không cho phép.

Font tiếng Việt, độ tương phản, ngắt dòng và giới hạn nội dung phải được kiểm tra với tiêu đề dài thật. Renderer phải đợi font/tài sản tải xong trước khi xuất PNG; tràn nội dung giữ draft để chỉnh, không thu nhỏ chữ vô hạn. Ảnh sau Facebook xử lý có thể khác chất lượng bản PNG gốc, nên nghiệm thu trực quan trên fanpage thử.

### 3.3. Ảnh phải giúp hiểu chủ đề

Ảnh ít chữ vẫn cần ngữ cảnh: quy trình đơn hàng, đoạn CV, màn hình dữ liệu giả định hoặc một quyết định của sinh viên. Hình robot, bóng đèn và nền công nghệ lặp lại dễ tạo cảm giác chung chung. Infographic cần quan hệ, thứ tự hoặc so sánh rõ, không chỉ caption đặt lên nền màu.

Chọn loại ảnh theo nội dung; tỷ lệ 20/20 là mục tiêu cả đợt, không luật cứng cho từng ngày. Tách tiêu đề caption và tiêu đề ảnh như v4.0 đã quy định. Kiểm tra ảnh–caption là quyết định biên tập; phần mềm không có AI sẽ chỉ kiểm tra cấu trúc và trạng thái xác nhận, không tự chứng minh hai phần cùng nghĩa.

## 4. Workflow và kiến trúc: các điểm cần cụ thể hóa

### 4.1. Khóa một lượt lịch chưa đủ để khóa một fanpage

Thiết kế đã yêu cầu một job hoạt động mỗi slot và chặn fanpage khi unknown. Cần quy định cách thực thi nguyên tử ở cấp fanpage, vì hai slot qua ngày hoặc hai yêu cầu thử khác request_id vẫn có thể cùng vượt qua kiểm tra nếu chỉ khóa slot.

Đề xuất một cơ chế giữ quyền gửi theo page/environment, có job và generation. Claim, kiểm tra pause/unknown và cấp quyền gửi phải phối hợp trong cùng thao tác dữ liệu. Khi kết quả chưa rõ, giữ trạng thái chặn; chỉ giải phóng khi có căn cứ an toàn. Không giữ database transaction trong lúc gọi mạng. Trial có thể thực hiện nhiều lượt riêng biệt nhưng gửi tuần tự trên fanpage thử.

Đây là bổ sung điều kiện thực thi, không phải thay chính sách một bài/ngày hoặc đổi môi trường.

### 4.2. Bằng chứng Facebook không được mất vì lỗi giao dịch nội bộ

V4.0 nói rõ không bỏ bằng chứng khi conflict ngày thực tế hoặc worker mất lease. Tuy nhiên đường lưu bằng chứng khi giao dịch publication/slot/day guard/outbox thất bại chưa được cụ thể hóa.

Tình huống: Facebook xác nhận bài đã xuất bản; ứng dụng ghi nhận nhưng unique ngày thực tế xung đột, hoặc ownership đã đổi. Nếu toàn bộ giao dịch rollback mà bằng chứng chỉ nằm trong giao dịch đó, lần đối chiếu sau thiếu thông tin vừa nhận.

Đề xuất đường tiếp nhận bằng chứng riêng, có thể dùng attempts/evidence hiện hữu nếu đáp ứng yêu cầu, không nhất thiết thêm nhiều bảng. Lưu remote ID, request/job, thời điểm và kết quả chuẩn hóa theo cách idempotent; sau đó mới hoàn tất trạng thái nghiệp vụ. Cùng remote ID không tạo thành công mới; remote ID khác dù vi phạm ngày vẫn phải ghi nhận và mở sự cố. Worker mất quyền không sửa lịch tùy ý nhưng kết quả thật của yêu cầu đã gửi vẫn được tiếp nhận để đối chiếu.

Không có hệ thống lưu nội bộ nào đảm bảo ghi được lúc toàn bộ lưu trữ mất khả dụng. Trong trường hợp đó giữ intent/unknown, đối chiếu remote và chặn gửi mới; không tuyên bố exactly-once.

### 4.3. Khóa chống dùng lại cần theo bài gốc

unique(page_id, remote_id) chống ghi trùng phản hồi nhưng không tự ngăn cùng bài nội bộ được gửi hai lần với hai remote ID. Eligibility đã có điều kiện chưa đăng trên page; cần xác định nó dựa post_id gốc, không chỉ version_id.

Đề xuất bản ghi sử dụng thành công theo fanpage chính thức + post_id, có ràng buộc dữ liệu phù hợp. Sửa caption hoặc tạo version mới không biến bài đã đăng thành bài mới chưa dùng. Nếu phát hiện hai remote ID thật thì lưu bằng chứng cả hai, cảnh báo và không xóa dấu vết để thỏa unique. Trial giữ lịch sử riêng và không tiêu lượt sử dụng chính thức; bài thất bại đã xác minh, sửa hợp lệ, vẫn có thể quay lại dự phòng.

### 4.4. Sao lưu D1 cần chọn cơ chế nhất quán

Thiết kế đã chọn sao lưu mã hóa và manifest đầy đủ, nhưng yêu cầu “snapshot nhất quán” cần gắn với cách thực hiện. Lấy nhiều trang JSON nối tiếp trong lúc dữ liệu đang thay đổi không tự tạo snapshot nhất quán.

Cloudflare cho biết export D1 đang chạy sẽ chặn các yêu cầu khác tới database; export cũng có hạn chế với virtual tables như FTS5. Vì vậy không được coi tác vụ sao lưu là hoạt động nền luôn vô hại. Nguồn: [Cloudflare — Import and export data](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Đề xuất bản đầu dùng full export được nền tảng hỗ trợ, trong cửa sổ bảo trì phối hợp rõ; tránh thêm FTS5 vào database chính trước khi có giải pháp export phù hợp. Xác định quyền API export thực tế khi thiết lập, không giả định token đọc logic của ứng dụng tự đủ quyền nền tảng. Trước export không mở yêu cầu publish mới; xử lý hoặc chặn các lượt đang bay. Lịch chạy chậm, export quá lâu, xuất thất bại và khôi phục bảo trì phải có giới hạn và thông báo. Bảo trì không tự xóa pause do chủ tài khoản đặt.

Ảnh bất biến ở R2 theo checksum giúp sao chép tài sản sau snapshot; gói chỉ complete khi đủ dữ liệu và toàn bộ tài sản tham chiếu theo manifest. Không xóa tài sản đang được job sao lưu tham chiếu. Diễn tập restore thật trên staging là điều kiện production, không chỉ kiểm tra file tồn tại.

### 4.5. Miễn phí và thời gian phát hiện sự cố là giả định cần đo

Hourly monitor ở GitHub là cải tiến đúng, nhưng không có nghĩa báo lỗi trong 15 phút. Nếu ngưỡng stale là 15 phút và monitor chạy mỗi giờ, phát hiện có thể xảy ra sau khoảng 75 phút trong kịch bản bình thường, chưa tính chậm hàng đợi. GitHub nêu scheduled workflows có thể trễ hoặc bị bỏ khi tải cao. Nguồn: [GitHub — Troubleshooting workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).

Đề xuất thêm kiểm tra gần thời điểm đăng, ví dụ trước 10h và sau 10h, nếu quota cho phép; giữ hourly nền. Đây vẫn là best effort, không biến thành SLA. Sự cố Cloudflare có thể được GitHub phát hiện; sự cố GitHub đồng thời có thể ảnh hưởng monitor, backup và CI. Chấp nhận giới hạn này cho bản đầu hoặc nâng dịch vụ khi có nhu cầu thực tế.

Ba bản daily đầy đủ chứa cả kho ảnh/lịch sử sẽ lớn dần. Giới hạn upload 5MB là trần, không phải dung lượng trung bình. Ví dụ giả định 40 ảnh trung bình 1MB tạo khoảng 120MB ảnh cho ba bản; nếu trung bình 5MB thì khoảng 600MB, chưa tính dữ liệu khác. Cần đo dung lượng thật, thời gian chạy và quota tài khoản trước production. GitHub private Actions có hạn mức phút chạy/lưu trữ theo gói; xem [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Giữ tối thiểu ba bản hoàn tất như đã chốt. Một bản tuần dài hơn là lựa chọn có ích để phát hiện sai dữ liệu muộn, nhưng chỉ thêm nếu ngân sách cho phép. Phải theo dõi hạn hết hiệu lực artifact và thử người dùng tự tải/giải mã; không nói “giữ bản tốt” nếu nền tảng sắp tự hết hạn mà không báo.

### 4.6. Giao diện cần đơn giản hơn thiết kế dữ liệu

17 nhóm dữ liệu logic không phải 17 màn hình người dùng. Với một người quản lý, ưu tiên tổng quan, kho bài, lịch, lịch sử và cài đặt; nguồn/facts/phiên bản chi tiết mở khi cần. Luồng sửa bài nên hiển thị caption, ảnh và lý do chưa sẵn sàng cùng một chỗ.

Thông báo dùng ngôn ngữ hành động: “Chưa xác minh bài đã đăng, đang tạm dừng gửi để tránh trùng”; không yêu cầu người quản lý hiểu lease/generation/outbox. Khi sửa bài đang giữ lượt, giải thích bản sửa có dùng cho lượt hiện tại hay chỉ lượt tương lai. Duy trì xác nhận Google phía server và tách fanpage thử/chính thức đã có trong kế hoạch.

## 5. Thứ tự cải tiến và nghiệm thu

| Mức / thời điểm | Việc | Bằng chứng đạt |
|---|---|---|
| Trước lập trình luồng đăng | Khóa cấp fanpage; tiếp nhận evidence ngoài finalization; chống dùng lại theo post_id | Điều kiện dữ liệu, chuyển trạng thái và tình huống cạnh tranh đã rõ |
| Trước triển khai backup | Chọn snapshot/export, bảo trì và quyền dịch vụ | Quy trình không tự resume pause, không mất job đang bay, manifest đầy đủ |
| Trước làm hàng loạt content/ảnh | Hoàn thiện năm bài mẫu P02/P04/P05/P06/P08, ba kiểu ảnh | Đạt rubric, nguồn/facts đúng, đọc được trên điện thoại |
| Trước production | Fanpage thử, quyền Meta, khôi phục backup, benchmark/quota | Bằng chứng chạy thật; không dùng số test đã viết thay cho test đã đạt |
| Sau đợt đầu | Đánh giá nội dung và ngân sách lưu trữ | Thay đổi dựa trên phản hồi/số liệu, không chạy theo lượt thích đơn lẻ |

Bổ sung hoặc mở rộng các test đã có, không tăng số lượng một cách hình thức:

- Hai slot hoặc hai trial request tranh quyền gửi cùng fanpage: chỉ một request được gửi tại một thời điểm.
- Facebook thành công nhưng day guard/ownership xung đột: bằng chứng vẫn có, đối chiếu hoàn tất, không mở lượt gửi mới để bù sai.
- Bài đã đăng được tạo version khác: production không xem đó là bài chưa dùng.
- Backup xuất chậm hoặc bắt đầu muộn: hệ thống không gửi trong trạng thái lưu trữ không sẵn sàng, không tự gỡ pause và restore đủ ảnh/lịch sử.

Những thay đổi này không làm khác mục tiêu sản phẩm. Giữ đăng 10h Việt Nam, kiểm tra lịch sử 8h, ba lần thử cho lỗi phù hợp, dùng dự phòng cùng ngày, thông báo Telegram, footer bắt buộc, ba logo, không AI runtime và không tự tái đăng. Kết thúc bước thiết kế bằng các điều kiện có thể kiểm chứng; bước tiếp theo là sản phẩm mẫu và triển khai theo từng luồng, không thêm một vòng mở rộng phạm vi.
