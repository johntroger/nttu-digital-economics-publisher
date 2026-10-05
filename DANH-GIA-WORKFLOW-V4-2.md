# Đánh giá workflow v4.2 — mức sẵn sàng triển khai

Ngày: 05/10/2026. Căn cứ: KE-HOACH-TONG-THE.md v4.2, THIET-KE-TRUOC-CODE.md và LICH-CONTENT-40-BAI.md. Đây là rà soát tài liệu, chưa phải kiểm thử phần mềm, nghiệm thu hình ảnh hoặc đo hiệu quả fanpage. Không sửa kế hoạch tổng thể trong lượt đánh giá này.

## 1. Kết luận

Ở mức tài liệu đã rà soát, không thấy mâu thuẫn nghiệp vụ lớn cần đổi chiến lược hoặc kiến trúc. Phạm vi phù hợp một fanpage/một người quản lý. V4.2 đã tích hợp các điểm quan trọng: page gate, quyền bảo trì–gửi nguyên tử, evidence/finalizer, usage theo bài gốc, retry riêng Telegram, backup theo pha và trạng thái monitor ngoài Cloudflare.

Một bài/ngày là bài tự động; admin đăng trực tiếp là phần bổ sung, không tiêu slot/kho/day guard hoặc làm dừng lịch. Không đưa lại khuyến nghị skip/pause vì có bài thủ công. Unknown chỉ liên quan yêu cầu hệ thống chưa xác minh; nhiều bài trên fanpage không tự chứng minh hệ thống đăng trùng.

Kế hoạch đủ hướng để triển khai theo từng phần. Những bất định chính còn là quyền/khả năng API thực tế, ràng buộc dữ liệu chạy thật, dung lượng/chi phí, chất lượng năm mẫu và công sức quản lý. Không thể giải quyết chúng chỉ bằng thêm văn bản. Không chấm điểm số hoặc kết luận ổn định/miễn phí/hiệu quả khi chưa có bằng chứng.

## 2. Content marketing

### Điểm mạnh

Đối tượng, hai tỷ lệ, sáu nhóm và 40 brief đã được phân bổ có lý do. Evergreen phù hợp kho chuẩn bị theo đợt; nguồn CTĐT/cẩm nang giúp hạn chế nội dung chung chung. Learning outcome, concept/góc triển khai và rubric tạo cơ sở để biên tập và tránh trùng. Facts 3,5 năm cho khóa 2026 được ghi nhận theo xác nhận của người dùng; tài liệu gốc giữ nguyên.

### Hạn chế chưa thể đánh giá bằng brief

Brief không thể chứng minh mở bài hấp dẫn, ví dụ dễ hiểu hoặc bài giúp người đọc làm được việc gì. Một bài đúng nguồn vẫn có thể khó đọc hoặc quá rộng. Năm mẫu phải có cả caption và ảnh final; không nghiệm thu từ tiêu đề/metadata.

Tỷ lệ 70/30 và 80/20 là lựa chọn thử nghiệm, không chứng minh hiệu quả. Footer có ở mọi bài nên phần thân cần tạo giá trị ngay đầu; giữ nguyên footer, không rút gọn hoặc sửa để tối ưu marketing khi chưa được người dùng yêu cầu.

### Cải tiến đề xuất

- Với từng mẫu, viết một dòng nội bộ: “Đối tượng nào, trong tình huống nào, mang đi điều gì?”. Không bắt caption nào cũng mở bằng cùng câu hoặc có CTA.
- Đầu ra phải nhìn thấy được: P06 là brief ba dòng; P04 là dòng CV có căn cứ; P08 là hiểu một quy trình đơn hàng; P05 là hiểu mối liên hệ kinh doanh–công nghệ; P02 là biết kiểm tra một đầu ra AI.
- Giới thiệu ngành dùng học phần/năng lực đã đối chiếu; phân biệt mục tiêu, gợi ý thực hành và hoạt động thật. Không biến cơ hội nghề nghiệp thành lời hứa thu nhập/việc làm.
- Kiểm tra sự khác biệt bằng nội dung/đầu ra, không chỉ tiêu đề. Dự phòng cùng nhóm có thể dùng góc khác; không cấm mọi bài cùng chủ đề.
- Sau mẫu, đo thời gian viết, đối chiếu, dựng và sửa; dùng dữ liệu này để dự báo bổ sung kho. Giữ cảnh báo ba ngày. Nếu muốn cảnh báo sớm hơn thì vẫn là lựa chọn riêng, không tự thay ngưỡng.

Kho 40 bài hữu hạn: không tự sinh và không tái đăng đồng nghĩa cần biên tập đợt tiếp theo. “Tự động đăng” khác “tự động làm toàn bộ công việc content”. Đây là phân công cần thể hiện rõ khi bàn giao.

## 3. Graphic design

### Điểm mạnh

Ảnh vuông, ba logo nguyên bản cùng hàng trên, màu linh hoạt và nhận diện qua bố cục/font/lề là hướng hợp lý. Dựng PNG trước rồi lưu checksum giúp luồng đăng không phụ thuộc browser đang mở. Caption title và image headline được tách đúng.

### Giới hạn hiện tại

Chưa có PNG mẫu nên chưa kết luận hàng logo cân bằng, tiêu đề đọc được hoặc bố cục đạt trên Facebook. Các kích thước đề xuất chỉ là baseline thử. Logo Trường ngang và hai logo tròn không thể cân bằng chỉ bằng cùng chiều cao.

### Cải tiến đề xuất

Nghiệm thu ba mẫu bằng tài sản gốc: checklist, quan hệ/quy trình/so sánh và minh họa ít chữ. Mỗi ảnh có một thông điệp; không đưa toàn bộ caption lên ảnh. Biểu đồ giả định phải có đơn vị/nhãn phù hợp; ảnh ít chữ có ngữ cảnh của bài. Giữ màu/logo gốc và chi tiết trắng, không vẽ lại để có thêm chỗ.

Kiểm tra file 1080×1080, bản khoảng 360px, caption đầy đủ footer và ảnh sau Facebook xử lý. Chữ nội dung đọc được, logo nhận diện được; không yêu cầu đọc hết chữ rất nhỏ trong logo tròn. Font/tài sản thiếu hoặc tràn chữ giữ draft, không tự thu chữ vô hạn. Xác nhận nghĩa caption–ảnh vẫn là việc biên tập vì không có AI runtime.

Nên tạo một phiếu nghiệm thu cho mỗi mẫu gồm file/version, lỗi quan sát, cách sửa và kết quả. Không cần thêm nhiều loại template trước khi ba mẫu đầu chứng minh đủ dùng.

## 4. Workflow

### Cơ chế chính đã đủ ở mức chính sách

Retry đủ điều kiện tối đa ba lần, chọn reserve cùng ngày, phân biệt lỗi riêng bài/lỗi chung, giữ unknown, đối chiếu qua ngày và Telegram không kích hoạt repost đều hợp lý. V4.2 đã có giao thức bảo trì–intent và finalizer nên không tiếp tục nêu chúng như tính năng chưa có.

### Những điều cần chứng minh

Tự động phục hồi phải được kiểm thử từ trạng thái bền vững, không chỉ từ một request chạy trọn vẹn. Nếu Facebook confirmed rồi worker chết sau intake, finalizer phải hoàn tất slot/usage/outbox mà không gọi publish lại. Nếu storage không nhận phản hồi, intent/unknown giữ chặn gửi mới. Nếu có nhiều remote ID thật, lưu evidence và incident thay vì cố ép dữ liệu vào unique.

Khóa có generation không thu hồi được request đã đi ra ngoài. Kế hoạch đã thừa nhận giới hạn này; nghiệm thu cần kiểm tra cửa sổ trước/sau intent và không đặt mục tiêu exactly-once tuyệt đối.

### Cải tiến đề xuất

Gắn mỗi ca rủi ro với một bản ghi nghiệm thu gồm: điều kiện trước, lỗi được tiêm ở đâu, remote request count, dữ liệu cuối cùng, thông báo và thao tác phục hồi. Chỉ ghi “đạt” khi có kết quả thu được. Mở rộng các nhóm test hiện có, không tăng số test để tạo cảm giác chắc chắn.

Diễn tập thao tác của người quản lý: tìm bài cần sửa, xử lý hết kho và xác định lượt unknown qua giao diện/hướng dẫn tiếng Việt. Nếu một lỗi không thể giải quyết bằng giao diện mà cần hỗ trợ kỹ thuật, nói rõ trạng thái và bước hỗ trợ; không buộc chủ tài khoản hiểu SQL, lease hoặc artifact.

Giữ lịch 10h và bài thủ công độc lập. Không dùng số bài tổng trên fanpage để kết luận slot tự động đã được dùng. Đối chiếu phải gắn bằng chứng với request/job hệ thống, không nhận bài thủ công trùng caption làm kết quả.

## 5. Cấu trúc phần mềm và nền tảng

### Giữ kiến trúc hiện tại

Một backend theo mô-đun, D1/R2, GUI React và GitHub CI/CD phù hợp quy mô. Không cần microservices, workflow engine khác hoặc AI để vận hành các quy tắc đã chốt. Số thực thể logic không quyết định số bảng hoặc màn hình; bảng chuyển trạng thái mục 18 là căn cứ chính.

### Các thử nghiệm nên thực hiện sớm trong triển khai

1. Conditional writes D1: claim thất bại/UPDATE 0 dòng không tạo ghi phụ sai; evidence độc lập không rollback theo finalization lỗi.
2. Adapter Meta khi fanpage thử được cung cấp: một ảnh/caption, bằng chứng publish, ID/link và đối chiếu timeout. Tài liệu web trong lượt này không truy cập được trang Meta Posts; chưa xác minh các quyền/API cụ thể. Không dựa vào giả định để đóng nghiệm thu.
3. Backup/restore: export nguyên tử, manifest/pin đủ, tách export_finished khỏi complete, restore staging cách ly và đối chiếu remote.
4. GitHub monitor checkpoint: quyền đọc run trước, nhiều checkpoint trong một run, run failed sau lưu state, retention và mất state.

Thử nghiệm ở đây là hạng mục xây/kiểm chứng, không yêu cầu cung cấp fanpage chính thức trước khi thiết kế hoặc tự đăng thật.

### Cụ thể hóa checkpoint artifact trước khi triển khai

Phương án artifact ngoài Cloudflare khả thi về định hướng nhưng là chuỗi snapshot, không phải một file database sửa tại chỗ. upload-artifact v4+ tạo artifact bất biến. Checkpoint intent và kết quả cần identity/name riêng; reader lấy bản hợp lệ mới nhất theo environment/sequence, không ghi đè tên rồi coi là cùng bản. Nguồn: [actions/upload-artifact](https://github.com/actions/upload-artifact).

Xác định cách refresh checkpoint để không hết hạn khi trạng thái ít đổi. Khi tối ưu số upload, không bỏ checkpoint trước/sau thao tác gửi có rủi ro; metadata khỏe mạnh có thể được ghi theo nhịp đã quyết định. Đo tổng phút Actions, artifact và số lần gọi API thay vì chỉ kích thước JSON. Không commit checkpoint vào Git hoặc mở quyền publish cho monitor.

Nếu thử nghiệm cho thấy phương án quá khó bảo trì, chọn giải pháp trạng thái ngoài Cloudflare đơn giản hơn sau đánh giá chi phí; không thêm nhà cung cấp ngay và không giả rằng cảnh báo gộp được khi state đã mất. Đây là quyết định triển khai cần chứng minh, không phải lỗi đã xảy ra.

### Kiểm tra khôi phục và phạm vi dữ liệu

Full export D1 có thể chặn yêu cầu database; kế hoạch đã xử lý bằng bảo trì, cần đo và kiểm thử đúng pha. Nguồn: [Cloudflare D1 export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Xác minh tập dữ liệu xuất đúng scope và không chứa runtime secrets/session credentials; nếu khi triển khai có auth/session data, phải có chính sách tách hoặc vô hiệu hóa khi restore, không mặc nhiên khôi phục quyền truy cập cũ. Kiểm tra thực tế gói giải mã, số file/checksum, schema/version và trạng thái publish/outbox cách ly. Backup download thành công chưa chứng minh restore được.

## 6. Công sức và nghiệm thu

Phần tốn công lâu dài có thể là biên tập kho và xử lý ngoại lệ, không phải scheduler một bài/ngày. Theo dõi cả công sức chủ tài khoản và công sức bảo trì phần mềm. Quota miễn phí không đồng nghĩa toàn bộ vận hành không có chi phí công sức; không đưa ước tính tiền/giờ khi chưa đo.

| Mốc | Bằng chứng cần có |
|---|---|
| Sản phẩm mẫu | Năm caption/PNG, ba bố cục, rubric và lỗi đã sửa, đọc trên điện thoại |
| Luồng xuyên suốt | Bài đúng đích, snapshot đúng, Telegram và history tách đúng; khi có fanpage thử thì thu bằng chứng live |
| Phục hồi | Retry riêng bài, unknown không repost, crash sau evidence, maintenance tranh intent, restore cách ly |
| Vận hành | Monitor qua outage, checkpoint/retention, package backup complete, owner hiểu thao tác thường gặp |
| Production | Đúng SHA/config/đích, quyền Meta/quota đã thử, kho đủ ready, chọn ngày bật lịch rõ |

Không cần mọi mốc live đạt trước dòng code đầu tiên. Thiết kế phải rõ trước triển khai; phần mềm và mẫu mới cho phép thu bằng chứng. Nếu một thử nghiệm buộc đổi giải pháp, ghi quyết định và ảnh hưởng cụ thể thay vì tạo một kế hoạch tổng quát mới.

## 7. Khuyến nghị cuối

Giữ kế hoạch v4.2 làm nền. Cải tiến tiếp theo là phiếu nghiệm thu mẫu/test, chi tiết checkpoint artifact và quy trình thao tác của owner; không thêm phạm vi sản phẩm. Bắt đầu bằng năm mẫu và một luồng xuyên suốt, rồi chứng minh lỗi/phục hồi trước sản xuất cả kho và bật production. Những phần đã tích hợp không cần đánh giá lại như khoảng trống mới.

Giữ nguyên 10h đăng/8h kiểm tra, 30 chính+10 reserve, các tỷ lệ, footer, ba logo, 3,5 năm khóa 2026, no-AI runtime và quyền admin đăng thủ công bổ sung độc lập. Mục tiêu là hoàn tất dự án bằng sản phẩm và bằng chứng, không bằng số vòng cập nhật tài liệu.
