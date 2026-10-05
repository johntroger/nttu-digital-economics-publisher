# Đánh giá vòng hai — kế hoạch tổng thể phiên bản 2.0

Ngày: 04/10/2026. Phạm vi: thiết kế, chưa có phần mềm triển khai hoặc dữ liệu thử nghiệm. Đánh giá dựa trên phiên bản 2.0 của KE-HOACH-TONG-THE.md; không tự sửa kế hoạch hoặc những yêu cầu đã chốt.

## 1. Kết luận về mức sẵn sàng

Phiên bản 2.0 đủ rõ để bắt đầu thiết kế chi tiết và kiểm chứng tích hợp. Chưa đủ để triển khai tự động chính thức chỉ bằng cách viết mã theo mô tả hiện tại. Cần chốt quy tắc chuyển trạng thái, phục hồi và các điều kiện dữ liệu. Không cần tiếp tục mở rộng số lượng tính năng để khắc phục những điểm này.

Các vấn đề vòng trước đã được xử lý: mục tiêu từng bài, nguồn và kiểm tra kho, mẫu ảnh/kiểm tra điện thoại, phân loại lỗi, trạng thái chưa xác minh, snapshot/outbox, nhiều lượt thử thủ công, backup có tệp ảnh, Google allowlist và số liệu nội dung thủ công. Không coi chúng là khoảng trống chưa có.

| Lĩnh vực | Mức sẵn sàng của thiết kế | Công việc tiếp theo |
|---|---|---|
| Content marketing | Có chiến lược và quy trình kiểm tra cơ bản | Ma trận chi tiết, thang độ sâu và sản phẩm minh chứng |
| Graphic design | Có nguyên tắc và phạm vi mẫu | Mẫu thật, quy tắc chọn mẫu và kiểm tra trường hợp khó |
| Workflow | Có nhánh chính và phân loại sự cố | Quy tắc tạm dừng, sửa sát giờ, xếp lịch và xử lý chưa xác minh |
| Phần mềm | Có mô-đun và đối tượng dữ liệu phù hợp | Giao dịch cụ thể, quản lý tài sản và phục hồi an toàn |

## 2. Content marketing — cải tiến còn thiếu

### 2.1. Ma trận hai tỷ lệ cần được triển khai thành số bài giao nhau

28 sinh viên/12 học sinh và 32 kiến thức/8 giới thiệu ngành đang đúng về tổng. Chưa rõ các ô giao nhau; không nên để việc biên soạn quyết định ngẫu nhiên rồi chỉnh cuối đợt.

Phân bổ khả thi đề xuất, chưa phải tỷ lệ mới bắt buộc:

| Đối tượng / Nội dung | Kiến thức, kỹ năng, nghề nghiệp | Giới thiệu ngành | Tổng |
|---|---:|---:|---:|
| Sinh viên | 25 | 3 | 28 |
| Học sinh | 7 | 5 | 12 |
| Tổng | 32 | 8 | 40 |

Có thể tách lịch chính thành 19+2 bài cho sinh viên và 5+4 cho học sinh; dự phòng thành 6+1 và 2+1 tương ứng. Hai phần vẫn giữ 24/6, 8/2 và 21/9, 7/3. Mỗi bài có đối tượng chính để đếm, dù đối tượng phụ vẫn có thể hưởng lợi.

### 2.2. Cần thang độ sâu và chuỗi có sản phẩm

Gắn mức nhận biết, áp dụng, tạo sản phẩm vào hồ sơ. Ví dụ chuỗi dữ liệu: hiểu chỉ số doanh thu → làm sạch bảng nhỏ → dashboard/nhận xét cho portfolio. Một bài phải phù hợp mức và tiền đề, không dùng thuật ngữ nâng cao trước khi có ngữ cảnh.

Các bài có sản phẩm nên kèm checklist hoặc dữ liệu mẫu được chuẩn bị trước. Không cần thêm cổng học tập hoặc tạo file tự động hằng ngày; liên kết đến tài sản tĩnh hợp lệ là đủ. Giữ phạm vi fanpage.

### 2.3. Giới thiệu ngành cần minh chứng hơn lời mô tả

Tám bài giới thiệu có thể nối học phần → kỹ năng → hoạt động thực hành → hướng nghề. Nguồn CTĐT cho phép viết về nội dung học, không chứng minh mọi hoạt động đã diễn ra hoặc mọi sinh viên đã có kết quả.

Không dựng câu chuyện doanh nghiệp, cựu sinh viên, dự án thật hoặc thành tích nếu chưa có dữ liệu. Ví dụ giả định phải ghi rõ. Ngôn ngữ tích cực có thể giữ mà không biến thành lời hứa việc làm/thu nhập.

### 2.4. Chống trùng cần phân biệt sao chép với phát triển một chuỗi

Trùng toàn thân bài sau chuẩn hóa: chặn. Gần giống câu chữ: cảnh báo. Cùng chủ đề nhưng khác mức độ/góc/sản phẩm: có thể chấp nhận, không coi mọi bài AI hay dashboard là trùng.

Lưu concept_id/topic, angle, learning_level và quan hệ chuỗi. Không cần AI lúc vận hành. Quy tắc tương đồng không bảo đảm phát hiện paraphrase; nhận định nội dung vẫn thuộc biên tập trước nhập kho.

### 2.5. Đo lường cần gắn quyết định và chi phí vận hành

Mục 13 đã có nhập số liệu và thời điểm thống nhất. Cần thêm cách dùng kết quả: tiếp tục tuyến nào, viết lại mở bài nào, điều chỉnh độ khó nào, bổ sung tài liệu nào. Không tự động loại tuyến giới thiệu ngành chỉ vì ít lượt thích khi mục tiêu khác bài thực hành.

Đo cả thời gian chuẩn bị kho, thời gian người quản lý xử lý lỗi và số bài cần sửa. Hiệu quả hệ thống còn nằm ở việc giảm thời gian vận hành và nâng độ tin cậy, không chỉ tương tác.

Không tối ưu nhiều biến cùng lúc trong đợt nhỏ. Chọn một thay đổi để thăm dò, ví dụ mở bài tình huống so với giải thích khái niệm trong cùng nhóm. Đây là quan sát biên tập, chưa phải thí nghiệm chứng minh quan hệ nhân quả.

## 3. Graphic design — chuyển nguyên tắc thành đặc tả mẫu

### 3.1. Hai loại ảnh cần được gọi đúng

Không gọi mọi ảnh có vài dòng chữ là infographic. Mẫu quy trình, quan hệ hoặc so sánh nên thể hiện cấu trúc thông tin. Ảnh minh họa ít chữ dùng để tạo tình huống/thông điệp, không cần nhét ba gạch đầu dòng.

Chọn mẫu theo nội dung thay vì lịch luân phiên máy móc. Giữ mục tiêu luân phiên hai loại nhưng không dùng mẫu quy trình cho bài không có bước hoặc biểu đồ cho bài không có dữ liệu.

### 3.2. Cần bộ dữ liệu thử khó cho từng mẫu

Các kích thước trong kế hoạch là điểm khởi đầu hợp lý, chưa phải nghiệm thu. Mỗi mẫu phải được thử với tiêu đề dài, dấu tiếng Việt, bốn ý dài, hai ý ngắn, số liệu, từ tiếng Anh, logo trên nền màu, ảnh thiếu và minh họa bất thường.

Kiểm tra 1080 px, bản khoảng 360 px và ảnh đã upload Facebook trên điện thoại khi thử nghiệm. Tránh lệ thuộc độ nét bản gốc vì nền tảng có thể hiển thị hoặc xử lý khác.

Nếu không vừa: rút nội dung ảnh, chọn mẫu khác hoặc chuyển giải thích vào caption; không âm thầm thu chữ dưới ngưỡng mẫu.

### 3.3. Đóng gói font, tài sản và phiên bản renderer

Lưu font được phép sử dụng với dự án nếu điều kiện giấy phép cho phép, phiên bản mẫu, dữ liệu đầu vào và thông số xuất. Đợi font/hình trước render như kế hoạch đã nêu; bổ sung renderer_version để truy nguyên thay đổi.

Hình trên Canvas cần cùng origin hoặc CORS phù hợp khi xuất PNG. Tài sản có nguồn và quyền dùng, không chỉ URL. Lỗi export không được đánh dấu ảnh sẵn sàng.

Lưu PNG cuối, không bắt buộc mọi trình duyệt tái tạo file byte-identical. Checksum dùng xác minh file đã lưu, không phải bằng chứng nội dung học thuật đúng.

### 3.4. Không đổi toàn bộ mẫu một lần khi chưa có dữ liệu

Thử ba bố cục đại diện trước, chốt khả năng đọc và cân bằng logo rồi mở rộng lên 4–6. Dữ liệu chưa đủ để kết luận màu nào tạo tương tác cao; ưu tiên dễ đọc và khớp thông điệp. Giữ màu logo gốc, ba logo phía trên và không thêm tên ngành.

## 4. Workflow — các quy tắc cần cụ thể trước viết mã

### 4.1. Tạm dừng chưa được định nghĩa theo giai đoạn

Đề xuất:

| Tác vụ | Khi bấm tạm dừng |
|---|---|
| Chưa gửi / đang chờ retry / chưa chọn dự phòng | Không gửi mới; giữ lịch và trạng thái |
| Yêu cầu đã gửi Facebook | Không hứa hủy từ xa; vẫn thu kết quả |
| Chưa xác minh | Tiếp tục đối chiếu, không tạo yêu cầu đăng mới |
| Telegram cho bài đã thành công | Tiếp tục thông báo kết quả |
| Kiểm tra lịch sử | Tiếp tục theo chính sách hiện tại, vì không tạo bài mới |

Giao diện nói rõ “đã dừng các lượt gửi mới; lượt đang gửi có thể hoàn tất”. Trước mỗi yêu cầu gửi mới phải kiểm tra chế độ pause. Có một cửa sổ rất nhỏ giữa kiểm tra và gọi dịch vụ; không cam kết nút pause có thể thu hồi yêu cầu đã đi ra ngoài.

Khi bật lại, không tự dồn bài của những ngày người dùng chủ động tạm dừng. Phân biệt bỏ ngày có chủ ý với scheduler chạy muộn ngoài ý muốn.

### 4.2. Sửa sát giờ cần quy tắc đóng băng phiên bản

Lượt đang giữ/sending pin post_version và footer_version. Nếu người dùng sửa, tạo bản mới cho lượt sau; giao diện hiển thị lượt hiện tại sẽ dùng phiên bản nào. Trước khi giữ lượt, bản đang sửa chưa hoàn tất bị loại khỏi lựa chọn.

Nếu sửa trong khoảng retry, không âm thầm thay payload. Có thể hủy lượt chưa gửi, kiểm tra lại và tạo lượt mới; không reset số lần hoặc gửi mới cho lượt đang chưa xác minh. Bài bị từ chối rõ ràng được sửa rồi về dự phòng theo yêu cầu đã chốt.

### 4.3. Kho có bài nhưng ngày kế tiếp không có lịch

Hiện kế hoạch mô tả tự dùng dự phòng khi lịch chính kết thúc. Cần phân biệt slot trống do chưa xếp, slot bị người dùng bỏ và slot ngày qua.

Đề xuất slot có skip_reason hoặc trạng thái chủ động bỏ. Một slot chưa xếp trong lịch đang hoạt động có thể được tự điền từ dự phòng đủ điều kiện theo quy tắc đã chốt; slot bỏ có chủ ý không tự bù. Mọi quyết định tự điền được ghi log.

Khi bổ sung kho sau hết bài, chọn mốc tiếp tục, không tự bật cron đăng ngay trong lúc nhập dữ liệu. Cảnh báo stock và forecast tính theo ứng viên thực sự đủ điều kiện, không đơn thuần count(status='ready').

### 4.4. “Chưa xác minh” cần thao tác xử lý được

Thêm màn hình đối chiếu: fanpage, thời điểm gửi, caption/ảnh dự kiến, bằng chứng đang có, ID nếu có. Người dùng có thể xác nhận bài đã tồn tại với URL/ID được kiểm tra, hoặc chuyển xử lý khi có căn cứ chưa xuất bản.

Không coi việc tìm không thấy caption là bằng chứng chắc chắn chưa đăng. Cơ chế tự đối chiếu và dạng ID/API phù hợp phải được chứng minh bằng tích hợp thật. Nếu chưa thể xác minh, ưu tiên không tạo thêm bài, theo lựa chọn chống trùng đã có.

### 4.5. Quy tắc retry cần bảng kiểm cho adapter Meta

Ba lần và 5 phút đã chốt là mặc định cho lỗi đủ điều kiện. Lỗi nội dung hoặc file không thể thay đổi bằng chờ đợi phải được phát hiện trước hoặc cách ly theo bảng phân loại, không gọi ba lần cùng payload vô ích.

Lưu tổng lần yêu cầu xuất bản, giai đoạn upload/publish, nguyên nhân và bằng chứng. Nếu luồng thực tế gồm nhiều bước, retry của bước upload không được tự nhân thành nhiều lượt publish. Bản đầu nên chọn một luồng bài một ảnh rõ ràng và kiểm chứng ID bài, link bài cùng trạng thái hiển thị.

### 4.6. Chặn toàn kết nối cần đường phục hồi

Tách paused_by_user, blocked_by_connection, empty_stock và waiting_reconciliation. Sau đổi token có thể thử kiểm tra kết nối; không tự bật lịch đã bị người dùng pause. Sau phục hồi chỉ xử lý lượt còn hợp lệ trong ngày, không đăng dồn ngày cũ.

Ghi ai/khi nào đã bật lại và cảnh báo trạng thái; không đưa token vào log. Giám sát độc lập vẫn là hạng mục sau, không giả định Telegram luôn gửi được khi ứng dụng dừng.

## 5. Kiến trúc phần mềm — đảm bảo đồng bộ thật

### 5.1. Snapshot/outbox phải được ghi trong cùng giao dịch nội bộ

Cloudflare D1 batch có cơ chế thực hiện các câu lệnh theo giao dịch và rollback khi một câu lệnh lỗi. Có thể dùng để ghi publication, hoàn tất slot và tạo outbox đồng bộ. Cần kiểm tra điều kiện slot/khóa vẫn hợp lệ; một UPDATE đổi 0 dòng không nhất thiết tự báo SQL error.

Nguồn: https://developers.cloudflare.com/d1/worker-api/d1-database/.

Đây là giao dịch D1, không bao trùm R2 hoặc Facebook. “Đã dùng transaction” không giải quyết mất phản hồi dịch vụ ngoài.

### 5.2. D1 và R2 cần quy trình hoàn tất tài sản riêng

Đề xuất: tạo phiên bản nháp → upload ảnh theo key mới → kiểm tra file/metadata → cập nhật asset và post_version hoàn tất → cho phép ready. Không ghi đè key ảnh lịch sử bằng file mới.

Upload thành công nhưng ghi D1 lỗi sẽ để tệp mồ côi. D1 có tham chiếu nhưng ảnh thiếu thì bài phải bị chặn. Cần kiểm tra đối soát và dọn tệp mồ côi có thời gian đệm; không xóa bất kỳ ảnh còn được publication, bản sẵn sàng hoặc backup đang thực hiện tham chiếu.

Nguồn API tài sản: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/.

### 5.3. Khóa có thời hạn cần chống tiến trình cũ

Một tiến trình cũ chậm có thể quay lại sau khi khóa hết hạn và một tiến trình mới đã nhận lượt. Cần owner token/generation và cập nhật có điều kiện, không chỉ locked_until. Tiến trình mất quyền khóa không được làm thao tác mới hoặc ghi đè kết quả hiện tại.

Nếu tiến trình cũ đã gửi Facebook thì còn phải đối chiếu; generation không thu hồi được hành động ở dịch vụ ngoài. Tách quyền xử lý nội bộ và trạng thái gửi ngoài.

### 5.4. Khôi phục sao lưu có thể làm đăng lại bài

Ví dụ backup lúc 09h, Facebook đăng lúc 10h, rồi phục hồi backup. Dữ liệu khôi phục coi bài vẫn chờ dù Facebook đã có bài.

Restore phải mặc định khóa xuất bản và vô hiệu hóa việc gửi lại các outbox/job được nhập cho đến khi đối soát. Kiểm tra lượt sau mốc backup, trạng thái remote và đích môi trường; xác định mốc bật lại. Đăng mới chỉ sau khi dữ liệu đã đối soát. Không tự resume cron dựa vào trường enabled trong backup.

Phục hồi vào thử nghiệm cũng cần vô hiệu hóa kết nối/đích chính thức để không phát tin hoặc đăng thật từ dữ liệu được nhập.

### 5.5. Thử nghiệm/phần mềm cần tách môi trường rõ hơn nhãn UI

Có thể cùng repo, nhưng tách DB/R2 hoặc namespace/bindings đủ rõ và bí mật/cấu hình theo môi trường. Runtime thử không được dùng token/đích chính thức mặc định. Chuyển đích không phải chỉ sửa Page ID.

Không bắt buộc tăng thành nhiều ứng dụng lớn; cấu hình triển khai tách và kiểm tra môi trường là đủ cho quy mô này. Kiểm thử integration xác minh đích trước khi gửi.

### 5.6. Miễn phí cần điều kiện nghiệm thu, không chỉ benchmark chung

Kế hoạch đã ghi giới hạn CPU và cần benchmark. Bổ sung tải đại diện: kho ban đầu 40 bài, lịch sử giả lập lớn hơn, tải ảnh, login/refresh, một lượt đăng, outbox, kiểm tra lịch sử theo lô và export backup.

Theo dõi phân bố CPU và các lần vượt giới hạn, không chỉ trung bình; có khoảng dự phòng dưới giới hạn thay vì hoạt động sát trần. Nếu không đạt, trước hết giảm công việc mỗi invocation và tối ưu truy vấn. Khi vẫn không đạt, người dùng chọn giới hạn tính năng hoặc gói trả phí; không hứa giữ miễn phí bằng bỏ các kiểm soát chống trùng/phục hồi.

Workers Free hiện giới hạn 10 ms CPU/lượt HTTP và cron; chờ mạng không tính CPU. Nguồn: https://developers.cloudflare.com/workers/platform/limits/.

### 5.7. Dữ liệu và bản nháp không cần quá nhiều bảng

Giữ kiến trúc mô-đun hiện có. Chốt số bảng theo vòng đời thực, không theo tên mục trong tài liệu. Nên ưu tiên rõ posts/versions, assets, slots/jobs/attempts, publications và outbox; metadata biên tập có thể lưu có cấu trúc mà không cần quá nhiều quan hệ.

Ghi các bất biến trong đặc tả: không chọn bản chưa hoàn tất; slot chính thức duy nhất; không xuất bản khi pause/block/unknown; snapshot không đổi; retry không đổi payload; bản restore không tự gửi; lịch sử thử không đánh dấu sử dụng chính thức.

## 6. Cải tiến quy trình xây dựng

Không nên viết đủ 40 bài và làm tất cả màn hình trước khi chứng minh luồng cốt lõi.

1. Chọn 3–5 bài mẫu đại diện và 2–3 bố cục, đủ logo/footer/nguồn.
2. Hoàn thành một lát cắt: đăng nhập → bài/ảnh sẵn sàng → slot/lượt thử → Facebook → lịch sử → Telegram.
3. Kiểm thử mất phản hồi, dừng giữa chừng, thử lại, pause, sửa sát giờ và phục hồi backup.
4. Chạy lịch thật trên đám mây với fanpage thử nghiệm, đo tải.
5. Khi kiến trúc và mẫu đạt yêu cầu, mở rộng 40 bài, 4–6 mẫu và giao diện quản lý đầy đủ.
6. Chuyển chính thức sau nghiệm thu, rồi đánh giá đợt nội dung.

Thứ tự này giảm việc viết lại ảnh/nội dung theo mẫu chưa ổn hoặc hoàn thành nhiều giao diện trước khi quyền Meta được kiểm chứng. Mục tiêu cuối vẫn 40 bài và toàn bộ chức năng đã chốt; không thu hẹp thành chỉ demo.

## 7. Ưu tiên và nghiệm thu bổ sung

| Mức | Cải tiến | Tình huống kiểm thử |
|---|---|---|
| Cần trước production | Pause theo giai đoạn; phiên bản pin; slot trống/skip | Pause lúc gửi/retry; sửa lúc 09:59; bật lại sau vài ngày |
| Cần trước production | Đối soát kết quả chưa rõ có thao tác | Timeout remote, xác nhận ID đúng/sai, không có bằng chứng đủ |
| Cần trước production | Giao dịch D1 + tài sản hoàn tất + owner generation | D1/R2 lỗi xen kẽ; lock hết hạn; worker cũ quay lại |
| Cần trước production | Restore mặc định dừng và đối soát | Backup trước khi đăng, phục hồi sau khi đăng; không phát lại |
| Nên trong bản đầu | Ma trận nội dung, mức độ, minh chứng | Đếm đủ tỷ lệ; bài dự phòng độc lập; nguồn đúng phạm vi |
| Nên trong bản đầu | Mẫu và tài sản khó; export ổn định | Dấu tiếng Việt, tiêu đề dài, CORS, font tải lỗi |
| Nên trong bản đầu | Nghiệm thu chi phí và vận hành | CPU/hạn mức, lịch sử lớn, mất Telegram, export/restore |

## 8. Giữ nguyên và những lựa chọn còn mở

Giữ 8h kiểm tra, 10h đăng, 3 lần/5 phút mặc định theo loại lỗi, 30+10 bài, hai tỷ lệ, ba logo phía trên, footer, Google allowlist, Telegram thành công, ngưỡng 3 bài, không duyệt hằng ngày và không AI vận hành.

Giờ kết thúc bù 18h, Telegram nhắc sớm và giám sát độc lập vẫn là các lựa chọn ở mục 15 của kế hoạch; không tự chốt lại trong đánh giá này. Một bài/ngày là giới hạn của hệ thống tự động, không thể bảo đảm fanpage không có bài khác do người quản trị đăng trực tiếp ngoài hệ thống.

Kết quả đánh giá chỉ chứng minh độ rõ của thiết kế và các cải tiến cần có; độ tin cậy, miễn phí và hiệu quả nội dung phải được xác minh bằng sản phẩm, thử nghiệm và dữ liệu thực tế.
