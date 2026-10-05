# Kế hoạch xây dựng hệ thống đăng bài fanpage Ngành Kinh tế số

Quy tắc caption cập nhật theo người quản lý: thêm đúng một dòng `============` giữa
phần thân và footer, cách mỗi bên một dòng trống; giữ nguyên nội dung footer.

Tiến độ triển khai 05/10/2026: bước1–7 hoàn tất backend/workflow giả lập, GUI và năm mẫu caption/ảnh local; TypeScript strict,125/125 test Node/HTTP,9/9 dựng ảnh và14+5 ca trình duyệt đạt. Kho gồm40 đề cương,0 bài đủ điều kiện đăng; năm mẫu riêng chờ chủ tài khoản xem, chưa promote ready. Dừng chờ duyệt bước8 (lưu/chỉnh sửa/quản lý phiên bản caption–ảnh trong kho local). Xem TIEN-DO-TRIEN-KHAI.md và docs/steps/07-content-samples.md. Các mô tả “chưa code” bên dưới là mốc chốt thiết kế v4.3 trước triển khai, không phải trạng thái ứng dụng hiện tại. Mỗi bước tiếp theo phải được chủ tài khoản phê duyệt sau kiểm thử bước trước.

Đính chính phạm vi ngày 05/10/2026: giới hạn một bài/ngày chỉ áp dụng bài do hệ thống tự động đăng. Người quản lý có thể đăng thủ công trực tiếp trên Facebook khi cần; các bài này bổ sung độc lập, không tiêu slot, không dừng/bỏ lượt tự động và không yêu cầu skip/pause. Fanpage có thể có nhiều bài trong ngày. Quy tắc này thay khuyến nghị về đăng ngoài hệ thống trong DANH-GIA-WORKFLOW-V4-1.md.

Ngày lập: 04/10/2026; cập nhật: 05/10/2026. Phiên bản 4.3: tích hợp đánh giá v4.2, phiếu nghiệm thu mẫu/test, chi tiết checkpoint artifact, phạm vi backup và cổng bắt đầu code chạy thử. Trạng thái: bộ thiết kế đủ để bắt đầu lập trình bản chạy thử local với adapter giả lập; chưa viết ứng dụng, tạo repository, triển khai hoặc đăng bài. Đăng thật trên fanpage thử và production cần các cổng nghiệm thu riêng ở mục 20; không coi thiết kế là kết quả kiểm thử.

Tài liệu đánh giá căn cứ: DANH-GIA-VA-CAI-TIEN-WORKFLOW.md, DANH-GIA-KE-HOACH-V2.md, DANH-GIA-WORKFLOW-V3-1.md, DANH-GIA-KE-HOACH-V4.md, DANH-GIA-WORKFLOW-V4-1.md và DANH-GIA-WORKFLOW-V4-2.md. Khuyến nghị skip/pause khi đăng trực tiếp trong đánh giá v4.1 không áp dụng theo đính chính của người dùng. Mục 18 là hợp đồng chuyển trạng thái chính; THIET-KE-TRUOC-CODE.md và NGHIEM-THU-CHAY-THU.md cụ thể hóa triển khai và bằng chứng. Các mô tả tóm tắt tuân thủ hợp đồng này, không tạo chính sách song song. Bản 4.3 không mở rộng phạm vi sản phẩm.

## 1. Mục tiêu và phạm vi đã chốt

Xây dựng một project trong Codex để quản lý nội dung và tự động đăng lên một fanpage của Ngành Kinh tế số (Chuyên ngành Kinh doanh số), Khoa Quản trị kinh doanh, Trường Đại học Nguyễn Tất Thành. Chương trình được triển khai trên đám mây để hoạt động khi máy tính cá nhân tắt.

- Mục tiêu đăng một bài thành công mỗi ngày vào lịch 10:00, múi giờ Asia/Ho_Chi_Minh; giới hạn tối đa một bài theo lịch/ngày trên fanpage chính thức. Khi có lỗi, thời điểm đăng thực tế có thể muộn hơn hoặc cần dừng để xác minh; không bảo đảm có bài khi dịch vụ ngoài mất quyền hoặc ngừng hoạt động.
- Kiểm tra trạng thái bài đã đăng lúc 08:00 mỗi ngày.
- Nội dung không cần duyệt trước mỗi lượt đăng. Người quản lý có thể sửa bài trong giao diện và chủ động xóa bài trên Facebook.
- Chuẩn bị 40 bài có ảnh: 30 bài theo lịch và 10 bài dự phòng. Không tự tạo bài mới khi vận hành, không gọi Gemini hay OpenAI API hằng ngày.
- Đăng nhập bằng Google, chỉ cho phép tài khoản tranthanhtung37@gmail.com. Việc giới hạn tài khoản được kiểm tra ở máy chủ, không chỉ ẩn giao diện.
- Thiết lập Meta Developer App, Cloudflare và Telegram bot từ đầu.
- Kiểm thử trên fanpage thử nghiệm do người dùng cung cấp. Chuyển sang fanpage chính thức sau khi kiểm thử đạt yêu cầu; ngày bắt đầu chưa ấn định.
- Kiểm tra chất lượng theo đợt trước khi đưa kho vào lịch; không bổ sung bước phê duyệt hằng ngày. Thu kết quả và phản hồi để cải thiện đợt tiếp theo.
- Một ứng dụng gọn với các mô-đun rõ ràng; ưu tiên khả năng phục hồi, sao lưu và kiểm chứng giới hạn miễn phí trước khi mở rộng.
- Giám sát ngoài Cloudflare và sao lưu tự động ngoài điểm hỏng nằm trong phạm vi trước production; dùng GitHub Actions làm phương án ban đầu theo mục 19, kiểm tra hạn mức thực tế. Không tự phát sinh dịch vụ trả phí.
- Người dùng đã có tài khoản GitHub. Dùng repository riêng tư để quản lý mã nguồn và phiên bản; Cloudflare là nơi chạy production. GitHub không thay thế máy chủ, scheduler hoặc sao lưu dữ liệu vận hành.

## 2. Kho nội dung và căn cứ biên soạn

### Các tỷ lệ đã chốt

| Tiêu chí | Toàn kho | Phân bổ đề xuất cho lịch 30 bài | Phân bổ đề xuất cho 10 bài dự phòng |
|---|---:|---:|---:|
| Kiến thức, kỹ năng và nghề nghiệp | 32 | 24 | 8 |
| Giới thiệu ngành | 8 | 6 | 2 |
| Hướng đến sinh viên | 28 | 21 | 7 |
| Hướng đến học sinh tìm hiểu ngành | 12 | 9 | 3 |

Hai cách phân loại áp dụng đồng thời cho cùng một kho 40 bài. Tỷ lệ là mục tiêu biên soạn ban đầu; khi dùng bài dự phòng, ưu tiên có bài phù hợp trong ngày, không ép tỷ lệ tuyệt đối của từng tuần.

### Ma trận biên soạn cho đợt đầu

Áp dụng phân bổ sau để thực hiện đồng thời hai tỷ lệ, không phát sinh tỷ lệ chiến lược mới:

| Đối tượng / Nội dung | Kiến thức, kỹ năng, nghề nghiệp | Giới thiệu ngành | Tổng |
|---|---:|---:|---:|
| Sinh viên | 25 | 3 | 28 |
| Học sinh tìm hiểu ngành | 7 | 5 | 12 |
| Tổng | 32 | 8 | 40 |

Lịch chính: sinh viên 19 bài kiến thức + 2 bài giới thiệu; học sinh 5 + 4, tổng 30. Dự phòng: sinh viên 6 + 1; học sinh 2 + 1, tổng 10. Mỗi bài được đếm theo một đối tượng chính, có thể hữu ích cho đối tượng phụ. Thay đổi phân bổ từng ô trong đợt sau vẫn phải giữ các tổng đã chốt, trừ khi người dùng đổi chiến lược.

### Nhóm chủ đề đề xuất

| Nhóm chủ đề | Số bài ban đầu | Ví dụ cách triển khai |
|---|---:|---|
| Dữ liệu và tư duy ra quyết định | 8 | Đọc biểu đồ, làm sạch dữ liệu, đặt câu hỏi kinh doanh, dashboard |
| AI và công nghệ số trong kinh doanh | 6 | Sử dụng AI có kiểm chứng, blockchain dưới góc nhìn ứng dụng |
| Kinh doanh số và định hướng nghề nghiệp | 8 | Digital Marketing, thương mại điện tử, CRM, chuyển đổi số |
| Kỹ năng học tập và chuẩn bị việc làm | 6 | Portfolio, giao tiếp, làm việc nhóm, quản lý công việc |
| Khởi nghiệp, đổi mới sáng tạo và trách nhiệm số | 4 | Kiểm chứng ý tưởng, tự học, bảo vệ dữ liệu, trách nhiệm nghề nghiệp |
| Giới thiệu ngành Kinh tế số tại NTTU | 8 | Học gì, rèn năng lực gì, định hướng ứng dụng, cơ hội nghề nghiệp |
| Tổng | 40 | 32 bài kiến thức/nghề nghiệp và 8 bài giới thiệu ngành |

Lịch luân phiên nhóm chủ đề và đối tượng đọc, hạn chế các bài liền nhau cùng góc tiếp cận. Không tự đăng lại bài cũ sau khi kho đã hết.

Đã lập LICH-CONTENT-40-BAI.md và content/content-plan-40.json: 30 brief theo lịch + 10 brief dự phòng, đủ ma trận đối tượng/tuyến bài và sáu nhóm. Đây là kế hoạch biên soạn, chưa phải 40 bài có caption/ảnh sẵn sàng. Năm mẫu tiếp theo là P02, P04, P05, P06 và P08 theo lộ trình kiểm chứng bộ mẫu nhỏ.

### Mục tiêu và cách triển khai của từng bài

Mỗi bài có hồ sơ biên tập: đối tượng chính, trình độ, vấn đề người đọc, thông điệp duy nhất, điều có thể hiểu/thực hiện sau khi đọc, nguồn, nhóm chủ đề, góc triển khai và định dạng ảnh. Ví dụ thay vì “Tầm quan trọng của dữ liệu”, triển khai “Ba câu hỏi trước khi dùng một biểu đồ để ra quyết định”.

Luân phiên khái niệm qua ví dụ, checklist, sai lầm thường gặp, tình huống kinh doanh, thực hành nhỏ, định hướng nghề nghiệp và giới thiệu ngành có minh chứng. Không ép mọi bài cùng công thức mở đầu hoặc CTA. Học sinh cần giải thích dễ hiểu; sinh viên cần bài thực hành, sản phẩm portfolio và tiêu chí tự kiểm tra. Phân biệt công việc đầu vào với vị trí cần kinh nghiệm.

Có thể thiết kế chuỗi kiến thức, lưu mã chuỗi và thứ tự; các bài dự phòng phải độc lập hoặc đã đủ điều kiện tiền đề. Không dùng một bài ở giữa chuỗi làm bài bù nếu người đọc chưa có ngữ cảnh.

Hồ sơ bổ sung concept_id, góc triển khai và mức độ học tập: hiểu khái niệm → áp dụng → tạo sản phẩm. Ví dụ tuyến dữ liệu đi từ hiểu chỉ số đến làm sạch bảng nhỏ rồi tạo dashboard/nhận xét cho portfolio. Bài thực hành có thể dùng checklist hoặc dữ liệu mẫu được chuẩn bị trước, lưu như tài sản tĩnh; không thêm cổng học tập hay tạo file hằng ngày.

Bài giới thiệu ngành nối học phần → năng lực → ví dụ thực hành → hướng nghề. Tài liệu CTĐT chứng minh nội dung đào tạo, không tự chứng minh một dự án thực tế, thành tích, đối tác hoặc kết quả sinh viên đã diễn ra. Chỉ đưa các câu chuyện thực tế khi có nguồn; tình huống giả định ghi rõ.

Kho brief hiện có 14 bài mức hiểu, 21 áp dụng, 5 tạo sản phẩm; lịch chính 9/17/4. Mỗi bài áp dụng/tạo sản phẩm phải có đầu vào, hoạt động, đầu ra và tiêu chí tự kiểm tra phù hợp. Không yêu cầu mua công cụ/chứng chỉ để làm bài cơ bản. Caption đưa giá trị chính lên đầu, không lặp lời quảng bá trước footer.

Biên tập riêng P24/R10 (kế hoạch rèn năng lực / tự đánh giá bằng chứng), P26/R02 (trình bày portfolio / nhật ký phân tích), P08/R05 (vận hành cho SV / khám phá vai trò cho HS) và P02/R03 (kiểm tra đầu ra / thiết kế yêu cầu AI). Thứ tự lựa chọn reserve xét cả góc triển khai gần đây. Bộ facts và rà soát bản bài phụ thuộc được quy định ở mục 18.

### Căn cứ đã nhận

- BM03: bản mô tả chương trình đào tạo, 107 trang; dùng cho giới thiệu ngành, mục tiêu, cơ hội nghề nghiệp và mô tả học phần.
- BM11: mục tiêu và chuẩn đầu ra, 19 trang; dùng cho các năng lực sinh viên cần rèn.
- BM12: chương trình đào tạo, 75 trang; dùng để đối chiếu tên học phần và nội dung đào tạo.
- Người dùng xác nhận bộ tài liệu áp dụng cho khóa 2026. Dòng “từ khóa 2025” trong BM11 và BM12 là thông tin chưa cập nhật; giữ nguyên tài liệu gốc và ghi chú khi lập dữ liệu nguồn.
- Bổ sung 10 cẩm nang/tài liệu nghề nghiệp do người dùng cung cấp, tổng 165 trang: tổng quan ngành, kinh doanh số, thương mại số, marketing số, chuyển đổi số, ứng dụng AI, Web3/blockchain, phân tích dữ liệu, thực tập/việc làm thêm và phân tích vị trí việc làm. Đã lập DANH-MUC-NGUON-CONTENT.md và lưu bản PDF nguyên trạng cùng manifest/checksum tại assets/sources/career/. Chưa công khai hoặc đồng bộ các PDF lên GitHub.
- Dùng cẩm nang để phát triển kỹ năng, portfolio và hướng nghề; thông tin chương trình/học phần ưu tiên đối chiếu BM03/BM11/BM12 khóa 2026 cùng các đính chính của người dùng. Người dùng xác nhận ngày 04/10/2026: thời gian đào tạo Ngành Kinh tế số là **3,5 năm**, áp dụng cho nội dung khóa 2026. Dùng mốc này thống nhất trong kho content, thay cho 4 năm ghi trong BM03; lưu ghi chú đính chính và giữ nguyên PDF gốc. Ba câu chuyện tr. 23 của cẩm nang tổng quan được ghi rõ là hư cấu, phải giữ nhãn minh họa nếu dùng.
- Lương, tăng trưởng/tuyển dụng, pháp lý, chứng chỉ/công cụ và danh sách công ty trong cẩm nang chưa mặc nhiên được xác minh hoặc còn hiện hành. Kiểm chứng nguồn cụ thể trước khi dùng; ưu tiên kiến thức/kỹ năng lâu dài cho kho đầu. Mỗi bài lưu mã nguồn và trang/mục hỗ trợ, không chỉ tên PDF.

Giọng văn kết hợp chuyên nghiệp và gần gũi; độ dài thay đổi theo chủ đề. Chỉ dùng câu hỏi gợi tương tác khi phù hợp. Bài giới thiệu ngành không đưa học phí, thời hạn hay phương thức xét tuyển. Khi biên soạn, các thông tin khác nhau giữa tài liệu sẽ được ghi chú hoặc xác nhận trước khi sử dụng. Nội dung nghề nghiệp trình bày năng lực và hướng phát triển, không suy diễn thành bảo đảm việc làm hoặc thu nhập. Các số liệu thị trường theo năm trong tài liệu không mặc nhiên coi là số liệu hiện hành.

### Kiểm soát chất lượng trước khi nhập lịch

1. Đối chiếu căn cứ từng tuyên bố với nguồn phù hợp: CTĐT cho nội dung đào tạo; thị trường/lương/nhu cầu tuyển dụng cần nguồn riêng nếu sử dụng.
2. Ghi tài liệu, mục/trang, phiên bản, ngày biên soạn, ngày rà soát và mức nhạy theo thời gian. Không tự gắn nhãn “lâu dài” cho giao diện công cụ, tên sản phẩm AI hoặc số liệu theo năm.
3. Kiểm tra tên ngành/chuyên ngành, mốc 2026 đã xác nhận và các khác biệt còn lại giữa tài liệu. Tình huống dùng dữ liệu giả định phải ghi rõ là ví dụ.
4. Đối chiếu lịch sử và các bài trong cùng đợt; kiểm tra cả góc tiếp cận, không chỉ câu chữ.
5. Kiểm tra độ rõ ràng, giá trị hành động, tính phù hợp với đối tượng, phần cuối cố định và đồng bộ ảnh.
6. Đưa vào trạng thái sẵn sàng khi toàn bộ kiểm tra hoàn tất; bài chưa đủ điều kiện không được nhập lượt đăng tự động.

Kiểm tra nội dung được thực hiện khi biên soạn/nhập đợt và khi có bản sửa. Bộ kiểm tra tự động hỗ trợ điều kiện hình thức, nguồn đã khai báo, trùng chính xác và đồng bộ dữ liệu; không thay thế việc đọc nội dung hay chứng minh nguồn nói đúng điều được gán cho nó. Nội dung hết mốc rà soát hoặc có vấn đề được cách ly để xử lý.

### Rubric biên tập và giá trị riêng của fanpage

Mỗi bản bài ghi kết quả đạt/chưa đạt cho năm tiêu chí: (1) nhu cầu cụ thể của đối tượng chính; (2) một thông điệp và ví dụ rõ; (3) căn cứ cho các tuyên bố, nhận diện tình huống giả định; (4) điều người đọc có thể làm/kiểm tra/quyết định; (5) caption–ảnh nhất quán, footer đúng một lần. Không dùng tổng điểm để bù một tiêu chí bắt buộc chưa đạt. Sai dữ kiện, cam kết việc làm/thu nhập, biến ví dụ thành thành tích thật hoặc ảnh mâu thuẫn là điều kiện chặn ready. Kiểm tra theo đợt/khi sửa, không thêm duyệt hằng ngày.

Liên hệ năng lực/học phần đã đối chiếu với một việc sinh viên có thể làm để tạo giá trị riêng. Phân biệt mục tiêu đào tạo, gợi ý thực hành và hoạt động đã diễn ra. P06 phải giúp viết brief dashboard ba dòng; P04 có ví dụ CV trước/sau không bịa số liệu; P27 có phép tính minh họa doanh thu/lợi nhuận. Đa dạng tình huống, so sánh, hiểu lầm, bài tập và checklist. Hai tỷ lệ đã chốt là giả thuyết biên tập đợt đầu, chưa phải bằng chứng tối ưu; đánh giá theo mục tiêu từng tuyến ở mục 13.

Kết hợp learning_level với ngữ cảnh mới tiếp cận ngành/đang làm dự án/chuẩn bị thực tập–việc làm trong hồ sơ biên tập hiện có, không thêm tỷ lệ cứng hoặc tiền đề đọc bài trước. Một câu ngắn có thể nêu khi nào bài hữu ích. Footer quảng bá có trong mọi bài, nên tỷ lệ 80/20 chỉ tính phần thân; nghiệm thu caption đầy đủ trên điện thoại, không chỉ phần thân tách rời. Không tự cắt footer hoặc đặt giới hạn độ dài giống nhau cho mọi bài. Năm mẫu phải ghi lỗi, bản sửa, check_version và kết quả đạt; sau đó mới sản xuất cả kho. Theo dõi giờ viết/đối chiếu/dựng ảnh/sửa, không chỉ số bài, để dự báo công suất bổ sung; vẫn giữ cảnh báo ba ngày và không tự tạo bài.

Kho không tự bổ sung hoặc tái đăng nên hữu hạn. Dashboard/API tách tổng bản ghi, số bài gốc đủ điều kiện và số ngày còn phủ được ở nhịp một bài/ngày; không đếm nhiều version thành nhiều bài. 40 brief hoặc 40 bản ghi không bảo đảm 40 ngày thành công. Cảnh báo bắt buộc trước ba ngày dựa số bài có thể sử dụng theo cùng eligibility của luồng đăng; nguyên nhân không đủ phân bố/ngữ cảnh được hiển thị riêng. Bổ sung kho theo đợt; cảnh báo sớm hơn chỉ là tùy chọn, không thay ngưỡng đã chốt.

## 3. Phần cuối bắt buộc của mọi bài

Lưu thành một cấu hình dùng chung; máy chủ nối đúng một lần vào cuối nội dung. Xem trước và bài thực tế dùng cùng một bản. Hashtag riêng của chủ đề, nếu có, đặt trước khối này để phần cuối cố định luôn nằm cuối bài.

```text
Ngành Kinh tế số (Chuyên ngành Kinh doanh số) giúp người học làm chủ công nghệ AI, blockchain, big data để phân tích dữ liệu và đưa ra quyết định thông minh. Kết hợp kiến thức kinh tế - công nghệ hiện đại, bạn sẽ phát triển tư duy kinh doanh sáng tạo, làm chủ xu hướng chuyển đổi số và tự tin chinh phục thị trường toàn cầu!
NGÀNH KINH TẾ SỐ, KHOA QTKD, TRƯỜNG ĐẠI HỌC NGUYỄN TẤT THÀNH
📞 Hotline: 1900 2039 – Ext: 429
✉️ Email: tran.tung@nttu.edu.vn
🚩 Địa chỉ: Tầng 1, 331 Đỗ Mười, Phường An Phú Đông, TP. Hồ Chí Minh, Việt Nam
🌐 Website: https://fba.ntt.edu.vn/kinh-te-so/
🌟 Fanpage: https://www.facebook.com/NganhKinhTeSoNTTU
🌟 Tiktok: https://www.tiktok.com/@nganhkinhteso_nttu
#NTTU #NguyenTatThanhUniversity #nganhkinhteso #kinhteso
```

Giữ nguyên nội dung người dùng cung cấp, chỉ sửa địa chỉ TikTok và bỏ nhóm hashtag lặp theo xác nhận. Gửi emoji và URL dạng văn bản; không gửi cú pháp Markdown hoặc liên kết ảnh emoji. Dùng xuống dòng/khoảng cách để phân tách phần thân và liên hệ; không thêm một khối quảng bá tương tự vào thân bài.

Phần cuối có phiên bản. Snapshot xuất bản lưu trọn caption đã gửi hoặc nội dung cùng phiên bản footer bất biến; thay đổi cấu hình liên hệ sau này không ghi đè lịch sử.

## 4. Ảnh minh họa và logo

- Kích thước 1080 × 1080 px.
- Luân phiên infographic có tiêu đề, vài ý chính và ảnh minh họa ít chữ. Không coi infographic nào cũng là biểu đồ có số liệu.
- Màu sắc thay đổi theo chủ đề, không có bảng màu bắt buộc.
- Ba logo cùng một hàng ở đầu ảnh, theo thứ tự Trường → Khoa → Ngành; giữ tỷ lệ và màu gốc, không thêm dòng tên ngành.
- Logo Trường có bố cục ngang; kích thước hiển thị cần cân bằng với hai logo tròn, không ép ba logo vào ba ô vuông cùng kích thước.
- Logo gốc đã lưu trong assets/brand/originals/: nttu.png, fba.png, digital-economics.jpg. Hai PNG có alpha; logo Ngành là JPG nền trắng. Bản gốc luôn được giữ.
- Dùng vùng đầu ảnh có nền phù hợp để logo dễ đọc. Chuẩn hóa kích thước hoặc tạo bản dẫn xuất khi cần; không vẽ lại chữ và biểu tượng bằng AI.

### Hệ thống mẫu và nghiệm thu thiết kế

- Xây 4–6 mẫu khởi đầu: thẻ khái niệm, checklist, quy trình, tình huống nghề nghiệp, minh họa chủ đạo và giới thiệu ngành/học phần. Mẫu có thể điều chỉnh sau khi xem thực tế.
- Cố định nguyên tắc bố cục, kiểu chữ, lề và phong cách biểu tượng; màu linh hoạt theo chủ đề từ các phối màu dễ đọc, không ngẫu nhiên hoàn toàn.
- Dải logo có thể bắt đầu ở khoảng 160–190 px; logo Trường rộng hơn hai logo tròn. Đây là thông số thử mẫu, không phải quy chuẩn thương hiệu chính thức. Không lược chữ/khẩu hiệu trong logo.
- Thử tiêu đề khoảng 64–80 px, ý chính 36–44 px, lề 48–64 px; kiểm tra lại trên bản thu nhỏ khoảng 360 px và chỉnh theo nội dung. Không thu chữ vô hạn để nhét nội dung.
- Infographic ưu tiên một thông điệp với 3–4 ý ngắn. Khi tràn vùng, yêu cầu rút gọn hoặc đổi mẫu; phần giải thích dài ở caption.
- Minh họa phải giúp hiểu chủ đề: dashboard mô phỏng, sơ đồ hành trình khách hàng, cấu trúc portfolio... Không lặp ảnh robot/biểu đồ tăng trưởng cho mọi bài.
- Biểu đồ có nguồn/đơn vị nếu dùng số liệu thật; ghi “ví dụ minh họa” nếu dữ liệu giả định.
- Nghiệm thu chữ tiếng Việt, tương phản, khoảng trắng, độ đọc của logo và ý trên ảnh ở cả 1080 px và bản thu nhỏ.

### Cập nhật ảnh sau khi sửa bài

Mỗi bài có các trường riêng: nội dung, tiêu đề ảnh, ý chính trên ảnh, nhóm chủ đề, mẫu ảnh và hình minh họa. Bộ dựng ảnh dùng dữ liệu này để tạo PNG trong trình duyệt và lưu lên kho ảnh; tránh xử lý dựng ảnh nặng trong tác vụ đăng hằng ngày.

Tách caption_title khỏi image_headline ngắn hơn, cùng image_description và xác nhận đồng bộ ý nghĩa giữa caption/ảnh. Caption phải đủ thông tin khi người đọc không nhìn rõ chữ trên ảnh. image_description luôn dùng trong quản lý; khả năng gửi alt text qua adapter Meta chỉ bật sau kiểm chứng, không coi là điều kiện bắt buộc nếu API luồng chọn không hỗ trợ. Mục tiêu 20 infographic/20 ảnh ít chữ có thể điều chỉnh theo cấu trúc nội dung; không dùng xen kẽ cứng khi chọn reserve.

- Sửa tiêu đề/ý chính hoặc mẫu sẽ tự dựng lại ảnh, xem trước rồi lưu đồng bộ.
- Nếu chỉ sửa nội dung thân bài, hệ thống đánh dấu cần đối chiếu thông tin trên ảnh; tiêu đề/ý chính được cập nhật trong cùng màn hình sửa bài.
- Phiên bản nội dung mới không được chọn cho lượt mới khi ảnh chưa đồng bộ. Nếu dựng lại ảnh lỗi, giữ bản đã hoàn tất trước đó để phục hồi, đánh dấu bản sửa chưa sẵn sàng và chặn lựa chọn bài cho lượt mới chưa giữ phiên bản cho đến khi sửa xong hoặc người quản lý chủ động phục hồi bản cũ. Không âm thầm dùng thân bài mới với ảnh cũ hoặc tự chọn bản cũ thay bản đang sửa. Lượt đã giữ snapshot tiếp tục dùng phiên bản đã pin theo mục 6; bản sửa áp dụng cho lượt tương lai. Muốn dừng lượt hiện tại phải tạm dừng xuất bản; yêu cầu đã gửi vẫn có thể hoàn tất.
- Hình minh họa được chọn từ thư viện theo nhóm chủ đề, hoặc tải ảnh thay thế lên. Không gọi AI để suy luận tự do từ thân bài hoặc tạo ảnh hoàn toàn mới trong lúc vận hành.
- Trước khi đưa kho bài vào lịch, kiểm tra đủ ảnh, chữ tiếng Việt, bố cục, logo và quyền sử dụng hình.
- Lưu dữ liệu ảnh có cấu trúc, phiên bản mẫu, phiên bản tài sản và PNG cuối. Chờ font/ảnh tải xong, xác minh file xuất và upload thành công trước khi đánh dấu bản sẵn sàng.
- Đưa ảnh hoàn tất lên kho triển khai; tác vụ đăng không phụ thuộc đường dẫn Desktop hoặc URL phiên chat. Không dựng PNG trong lượt đăng hoặc retry.

### Chọn mẫu, đóng gói tài sản và thử trường hợp khó

Thử 2–3 bố cục đại diện trước khi mở rộng thành 4–6 mẫu. Chọn theo cấu trúc nội dung: quy trình thể hiện các bước, so sánh thể hiện các vế, checklist thể hiện việc cần làm; ảnh ít chữ dùng minh họa tình huống. Luân phiên hai loại ảnh theo sự phù hợp, không ép đổi loại theo ngày khi làm giảm khả năng hiểu.

Mỗi mẫu phải qua bộ thử: tiêu đề dài, dấu tiếng Việt, từ tiếng Anh, bốn ý dài/hai ý ngắn, số liệu, thiếu ảnh/font và logo trên các nền. Kiểm tra PNG 1080 px, bản khoảng 360 px và ảnh đã đăng trên Facebook bằng điện thoại. Tràn nội dung phải rút gọn hoặc đổi mẫu, không tự thu chữ dưới ngưỡng mẫu.

Cân bằng diện tích nhìn thấy của logo Trường dạng ngang và logo Khoa/Ngành dạng tròn; không ép ba ô cùng kích thước, không cắt/vẽ lại hay xóa chi tiết trắng của logo ngành. Dải nền sáng là phương án thử, phải nghiệm thu bằng tài sản gốc. Nội dung chính đọc được ở bản nhỏ, ba logo còn nhận diện được; không hứa toàn bộ chữ li ti của logo tròn đều đọc rõ. Renderer đợi font/ảnh tải đầy đủ mới finalize. Ảnh ít chữ dùng ngữ cảnh CV, dữ liệu, quy trình đơn hàng hoặc quyết định sinh viên thay vì lặp biểu tượng công nghệ chung chung; infographic thể hiện quan hệ/thứ tự/so sánh. Giữ nhận diện bằng bố cục/font/lề/phong cách, màu vẫn linh hoạt theo chủ đề; đánh giá cả ảnh sau Facebook xử lý.

Đóng gói font nếu giấy phép cho phép; lưu phiên bản font, renderer_version, template_version, tài sản, dữ liệu đầu vào và thông số xuất. Canvas dùng tài sản cùng origin hoặc cấu hình CORS phù hợp. Lỗi tải/font/export không được đánh dấu hoàn tất. PNG cuối là bản dùng đăng; checksum xác minh file lưu, không yêu cầu mọi trình duyệt tạo file giống từng byte và không chứng minh tính đúng của nội dung.

## 5. Giao diện quản lý

Giao diện ưu tiên tổng quan, kho bài, lịch, lịch sử và cài đặt; bài lỗi/đối chiếu và kết quả mở từ ngữ cảnh hoặc điều hướng phụ. Không biến mỗi thực thể dữ liệu thành một màn hình. Editor đặt caption, preview ảnh và lý do chưa sẵn sàng cùng một chỗ; nguồn/facts/phiên bản chi tiết có thể mở rộng. Người dùng nhìn thấy đã đăng chưa, kho dùng được còn bao lâu và việc cần xử lý. Thông báo diễn đạt hành động bằng tiếng Việt, chẳng hạn “Chưa xác minh bài đã đăng, đang tạm dừng gửi để tránh trùng”; lease/generation/outbox chỉ ở chẩn đoán kỹ thuật. Khi sửa bài đang giữ lượt, nêu rõ bản sửa dùng cho lượt nào và quy tắc chặn dữ kiện đã biết sai.

| Màn hình | Chức năng |
|---|---|
| Tổng quan | Fanpage/chế độ đang dùng, lịch bật/tắt, bài tiếp theo, số bài sẵn sàng, kho theo nhóm, lần scheduler chạy gần nhất và lỗi cần xử lý |
| Lịch đăng | Xem lịch 30 ngày, đổi thứ tự, đổi ngày, bỏ lượt, xem trước caption và ảnh |
| Kho bài | Tìm kiếm/lọc nhóm chủ đề, đối tượng, mục tiêu, góc triển khai, lịch chính/dự phòng, nguồn và trạng thái |
| Chỉnh sửa bài | Sửa thân bài và dữ liệu ảnh; dựng ảnh, xem trước, lưu phiên bản |
| Bài lỗi | Xem nguyên nhân, lịch sử thử, sửa bài và đưa lại vào kho dự phòng |
| Đối chiếu bài chưa xác minh | Fanpage, thời điểm gửi, phiên bản caption/ảnh, bằng chứng và URL/ID đã được kiểm tra; xử lý theo mục 6 |
| Kho lịch sử | Nội dung/ảnh/footer đúng phiên bản đã đăng, ngày đăng, liên kết, trạng thái Facebook, số liệu và ghi chú lý do loại bài nếu người dùng nhập |
| Kết quả nội dung | Nhập kết quả thủ công, lọc theo mục tiêu/đối tượng/chủ đề/định dạng và xem báo cáo đợt |
| Nhật ký và sao lưu | Xem lượt thử, tác vụ chờ/quá hạn, thông báo; xuất dữ liệu, manifest và tệp ảnh thực tế để phục hồi |
| Cài đặt | Kết nối fanpage, Telegram, phần cuối cố định, lịch và trạng thái vận hành |

Giao diện hiển thị rõ chế độ thử nghiệm/chính thức và tên fanpage đích. “Đăng thử ngay” cho phép nhiều lượt thử thủ công trên fanpage thử nghiệm, mỗi lượt có ID riêng; bấm lặp cùng lượt không tạo bản đăng khác. Fanpage chính thức giữ giới hạn một bài theo lịch/ngày. Cả hai dùng chung cơ chế xuất bản, phân loại lỗi và đối chiếu.

Khi chuyển sang chính thức, hủy các tác vụ thử chưa gửi. Lượt đã gửi nhưng chưa xác minh vẫn tiếp tục đối chiếu với fanpage thử và giữ lịch sử tại đó; không xóa trạng thái chờ hoặc gửi lại sang trang chính. Fanpage đích và môi trường được cố định trong từng lượt.

Tách rõ trạng thái người dùng tạm dừng, kết nối bị chặn, hết bài và đang chờ đối chiếu. Tổng quan hiển thị từng nguyên nhân và hành động phù hợp; sửa token không tự bật lịch đã bị người dùng tạm dừng. Màn hình sửa hiển thị phiên bản đang được lượt đăng giữ và bản mới cho tương lai.

## 6. Luồng đăng và xử lý lỗi

1. Đến 10:00, lấy bài chính của ngày, kiểm tra sẵn sàng, ảnh và phần cuối cố định. Nếu thiếu ảnh/đang sửa thì giữ bài để xử lý và chọn dự phòng ngay, không giả lập ba lỗi gọi Facebook. Giao diện tách thao tác bỏ một bài khỏi lịch (chọn bài bù) và chủ động bỏ ngày đăng (không tự bù ngày đã bỏ).
2. Giữ lượt bằng thao tác cơ sở dữ liệu có điều kiện. Lịch chính thức khóa theo fanpage + ngày nghiệp vụ; lượt thử thủ công khóa theo ID yêu cầu. Giữ riêng bài dự phòng để ngăn hai tác vụ chọn cùng bài. Lưu fanpage đích, phiên bản nội dung/ảnh/footer dự kiến trước khi gọi dịch vụ ngoài.
3. Gửi yêu cầu đăng lên fanpage cố định trong lượt; lưu ID bài, thời gian, snapshot nội dung/ảnh/footer khi có kết quả hợp lệ. Không giữ giao dịch cơ sở dữ liệu mở trong thời gian chờ mạng.
4. Đồng thời với ghi nhận kết quả Facebook, lưu sự kiện thông báo vào hàng chờ Telegram (outbox). Tác vụ thông báo gửi tiêu đề, fanpage, thời gian và đường dẫn độc lập với xuất bản.
5. Phân loại nguyên nhân trước khi thử lại. Nếu lỗi đủ điều kiện, ghi rõ nguyên nhân, xử lý trong phạm vi kỹ thuật và thử tối đa 3 lần tổng cộng, cách nhau 5 phút mặc định. Không tự viết lại nội dung học thuật hoặc sửa nội dung để né chính sách nền tảng.
6. Sau lần thứ ba thất bại đã xác minh, giữ bài trong mục lỗi và báo Telegram.
7. Chọn dự phòng qua cùng một bộ điều kiện hợp lệ dùng cho UI/stock/scheduler. Điều kiện cứng: chưa dùng trên fanpage đích, bản sẵn sàng và còn hiệu lực, đủ ảnh/nguồn/footer, không bị cách ly/đang giữ/chưa xác minh, nội dung phù hợp fanpage, độc lập hoặc đủ tiền đề. Nhóm và đối tượng chính là ưu tiên mềm: cùng nhóm/đúng đối tượng → cùng nhóm/đối tượng khác → nhóm khác/đúng đối tượng → ứng viên hợp lệ khác. Trong mỗi mức ưu tiên, tránh góc vừa đăng, sau đó theo thứ tự reserve ổn định và mã bài. Không chọn bài bị chặn chỉ để đủ lượt/ngày.
8. Đăng bài dự phòng trong ngày, áp dụng quy trình tối đa 3 lần tương tự. Nếu tiếp tục lỗi riêng từng bài, chuyển sang bài dự phòng khác đến khi thành công hoặc hết bài dự phòng sẵn sàng.
9. Trong chế độ chính thức, dừng khi một bài đã đăng thành công trong ngày. Ngày hôm sau lấy bài chính kế tiếp; bài dự phòng không đẩy lùi toàn bộ lịch chính. Các lượt thử thủ công dùng chính sách thử nghiệm ở mục 5.

### Phân loại lỗi và trạng thái

| Loại vấn đề | Hành động |
|---|---|
| Bài chưa sẵn sàng: thiếu ảnh, bản sửa chưa hoàn tất | Giữ bài để xử lý và chọn dự phòng; không thực hiện ba cuộc gọi vô ích |
| Lỗi kỹ thuật xác định thuộc riêng bài | Sửa kỹ thuật nếu an toàn, retry đủ điều kiện; khi hết lượt thì dùng dự phòng |
| Mất quyền/token hoặc sự cố ảnh hưởng toàn kết nối | Dừng cho fanpage và báo Telegram; không lấy cả kho dự phòng |
| Rate limit/lỗi nền tảng tạm thời | Chờ theo hướng dẫn dịch vụ và kiểm tra sức khỏe kết nối; mặc định 5 phút có thể phải kéo dài |
| Đã gửi nhưng mất phản hồi/kết quả không rõ | Ghi chưa xác minh, đối chiếu trước mọi yêu cầu xuất bản tiếp theo |
| Facebook thành công, Telegram lỗi | Chỉ retry thông báo, không đăng lại Facebook |
| Bị từ chối do chính sách nội dung | Cách ly và báo xử lý; không tự thay nội dung để vượt từ chối |

Phân loại xét cả mã lỗi dịch vụ, giai đoạn gửi và bằng chứng đã xuất bản; không chỉ dựa vào mã HTTP. Bài lỗi, lượt xuất bản lỗi và thông báo lỗi là các trạng thái khác nhau.

- Nội dung: nháp → cần kiểm tra → sẵn sàng; bản có vấn đề → cách ly/chờ sửa → dự phòng sẵn sàng sau khi sửa xong.
- Lượt xuất bản: chờ → đang gửi → thành công/thử lại/chưa xác minh/thất bại/hủy.
- Thông báo: chờ gửi → đã gửi/thử lại/thất bại.

### Các trường hợp cần xử lý riêng

- Lỗi toàn fanpage như mất quyền hoặc token không hợp lệ: dừng lượt đăng và báo Telegram; không lấy lần lượt cả kho dự phòng cho cùng một lỗi.
- Giới hạn gọi API: chờ theo chỉ dẫn của dịch vụ thay vì tiếp tục tiêu hao kho. Có thể cần chờ lâu hơn 5 phút; mốc 5 phút là khoảng chờ mặc định.
- Mất phản hồi sau khi gửi yêu cầu: trạng thái “chưa xác minh”, đối chiếu kết quả trước khi thử lại hoặc đăng bài bù. Nếu không xác minh được, giữ lượt chờ xử lý và báo Telegram, không đoán rằng chưa đăng.
- Facebook đã đăng nhưng Telegram lỗi: chỉ thử lại thông báo; không đăng lại bài.
- Nếu bài được sửa và đưa về dự phòng, kiểm tra phiên bản ảnh hoàn tất rồi mới đánh dấu sẵn sàng. Không tự đăng ngay sau thao tác sửa.
- Không có cơ chế hứa bảo đảm tuyệt đối “đăng đúng một lần” khi dịch vụ ngoài mất phản hồi; thiết kế ưu tiên tránh đăng trùng và thể hiện rõ trạng thái chưa xác minh.
- Lượt kéo dài: chỉ bù trong ngày nghiệp vụ đó; sau 23:59 giờ Việt Nam ngừng gửi yêu cầu mới cho lượt cũ và không tự dồn bài sang hôm sau. Nếu kết quả lượt cũ vẫn chưa xác minh, đối chiếu trước lượt mới; khi chưa thể xác minh thì tạm giữ lịch và báo Telegram để tránh hai lượt đăng chồng nhau. Lượt đã được xác minh thất bại không chặn bài chính ngày hôm sau. Giờ kết thúc bù sớm hơn là lựa chọn còn mở ở mục 15.
- Lưu riêng ngày dự kiến, thời điểm yêu cầu, thời điểm xác nhận và thời điểm xuất bản remote nếu lấy được tin cậy. Nếu bài cũ của hệ thống thực sự xuất bản trong ngày mới, khóa lượt ngày thực tế đó trước khi cho gửi tiếp; bài chính chưa gửi của ngày mới chuyển về dự phòng sau kiểm tra. Nhận phản hồi muộn không tự đồng nghĩa xuất bản muộn. Chưa xác minh được ngày/thành công thì tiếp tục chặn gửi mới; không lấy confirmed_at làm remote_published_at. Nếu có nhiều bài do chính hệ thống đăng vì sự cố, ghi sự cố và dừng gửi thêm, không tự xóa bài. Bài người quản lý đăng trực tiếp không tính vào giới hạn này và không làm dừng lịch tự động; không suy luận sự cố chỉ vì fanpage có nhiều bài trong ngày.
- Nếu nhiều bài khác nhau lỗi cùng một nguyên nhân, thực hiện kiểm tra sức khỏe kết nối trước khi lấy bài tiếp. Nếu lỗi vẫn thuộc riêng từng bài và kết nối hoạt động, tiếp tục dự phòng theo yêu cầu; không tự đặt giới hạn ba bài dự phòng.
- Khóa có thời hạn để phục hồi tác vụ chết, nhưng hết hạn khóa không đồng nghĩa được phép gửi lại: lượt từng gửi phải được đối chiếu. Thay cấu hình hoặc sửa bài sau đó không thay payload đang gửi.

Lần đăng đầu dự kiến lúc 10:00, thử thứ hai 10:05, thứ ba 10:10. Thời điểm chọn bài bù tùy thời gian phản hồi và đối chiếu kết quả. Retry lưu dưới dạng tác vụ có thời điểm chạy kế tiếp, không giữ tiến trình ngủ 5 phút.

### Tạm dừng, bật lại và lịch trống

| Tình huống | Quy tắc vận hành |
|---|---|
| Người dùng tạm dừng | Chặn lượt gửi mới, retry và đăng dự phòng; giữ trạng thái/lịch |
| Yêu cầu đã gửi Facebook | Tiếp tục nhận kết quả và đối chiếu; không hứa thu hồi yêu cầu từ xa |
| Telegram/lịch sử | Tiếp tục thông báo kết quả đã có và kiểm tra lịch sử, kể cả khi dừng xuất bản |
| Bật lại sau ngày chủ động dừng | Không đăng dồn những ngày đã dừng; chọn mốc tiếp tục rõ ràng |
| Slot chưa được xếp trong lịch đang bật | Tự điền dự phòng đủ điều kiện theo ưu tiên đã chốt; ghi quyết định vào nhật ký |
| Slot người dùng chủ động bỏ | Không tự bù; lưu trạng thái/lý do bỏ |
| Slot đã qua ngày | Không tự đăng bù sang hôm sau; kết quả chưa rõ vẫn phải đối chiếu |
| Bổ sung kho sau hết bài | Kiểm tra kho, chọn mốc tiếp tục và bật lại; nhập bài không tự kích hoạt đăng ngay |

Kiểm tra quyền gửi trước mỗi yêu cầu mới. UI ghi rõ: “Đã dừng các lượt gửi mới; lượt đang gửi có thể hoàn tất.” Cửa sổ giữa kiểm tra và gửi mạng không thể dùng để cam kết hủy mọi yêu cầu vừa đi ra ngoài. Sau khôi phục kết nối chỉ xử lý lượt còn hợp lệ trong ngày khi không có nguyên nhân chặn khác.

### Cố định phiên bản và xử lý chưa xác minh

Khi giữ lượt, cố định post_version, asset_version, footer_version, caption đầy đủ và đích. Retry giữ nguyên payload; sửa bài tạo bản mới, không thay payload hoặc reset số lần của lượt hiện tại. Nếu cần đổi bài, chỉ hủy lượt chưa gửi ra ngoài khi đủ điều kiện, lưu audit rồi tạo lượt khác trong cùng slot với số lần riêng; không dùng thao tác này để xóa lịch sử lỗi hoặc vượt quy tắc tối đa 3 lần cho cùng ứng viên. Lượt từng gửi nhưng chưa rõ kết quả không được hủy để né đối chiếu.

Màn hình đối chiếu hiển thị fanpage, thời gian, caption/ảnh đã gửi, ID/bằng chứng có sẵn và lịch sử gọi. Cho xác nhận bài đã tồn tại bằng URL/ID được kiểm tra đúng fanpage và đúng lượt; hoặc ghi kết luận chưa xuất bản khi có căn cứ đáng tin cậy. Tìm không thấy caption đơn thuần chưa đủ chứng minh chưa đăng. Nếu chưa có căn cứ, tiếp tục giữ chờ và báo Telegram, không gửi bài thay thế. Adapter Meta và bằng chứng đủ để kết luận phải được kiểm chứng bằng thử nghiệm thực tế.

Adapter lưu riêng giai đoạn upload/publish, số yêu cầu xuất bản và bằng chứng. Bản đầu chọn một luồng đăng một ảnh đã kiểm chứng. Retry upload không tự nhân thành nhiều lượt publish; lỗi nội dung/file không thể sửa bằng chờ được chặn/cách ly theo bảng phân loại. Retry 3 lần là mặc định cho nhánh lỗi đủ điều kiện, không bắt buộc lặp các lỗi đã biết không thể phục hồi.

Tiêu chí thành công: đúng fanpage/môi trường, có bằng chứng luồng publish đã hoàn tất và ID bài hợp lệ theo adapter được kiểm chứng. HTTP 200 hoặc ID ảnh đơn thuần chưa đủ. Tách asset_uploaded, publish_requested, confirmed_published và visibility_checked; kiểm tra hiển thị là thông tin bổ sung, không mở lại slot đã confirmed nếu đọc lại lỗi. Sự kiện Telegram thành công được tạo cùng publication/slot trong D1 khi đạt confirmed_published. Quyền/API/khả năng xác minh của Meta là hạng mục thử nghiệm thật, không suy từ đặc tả.

Chuẩn hóa ảnh trước khi pin; retry giữ caption và bytes/checksum PNG. Có thể cấp lại URL hết hạn để truy cập đúng asset bất biến, không coi đó là đổi nội dung. Phạm vi lỗi ghi rõ post_version/template/asset/connection/system; lỗi chung template, footer hoặc R2 chặn các bản bị ảnh hưởng và báo sự cố, không tiêu hao reserve như lỗi riêng từng bài.

## 7. Kho dự phòng, lịch sử và chống lặp

- Tách nội dung bài, phiên bản bài, lịch đăng, lần thử và kết quả theo fanpage. Bài kiểm thử không bị coi là đã dùng trên fanpage chính thức.
- Lưu ảnh và caption đúng phiên bản đã xuất bản; sửa bản hiện tại không ghi đè lịch sử cũ.
- Bài đã đăng thành công không tự trở lại kho dự phòng, kể cả sau khi bị xóa trên Facebook.
- Bài lỗi được giữ để người quản lý sửa, rồi đưa lại vào kho dự phòng.
- Khi lịch chính hết nhưng vẫn còn bài dự phòng sẵn sàng, tiếp tục dùng kho dự phòng cho các ngày kế tiếp. Đây là cách vận hành đề xuất để tận dụng toàn kho 40 bài.
- Khi tổng số bài chưa dùng, đủ điều kiện đăng còn tối đa 3 bài, gửi cảnh báo với số bài sẵn sàng thực tế (tương đương khoảng 3 ngày nếu đăng bình thường), không bảo đảm đủ 3 ngày khi có lỗi. Bài đang lỗi/chưa xác minh không được tính là bài sẵn sàng. Chỉ đặt lại cảnh báo sau khi bổ sung làm số bài sẵn sàng vượt 3; bổ sung ít hơn ngưỡng chỉ cập nhật số lượng, tránh gửi lặp cảnh báo.
- Khi hết bài sẵn sàng, dừng lịch đăng, gửi Telegram. Không tự sáng tác, không tự lặp bài cũ. Việc bổ sung và bật lại lịch diễn ra trên giao diện.
- Với bài mới, kiểm tra trùng nội dung chính sau chuẩn hóa và so sánh từ khóa/tiêu đề với kho lịch sử. Không để phần cuối cố định khiến mọi bài bị coi là giống nhau.
- Trùng toàn bộ thân bài sau chuẩn hóa: chặn nhập sẵn sàng. Gần giống câu chữ: cảnh báo biên tập. Cùng chủ đề nhưng khác mức độ, góc triển khai hoặc sản phẩm: có thể chấp nhận; dùng concept_id, angle, learning_level và quan hệ chuỗi để đối chiếu.
- Dùng tìm kiếm và cảnh báo mức tương đồng để hỗ trợ người biên soạn tránh trùng góc triển khai. Không dùng AI thì không bảo đảm phát hiện mọi cách diễn đạt khác nhau của cùng một ý.
- Giao diện hiển thị dự báo lịch đã đủ bài và lượng dự phòng theo nhóm, không chỉ tổng số bài. Đề xuất chủ động chuẩn bị đợt mới trước khoảng 7–10 ngày; đây là hướng dẫn biên tập, không tự bật cảnh báo Telegram sớm hơn ngưỡng 3 bài.
- Cho nhập lý do loại/xóa bài nếu người dùng biết: sai thông tin, không phù hợp, trùng hoặc lý do khác. Chỉ lý do đã xác nhận mới làm căn cứ tránh lặp vấn đề; không tự suy luận lý do từ trạng thái Facebook.

## 8. Kiểm tra Facebook và Telegram

08:00 hằng ngày: bắt đầu kiểm tra kết nối và các bài đã đăng có ID hợp lệ, theo từng nhóm nhỏ và hạn mức API. Chia tác vụ thành lô khi lịch sử lớn; không gọi toàn bộ kho trong một invocation. Lưu tiến độ để tiếp tục nếu tác vụ gián đoạn. Kiểm tra lại kết nối khi gặp dấu hiệu sự cố, không chỉ dựa vào kết quả lúc 08:00.

- Bài còn truy cập được: ghi lần kiểm tra gần nhất.
- Bài không còn truy cập được với kết nối vẫn hoạt động: ghi “không còn truy cập được trên fanpage”; không mặc nhiên kết luận người dùng đã xóa.
- Lỗi token/quyền/kết nối: ghi “chưa xác minh”; không chuyển hàng loạt bài sang trạng thái đã xóa.
- Giữ nội dung/ảnh; không gửi Telegram riêng cho từng bài không còn truy cập được.
- Lỗi kết nối ảnh hưởng vận hành vẫn gửi cảnh báo kỹ thuật theo yêu cầu chung, tránh lặp thông báo cho cùng một sự cố.

Telegram gửi khi: đăng thành công; một bài thất bại sau 3 lần; có lỗi kết nối/vận hành cần xử lý; còn tối đa 3 bài sẵn sàng; hết bài hoặc hết dự phòng trong một lượt bù. Bài bị cách ly trước khi gửi được báo với đúng lý do, không giả lập đủ ba lần. Tin lỗi kèm tên bài, số lần thử, nguyên nhân và hành động tiếp theo, không chứa token hoặc mật khẩu.

Outbox được lưu bền vững, retry và gộp cảnh báo lặp của cùng sự cố. Không bỏ thông báo thành công từng bài hoặc giấu các bài lỗi. Nếu Telegram mất phản hồi sau khi nhận tin, chống trùng thông báo chỉ ở mức best effort; không hứa tuyệt đối không trùng tin trong mọi sự cố mạng.

Retry Telegram độc lập với ba lần thử Facebook. Lỗi tạm thời dùng backoff tăng dần có giới hạn; khi có retry_after thì không gửi trước thời điểm dịch vụ cho phép. Lỗi bot bị chặn/chat sai/token/định dạng đã xác định chuyển needs_action, không retry vô ích; sau sửa kết nối tiếp tục giao sự kiện còn tồn. Mất phản hồi ghi delivery_unknown, ưu tiên không bỏ sót với retry có giới hạn tần suất và cùng event_id; có thể trùng tin. Chỉ ghi delivered khi có phản hồi hợp lệ/message_id, không suy từ HTTP đơn thuần hoặc từ việc đã thử gửi. Tin có mã sự kiện, tiêu đề, fanpage, giờ và link; dùng plain text hoặc escape định dạng, không gửi caption dài. Giữ age/tries/next_at/last_error/message_id; outbox quá hạn hiển thị cần xử lý và monitor báo theo incident, không tự xóa tin thành công chưa giao hoặc gọi lại Facebook. Giá trị backoff/tần suất được kiểm chứng trong integration test trước production. [Telegram ResponseParameters](https://core.telegram.org/bots/api#responseparameters).

Lưu last_run, last_success, tác vụ quá hạn và độ trễ so lịch; hiển thị trên tổng quan. Scheduler không chạy thì không thể tự gửi báo lỗi; bản đầu bổ sung giám sát ngoài Cloudflare theo mục 19. Nhật ký nội bộ không thay thế giám sát đó. Màn hình unknown ghi người xử lý (chủ tài khoản), hành động kế tiếp, bằng chứng và thời điểm cần chú ý; nhắc lại có giới hạn, không tự suy kết quả sau thời gian chờ.

## 9. Kiến trúc triển khai đề xuất

Toàn bộ mã nguồn và hướng dẫn nằm tại C:/Users/trant/CodexProjects/Facebook. Codex dùng để xây dựng, kiểm tra và bảo trì; chương trình triển khai lên đám mây để chạy khi máy cá nhân tắt.

| Thành phần | Giải pháp dự kiến | Vai trò |
|---|---|---|
| Giao diện | TypeScript, React và Vite | Quản lý, xem trước và dựng ảnh trong trình duyệt |
| Máy chủ | Cloudflare Workers | API, kết nối Facebook/Telegram, xác thực và xử lý lượt đăng |
| Dữ liệu | Cloudflare D1 | Bài, phiên bản, lịch, lịch sử và nhật ký thử |
| Kho ảnh | Cloudflare R2 Standard | Ảnh và tài sản thương hiệu |
| Lập lịch | Workers Cron Triggers | Kiểm tra lượt đến hạn; lịch nghiệp vụ theo giờ Việt Nam |
| Đăng nhập | Google OAuth/OpenID Connect | Xác minh tài khoản và phiên truy cập |
| Mã nguồn và phát hành | Repository riêng tư GitHub, GitHub Actions, Wrangler | Phiên bản code, kiểm tra và triển khai theo mục 16 |

Tác vụ định kỳ kiểm tra công việc đến hạn để hỗ trợ retry 5 phút; không phụ thuộc vào một lần kích hoạt duy nhất lúc 10:00. Bản đầu thử cron mỗi phút; next_attempt_at quyết định lúc gửi lại, không ngủ chờ trong tiến trình. Lưu timestamp UTC và ngày nghiệp vụ theo Asia/Ho_Chi_Minh. Bật/tắt lịch trong dữ liệu ứng dụng để có hiệu lực khi xử lý lượt; không sửa/xóa cron mỗi lần bấm tạm dừng.

SPA tĩnh, truy vấn có chỉ mục, mỗi lượt chỉ xử lý một lượng nhỏ và dựng ảnh trước giúp giảm tải. Workers Free hiện giới hạn CPU 10 ms/lượt HTTP/cron; chờ mạng không tính vào CPU. Cần benchmark đăng nhập, xử lý bài, kiểm tra lịch sử và truy vấn tương đồng trước khi nghiệm thu mục tiêu miễn phí. Nguồn: https://developers.cloudflare.com/workers/platform/limits/ và https://developers.cloudflare.com/workers/configuration/cron-triggers/.

### Cấu trúc ứng dụng

Một repo và một backend Worker có các mô-đun rõ, không dùng microservices trong bản đầu. Tách content/editorial, scheduling, publishing, integrations, persistence và observability; giao diện/export ảnh riêng. Logic chọn bài/phân loại lỗi kiểm thử độc lập, không đặt toàn bộ vào route hoặc một hàm cron dài.

```text
apps/web                 giao diện quản lý và xuất ảnh
src/content              kho bài, nguồn, phiên bản và tương đồng
src/editorial            điều kiện sẵn sàng, kiểm tra và cách ly
src/scheduling           lịch và công việc đến hạn
src/publishing           trạng thái đăng, retry và dự phòng
src/integrations         Facebook, Telegram, Google
src/persistence          D1, R2 và truy vấn
src/observability        nhật ký, sức khỏe và thông báo
templates                dữ liệu mẫu và phiên bản thiết kế
migrations               thay đổi cấu trúc dữ liệu
tests                    kiểm thử nghiệp vụ và tích hợp
docs                     thiết lập, vận hành và phục hồi
.github/workflows        kiểm tra code và phát hành
```

### Các đối tượng dữ liệu và ràng buộc

| Đối tượng | Vai trò |
|---|---|
| posts / post_versions | Danh tính bài, thân bài, hồ sơ biên tập, dữ liệu ảnh và nguồn |
| assets / sources | Tài sản và phiên bản, checksum, nguồn và thời điểm rà soát |
| page_connections | Fanpage và môi trường, tình trạng kết nối; bí mật lưu riêng phù hợp |
| schedule_slots | Lượt theo ngày Việt Nam, đích đăng, trạng thái và bài dự kiến |
| publish_jobs / attempts | Yêu cầu gửi, khóa, số lần, lỗi, next_attempt_at và kết quả chưa xác minh |
| page_publish_gates / publish_evidence / production_post_usage | Quyền gửi toàn page, bằng chứng ngoài finalization và sử dụng thành công theo bài gốc |
| publications | ID Facebook và snapshot phiên bản đã xuất bản |
| notification_outbox | Sự kiện thông báo, retry và trạng thái Telegram |
| post_checks / editorial_notes / metrics | Kiểm tra lịch sử, lý do loại đã xác nhận và kết quả nội dung |
| program_facts / fact_references | Dữ kiện chuẩn, đính chính có phiên bản và bài sử dụng |

Đây là đối tượng logic, không bắt buộc mỗi đối tượng là một bảng riêng. Thiết kế tối thiểu phải giữ được các vòng đời khác nhau, ràng buộc duy nhất slot chính thức theo fanpage + ngày, giữ bài nguyên tử, snapshot bất biến và kết quả Facebook/Telegram độc lập. Ghi kết quả Facebook cùng sự kiện outbox bằng cơ chế cơ sở dữ liệu đồng bộ phù hợp; không giữ giao dịch mở khi gọi mạng.

### Giao dịch, tài sản và khóa tác vụ

- Dùng giao dịch nội bộ D1, chẳng hạn D1 batch, để hoàn tất publication, slot và outbox cùng nhau. Ràng buộc phải bảo đảm lượt/khóa còn hợp lệ; UPDATE đổi 0 dòng không tự được coi là SQL error hay đã hoàn tất. Kiểm thử điều kiện tranh chấp và rollback khi một câu lệnh lỗi. Nguồn: https://developers.cloudflare.com/d1/worker-api/d1-database/.
- Không có giao dịch chung D1–R2–Facebook. Quy trình tài sản: bản nháp → upload key mới bất biến → kiểm tra file/metadata → hoàn tất asset và post_version trong D1 → đủ điều kiện ready. Không ghi đè ảnh được lịch sử tham chiếu.
- Upload xong nhưng ghi D1 lỗi tạo file mồ côi; tham chiếu có nhưng file thiếu phải chặn bài. Đối soát/dọn file mồ côi có thời gian đệm; không xóa tài sản còn được lịch sử, bản sẵn sàng hoặc gói sao lưu đang thực hiện tham chiếu.
- Khóa có owner token/generation cùng thời hạn và cập nhật có điều kiện. Tiến trình cũ mất khóa không được gửi mới hoặc ghi đè trạng thái mới; bằng chứng trả về từ yêu cầu đã gửi vẫn cần thu nhận qua cơ chế đối chiếu. Hết hạn khóa không chứng minh chưa đăng, và generation không hủy tác động đã gửi Facebook.
- Các bất biến bắt buộc: không chọn bản chưa hoàn tất; slot chính thức duy nhất; không gửi mới khi pause/block/unknown; retry giữ payload; snapshot bất biến; restore không tự phát lại; bài thử không đánh dấu đã dùng chính thức.

#### Khóa cấp fanpage, bằng chứng và sử dụng bài gốc

- Ngoài khóa slot, có page publish gate theo fanpage/môi trường, active_job và generation. Claim kiểm tra/cấp quyền nguyên tử cùng pause/block/day/eligibility; hai slot hoặc hai trial request khác nhau không được cùng gửi trên một fanpage. Gate dùng xuyên khoảng yêu cầu đang bay/unknown; verified failure giải phóng an toàn để retry theo lịch hoặc chọn reserve. Không giải phóng chỉ vì lease hết hạn sau publish intent; không giữ giao dịch khi gọi mạng. Trial được nhiều lượt nhưng gửi tuần tự.
- Ghi intent bền vững trước mạng. Khi nhận kết quả, tiếp nhận evidence chuẩn hóa theo attempt/job/request và remote ID, idempotent, trong thao tác lưu riêng trước finalization publication/slot/day/outbox. Có thể dùng kho evidence của attempts; không bắt buộc thêm một dịch vụ. Worker mất ownership không sửa lịch nhưng bằng chứng từ yêu cầu đã gửi vẫn được thu nhận. Evidence đã lưu không rollback theo lỗi giao dịch nghiệp vụ; tiến trình đối chiếu tiếp tục hoàn tất theo quyền hiện hành.
- Remote ID khác của cùng yêu cầu hoặc cùng ngày vẫn là sự thật cần lưu, mở incident và chặn gửi thêm; unique/day guard không được làm mất evidence. Nếu toàn bộ lưu trữ không khả dụng, không hứa lưu được phản hồi: giữ intent/unknown, đối chiếu remote, không bù bằng một lượt gửi mới. Không cam kết exactly-once.
- Theo dõi sử dụng thành công theo fanpage production + post_id gốc, có ràng buộc dữ liệu cho một lần sử dụng hợp lệ. Sửa bài/tạo version không xóa việc đã dùng. Ràng buộc này chặn chọn/gửi mới, không từ chối lưu bằng chứng hai remote ID thật nếu sự cố xảy ra. Trial có lịch sử riêng, không tiêu usage production; bài lỗi đã xác minh chưa xuất bản, sửa đạt, vẫn về reserve. Backup/restore phải bao gồm gate, evidence và usage, mặc định cách ly trước đối chiếu.

- Bắt đầu maintenance/export và ghi publish intent tranh cùng quyền thao tác authoritative ở cấp môi trường trong giao dịch có điều kiện, kết hợp page gate. Backup giữ quyền trước thì không có intent mới; publish có intent/request đang bay trước thì backup deferred. Không dùng đọc “page rảnh” rồi đặt maintenance bằng thao tác rời. Held chưa có intent có thể giữ payload nhưng không gửi khi maintenance; unknown giữ nguyên, không coi là chưa đăng. Mọi đường publish/trial/retry/backup/maintenance đều dùng hợp đồng này.
- Evidence có pending/applied/conflict, processing_generation, next_at/last_error và thời điểm. Scheduler chạy finalizer/reconciliation theo lô giới hạn trước publish mới trên page; tiến trình chết sau intake được tự tiếp tục. Confirmed evidence đủ căn cứ hoàn tất publication/slot/day guard/usage/outbox idempotent, không gọi lại Facebook hoặc yêu cầu owner xác nhận lại. Conflict giữ block và bằng chứng; evidence chưa đủ giữ unknown. D1 lỗi tạm thời chỉ retry cập nhật nội bộ, không retry remote publish. Health đo số/tuổi evidence chưa applied và tiến độ finalization, không chỉ scheduler last_run.
- D1 batch không biến UPDATE 0 dòng thành lỗi. SQL/index/conditional writes phải bảo đảm claim thất bại không tạo reservation, intent hoặc kết quả phụ sai ngay cả khi câu lệnh sau được thực thi. Không đợi đọc batch result mới sửa các ghi sai đã commit. Kiểm thử trực tiếp điều kiện này trước nghiệm thu luồng đăng; không giữ giao dịch qua mạng.

Môi trường local, staging và production dùng cấu hình riêng. Staging/production tách Worker, D1, bucket R2, OAuth redirect, secret và fanpage đích; kiểm tra đích ở máy chủ trước khi gọi API. Cùng repo và cấu trúc schema nhưng không dùng dữ liệu/token chính thức mặc định ở staging. Gắn môi trường và ID triển khai vào nhật ký. Không coi việc đổi nhãn UI hoặc chỉ sửa Page ID là chuyển môi trường đầy đủ.

### Đăng nhập, tài sản và phục hồi

Lưu bí mật trong cấu hình máy chủ; không đưa token Facebook, token Telegram hoặc client secret vào mã giao diện, kho Git hay nhật ký. Xác minh issuer, audience, expiry, email đã xác minh và allowlist Google ở máy chủ; dùng phiên an toàn, bảo vệ luồng OAuth và yêu cầu ghi. Không tin chuỗi email do trình duyệt cung cấp.

Ảnh được lưu trên kho triển khai và cung cấp cho Facebook qua luồng upload/URL đã kiểm chứng; không công khai tài liệu nguồn hay giao diện quản trị để Facebook lấy ảnh. Bản gốc và bản dẫn xuất có dấu vết phiên bản.

Bản đầu phải xuất/tải được kho bài, lịch, nguồn, lịch sử, manifest và tệp ảnh thực tế được tham chiếu (PNG xuất bản, logo/minh họa cần thiết), đồng thời diễn tập phục hồi vào môi trường thử. Gói sao lưu có thể chia nhiều phần nhưng phải kiểm tra đủ tệp/checksum; manifest hoặc URL R2 đơn thuần không thay thế bản sao ảnh. Phục hồi phải tái lập cả dữ liệu lẫn ảnh của snapshot lịch sử và đối chiếu tham chiếu, không chỉ nhập lại bảng. Không đưa bí mật đăng nhập/kết nối vào gói tải thông thường. Git không thay thế sao lưu D1/R2. Có migrations quản lý phiên bản, hướng dẫn rollback cấu hình và lịch. Sao lưu trước migration/nhập đợt/chuyển production và sao lưu định kỳ ngoài Cloudflare thuộc bản đầu theo mục 19.

Restore luôn mặc định dừng xuất bản, cách ly job/outbox được nhập để không gửi lại. Ví dụ backup 09h, Facebook đăng 10h: restore backup không được coi lượt đó chưa đăng rồi tự gửi lại. Đối chiếu các lượt từ mốc sao lưu đến thời điểm sự cố với bằng chứng remote/lịch sử còn có; chưa đủ căn cứ thì giữ chờ. Chỉ bật lại sau xác nhận trạng thái và mốc tiếp tục, không dùng trường enabled trong backup để tự resume. Outbox cũ chỉ được gửi tiếp sau khi phân loại tin đã gửi/chưa gửi; phần chưa rõ không phát lại hàng loạt.

Diễn tập restore ở staging vô hiệu hóa mọi đích/token chính thức và tác vụ tự gửi; không khôi phục secrets từ backup thông thường. Rollback code không rollback Facebook hay tự hoàn tác D1. Migration ưu tiên tương thích bản code trước/sau; sao lưu trước thay đổi cấu trúc dữ liệu và có phương án sửa tiến hoặc phục hồi có đối chiếu.

## 10. Chi phí và các kết nối cần hoàn tất

Mục tiêu: vận hành trong hạn mức miễn phí ở quy mô một người quản lý, một bài/ngày và kho ảnh nhỏ. Đây là mục tiêu kỹ thuật, không phải cam kết miễn phí vĩnh viễn.

- Workers Free hiện có 100.000 request/ngày và giới hạn CPU cho từng lượt; D1 Free hiện có 5 GB lưu trữ tổng. Thông tin: https://developers.cloudflare.com/workers/platform/pricing/ và https://developers.cloudflare.com/d1/platform/pricing/.
- R2 Standard có hạn mức miễn phí 10 GB-tháng, kèm hạn mức thao tác; cần thêm R2 subscription qua quy trình checkout và có thể phát sinh phí ngoài hạn mức. Thông tin: https://developers.cloudflare.com/r2/pricing/ và https://developers.cloudflare.com/r2/get-started/.
- Theo dõi dung lượng khi lịch sử tăng, tối ưu ảnh và cấu hình cảnh báo ngân sách; không coi cảnh báo là cơ chế chặn phí tuyệt đối.
- Không gọi API AI trong quy trình đăng. Biên soạn bổ sung kho là công việc chủ động sau này, dùng lịch sử làm tài liệu tham khảo.
- Dùng địa chỉ do nền tảng cấp cho bản đầu; chưa cần mua tên miền riêng.
- GitHub Actions cho repo riêng tư có hạn mức tính theo gói tài khoản; kiểm tra số phút, lưu trữ artifact và cơ chế tính phí thực tế trước cấu hình CI/CD. Giới hạn thời gian chạy, lưu artifact ngắn theo nhu cầu và tránh chạy live test tự đăng theo mỗi commit. Nguồn: https://docs.github.com/en/billing/concepts/product-billing/github-actions.
- Nghiệm thu tải đại diện: 40 bài, lịch sử giả lập lớn hơn, login/refresh, upload ảnh, đăng/retry/outbox, kiểm tra theo lô và export/restore. Đo phân bố CPU và các lần vượt giới hạn, không chỉ trung bình; phải có khoảng dự phòng. Nếu không đạt, giảm công việc mỗi invocation và tối ưu; nếu vẫn không đạt, trình lựa chọn gói/cấu hình cho người dùng, không bỏ cơ chế chống trùng/phục hồi để giữ miễn phí.
- Meta: tạo ứng dụng và thử luồng quyền/Page access token sớm. Quyền, access level, yêu cầu xét duyệt/xác minh và API version phải kiểm tra theo ứng dụng và fanpage thực tế; quyền quản trị fanpage không thay thế quyền truy cập API của ứng dụng. Tài liệu đăng bài trực tiếp của Meta hiện chưa truy cập được ổn định trong phiên lập kế hoạch: https://developers.facebook.com/docs/pages-api/posts/.
- Google: cấu hình OAuth, địa chỉ chuyển hướng, tài khoản được phép và vòng đời đăng nhập theo cấu hình ứng dụng thực tế.
- Telegram: tạo bot, người dùng mở cuộc trò chuyện với bot, xác định chat ID và thử gửi tin. Chỉ gửi cho chat ID của người dùng.

## 11. Các chặng xây dựng và tiêu chí hoàn thành

| Chặng | Việc thực hiện | Kết quả có thể xem/kiểm chứng |
|---|---|---|
| 0. Đặc tả và nền tảng | Chốt trạng thái/bất biến, schema, API; khởi tạo project, repo riêng tư và CI; chuẩn bị Cloudflare/Google/Meta/Telegram | Đặc tả, cấu hình local/staging/production, kiểm tra CI và checklist kết nối |
| 1. Mẫu đại diện và luồng hoàn chỉnh | 3–5 bài, 2–3 mẫu; Google login → bài/ảnh sẵn sàng → đăng fanpage thử → lịch sử → Telegram | ID/link và ảnh thực tế đúng; phiên bản lưu đúng; truy cập đúng tài khoản |
| 2. Workflow và sự cố | Scheduler, phân loại retry/dự phòng, pause, pin phiên bản, unknown, khóa, D1/outbox, tài sản và restore | Kiểm thử các bất biến, lỗi mạng, tiến trình cũ và dữ liệu phục hồi; không phát lại ngoài ý muốn |
| 3. Staging trên đám mây | CI/CD, nhiều lượt thử thủ công và lịch thật trên fanpage thử; benchmark, mobile QA, export/restore | Máy tắt vẫn chạy; đích đúng; tải đạt cấu hình chọn; dữ liệu/ảnh phục hồi được |
| 4. Hoàn thiện toàn bộ bản đầu | Mở rộng 40 bài/ảnh, 4–6 mẫu và đủ màn hình quản lý; tỷ lệ, nguồn, trùng, lịch và metric | 30 chính + 10 dự phòng đủ điều kiện; toàn bộ chức năng đã chốt sử dụng được |
| 5. Phát hành production | Release đã kiểm thử, backup/migration, tách secrets/đích, xử lý job cũ, chọn ngày và bật lịch | Release/commit truy nguyên được; smoke test không tự đăng; fanpage/ngày bắt đầu được xác nhận |
| 6. Vận hành và đánh giá đợt | Theo dõi lỗi/kho/chi phí; báo cáo nội dung, thời gian xử lý và chuẩn bị kho tiếp theo | Hướng dẫn bàn giao, quyết định biên tập có căn cứ và phương án cập nhật/rollback |

Các chặng có thể đan xen khi không phụ thuộc kết nối ngoài. Không đưa fanpage chính thức vào lượt đăng trước khi kiểm thử đạt yêu cầu. Chưa ấn định ngày hoàn thành vì việc cấp quyền Meta và thiết lập tài khoản ngoài có thể ảnh hưởng tiến độ.

Ưu tiên chứng minh luồng đầy đủ bằng bộ mẫu nhỏ trước khi sản xuất cả kho. Chặng 1–3 là bước kiểm chứng, không thay thế phạm vi cuối: chặng 4 phải đủ 40 bài, mẫu và giao diện. Kiểm thử cloud cần bao phủ lượt lịch thật, ít nhất một nhánh retry/dự phòng có kiểm soát và đối chiếu kết quả; một lần bấm “Đăng thử ngay” thành công chưa đủ. Định số lượt/ngày quan sát trong test plan sau khi quyền và hạn mức thực tế được xác minh, không dùng số ngày đơn thuần làm bằng chứng ổn định.

### Các tình huống nghiệm thu quan trọng

1. Đăng bài cùng ảnh và đúng phần cuối; nhận link Telegram; lưu đúng bản đã đăng.
2. Hai tác vụ hoặc lần bấm nút trùng nhau không tạo thêm bài.
3. Lỗi riêng một bài: đủ 3 lần, cách 5 phút, rồi chọn dự phòng đúng ưu tiên.
4. Bài dự phòng tiếp tục lỗi: đổi bài khác; ngừng sau một bài thành công hoặc hết dự phòng.
5. Lỗi mất quyền/token: ngừng dùng kho dự phòng, báo rõ sự cố.
6. Mất phản hồi Facebook: xác minh trước khi gửi tiếp; nếu không xác minh được, thể hiện trạng thái chờ xử lý.
7. Telegram thất bại sau khi bài đã đăng: không đăng lại Facebook.
8. Còn 3 bài và hết kho: cảnh báo đúng; không đếm bài lỗi như bài sẵn sàng.
9. Bài bị xóa hoặc không truy cập được: cập nhật lịch sử, giữ dữ liệu; lỗi quyền không gây đánh dấu sai toàn kho.
10. Sửa bài: ảnh mới phải hoàn tất trước khi bài sẵn sàng; bài lỗi đã sửa về dự phòng.
11. Bài thử không làm mất khả năng đăng lên fanpage chính; tác vụ cũ không chạy nhầm sau chuyển đích.
12. Tài khoản Google khác bị từ chối ở máy chủ; bí mật không xuất hiện ở trình duyệt.
13. Thử nghiệm cho nhiều lượt thủ công có ID riêng; chính thức tối đa một bài theo lịch/ngày. Không lẫn lịch sử hoặc sử dụng bài giữa hai môi trường.
14. Tiến trình chết trước/sau mỗi bước lưu hoặc gọi Facebook; khóa hết hạn không tự gây gửi lại khi chưa xác minh.
15. Giữ bài dự phòng nguyên tử; sửa nội dung ngay trước giờ đăng; nhiều bài lỗi cùng nguyên nhân; rate limit kéo dài và lượt qua ngày không dồn bài.
16. Chuyển fanpage khi còn tác vụ: chỉ hủy lượt chưa gửi, tiếp tục đối chiếu lượt đã gửi ở đích cũ.
17. Font/hình chưa tải, PNG/upload lỗi hoặc thông tin ảnh chưa đồng bộ: bản mới bị chặn, không âm thầm dùng ảnh/bản cũ.
18. Snapshot giữ đúng phiên bản footer sau đổi liên hệ; cảnh báo ngưỡng không lặp khi bổ sung nhỏ; bài cách ly không được tính là sẵn sàng.
19. Xuất và phục hồi dữ liệu, manifest và ảnh thực tế vào môi trường thử; đối chiếu checksum và ảnh của snapshot lịch sử. Rollback cấu hình/lịch không làm mất lịch sử.
20. Benchmark CPU, đọc/ghi và kiểm tra lịch sử theo lô; nhật ký last-run, tác vụ quá hạn và độ trễ hiển thị đúng.
21. Pause trước gửi, trong retry và lúc yêu cầu đang bay: không gửi mới; vẫn thu kết quả, đối chiếu và gửi Telegram; bật lại không dồn ngày đã dừng.
22. Sửa sát giờ hoặc giữa retry: lượt hiện tại giữ phiên bản/payload; bản mới chưa đủ ảnh bị chặn, không reset số lần của ứng viên.
23. Slot chưa xếp được điền đúng từ dự phòng; slot chủ động bỏ không được bù; bổ sung kho không tự đăng ngay.
24. Khóa hết hạn và worker cũ quay lại: owner generation chặn ghi đè và yêu cầu mới khi mất quyền sở hữu được xác định trước bước gửi; kiểm thử cả cửa sổ kiểm tra–gửi nêu ở mục 6. Bằng chứng của yêu cầu đã gửi vẫn được đối chiếu, không hứa thu hồi tác động mạng.
25. D1 batch lỗi/UPDATE 0 dòng và R2 upload lỗi: không tạo publication/outbox sai; file mồ côi được xử lý, ảnh lịch sử không bị ghi đè hoặc xóa.
26. Backup trước đăng, restore sau đăng: mặc định dừng, job/outbox cách ly, đối chiếu rồi mới bật lại; restore thử không gọi đích thật.
27. CI thất bại không được triển khai qua luồng phát hành; staging không có quyền/secret đăng chính thức; release SHA, cấu hình và migration khớp bản nghiệm thu.
28. Rollback code giữ publication/snapshot; migration không tương thích được phát hiện; smoke test và cập nhật code không tự đăng bài.
29. HTTP thành công chỉ có ID ảnh: không tiêu thụ slot hay báo đăng thành công khi chưa có bằng chứng publish; đọc lại lỗi không gây repost bài đã confirmed.
30. Lượt hôm trước xuất bản sau nửa đêm: khóa ngày thực tế; phản hồi muộn của bài đăng hôm trước không được nhầm thành đăng hôm sau.
31. Fact được đính chính: đánh dấu bản bài phụ thuộc cần kiểm tra; chặn yêu cầu mới của bản đã biết sai, giữ snapshot cũ và xử lý lượt đang bay/unknown.
32. Lỗi chung URL/template/asset: xác định phạm vi, chặn nhóm ảnh hưởng, cấp URL mới chỉ cho đúng bytes đã pin, không dùng hết reserve vô ích.
33. Chỉ còn reserve khác đối tượng: ưu tiên mềm đúng thứ tự, điều kiện cứng không bị vượt; số kho/cảnh báo/lựa chọn đều dùng một logic.
34. Deploy hoặc nhập lại đợt giữa retry: không reset attempts/pause/slot; import có mã đợt/mã bài và preview lỗi, không tạo trùng.
35. Scheduler ngừng nhưng UI còn hoạt động: monitor ngoài Cloudflare phát hiện nhịp lỗi; Telegram hỏng không gọi lại Facebook; cảnh báo vẫn lưu ở nơi giám sát.
36. Backup định kỳ: đọc được gói mã hóa, đủ ảnh/checksum và dữ liệu cùng mốc; restore thiếu khóa/file hoặc backup chưa hoàn tất bị từ chối; ngoài hạn mức được báo, không âm thầm mất bản sao.

Bản 4.1 mở rộng expected result trong các ca đã có, giữ 36 ca thay vì tăng số lượng hình thức: nhóm tranh chấp/crash thử hai slot/hai trial request trên cùng page; nhóm D1/qua ngày thử Facebook thành công nhưng ownership/day guard làm finalization thất bại, evidence vẫn tồn tại; nhóm lịch sử/import thử version mới của post đã dùng bị chặn production; ca backup thử export bắt đầu muộn/quá lâu, bảo trì không gỡ pause, restore đầy đủ evidence/usage/ảnh. Mỗi ca thu trạng thái trước–sau, số remote request thực tế và bằng chứng bền vững; tên ca hoặc mock pass không phải kết quả nghiệm thu live.

Bản 4.2 mở rộng ca 14/24/25: backup begin và publish intent tranh chấp cả hai thứ tự; crash sau intake confirmed tự hoàn tất usage/outbox mà không publish lại; UPDATE 0 dòng không có ghi phụ sai. Ca 35 kiểm tra Worker chết nhiều run, checkpoint monitor, cảnh báo/phục hồi/Telegram timeout. Ca 36 kiểm tra export xong nhưng copy ảnh kéo dài, backup chồng và run bị hủy. Ca 13/30 kiểm tra bài admin trực tiếp trước/sau 10h không tiêu slot/kho/day guard; bài thủ công trùng caption không được gán thành kết quả job. Giữ 36 nhóm ca, thu bằng chứng cho từng nhánh, không coi checklist là test đã đạt.

Các test retry dùng clock giả lập để không phải đợi 5 phút mỗi lần. Test tự động tập trung vào nhánh nghiệp vụ và phục hồi có rủi ro; live test xác minh quyền/API và lịch trên đám mây. Một bài đăng thử thành công chưa đủ để nghiệm thu timeout, chạy trùng hoặc mất kết nối.

## 12. Việc người dùng cần tham gia

Nguồn chương trình đào tạo và ba logo đã có; người dùng đã có tài khoản GitHub. Các bước còn cần người dùng thao tác hoặc cung cấp đúng lúc: đăng nhập GitHub/chọn nơi tạo repo riêng tư; đăng nhập/tạo Cloudflare, Google và Meta; tạo/kết nối Telegram bot; cung cấp fanpage thử nghiệm; xác nhận kết quả thử nghiệm, fanpage chính thức và ngày bắt đầu. Chưa cần thu thêm thông tin để hoàn thành kế hoạch; hướng dẫn kết nối tài khoản đi từng bước lúc triển khai.

Không yêu cầu gửi mật khẩu hay token vào trò chuyện. Hướng dẫn thiết lập sẽ đi từng bước khi triển khai. Bản hiện tại chỉ lập kế hoạch; chưa tạo tài khoản ngoài, chưa triển khai hệ thống hoặc đăng bài.

## 13. Đo lường nội dung và cải thiện kho tiếp theo

Bản đầu cho nhập kết quả thủ công theo bài và ngày quan sát: lượt tiếp cận nếu có, tương tác theo định nghĩa thống nhất, chia sẻ, bình luận có nội dung và phản hồi quan tâm ngành. Thu ở cùng mốc sau đăng, ví dụ 7 ngày, và ghi rõ nguồn metric để không so bài mới với bài đã tồn tại lâu.

- So theo mục tiêu, đối tượng, chủ đề và định dạng; không dùng tổng lượt thích làm tiêu chí duy nhất.
- Nếu tính tương tác/reach, xác định tử số và mẫu số; không diễn giải thành tỷ lệ người tương tác duy nhất nếu dữ liệu không hỗ trợ.
- Ghi lại chủ đề có phản hồi tốt, bài khó hiểu, lý do loại và sản phẩm học tập người đọc quan tâm để cải thiện đợt sau.
- Mỗi đợt khoảng 30 ngày có báo cáo ngắn và đề xuất kho mới; đây là công việc biên tập chủ động, không tự sinh bài hoặc gọi AI khi vận hành.
- Giữ lịch 10h đã chốt; chưa gọi là giờ tối ưu. Dữ liệu ít chưa đủ chứng minh một giờ/mẫu/tuyến bài tốt hơn theo quan hệ nhân quả.
- Tự động thu Insights chỉ ở chặng mở rộng sau khi xác minh quyền và metric API thực sự hỗ trợ. Không cam kết các chỉ số chưa kiểm chứng.
- Báo cáo đợt kết luận cần tiếp tục tuyến nào, đổi mở bài nào, điều chỉnh độ khó hoặc tài liệu thực hành nào. Không tự loại bài giới thiệu ngành vì lượt thích thấp khi mục tiêu khác bài thực hành. Chỉ thử thay đổi một yếu tố mỗi lần khi dữ liệu nhỏ; quan sát chưa chứng minh nhân quả.
- Theo dõi thời gian chuẩn bị kho, số bài cần sửa, thời gian xử lý lỗi thủ công và độ trễ đăng. Đánh giá cả chi phí công sức và độ tin cậy, không chỉ tương tác. Hệ thống không tự đổi tỷ lệ đã chốt theo metric.

## 14. Luồng tổng thể và ưu tiên xây dựng

```text
Biên soạn từ nguồn, lịch sử và phản hồi
→ Kiểm tra chất lượng kho và trùng lặp
→ Dựng ảnh, kiểm tra trên điện thoại
→ Hoàn tất phiên bản nội dung/ảnh/footer
→ Nhập 30 bài chính + 10 dự phòng, xếp lịch
→ 08h kiểm tra kết nối và lịch sử theo lô
→ 10h giữ lượt và snapshot, gọi Facebook
  → Thành công: lưu lịch sử + outbox Telegram
  → Lỗi riêng bài: retry đủ điều kiện / dự phòng
  → Lỗi kết nối: dừng / báo
  → Chưa xác minh: đối chiếu / giữ chờ
→ Thu kết quả và ghi chú biên tập
→ Cải thiện đợt nội dung tiếp theo
```

| Ưu tiên | Phạm vi | Điều kiện hoàn thành |
|---|---|---|
| P0 — trước vận hành chính thức | Kết nối Meta/tiêu chí publish; Google allowlist; retry/unknown/pause/pin/qua ngày; eligibility; khóa có generation; D1/snapshot/outbox; tài sản/facts; restore; giám sát độc lập và backup định kỳ; tách môi trường; CI/phát hành; chất lượng kho | Có kết quả kiểm thử quyền, tranh chấp, timeout, qua ngày, restore/monitor/backup và release; không gửi nhầm đích hoặc tự phát lại |
| P1 — trong bản đầu | Mẫu đọc được; hồ sơ biên tập; nhiều lượt thử; last-run; nhật ký; backup/restore; nhập metric và lý do loại bài | Quản lý, sửa, phục hồi và đánh giá đợt được qua giao diện |
| P2 — sau khi vận hành | Insights API, lưu trữ backup dài hạn hơn mặc định, giám sát chuyên dụng có SLA nếu cần, tối ưu dựa vào dữ liệu | Chỉ thực hiện khi quyền, nhu cầu và chi phí đã được kiểm chứng |

## 15. Những lựa chọn chính sách còn mở

Các lựa chọn sau không chặn thiết kế bản đầu và không tự thay đổi yêu cầu đã chốt:

| Lựa chọn | Cách vận hành trong kế hoạch hiện tại | Phương án có thể chốt sau |
|---|---|---|
| Giờ kết thúc đăng bù | Chỉ bù trong cùng ngày, ngừng gửi mới sau 23:59 giờ Việt Nam | Kết thúc sớm, chẳng hạn 18h, để tránh xuất bản quá muộn |
| Cảnh báo kho sớm qua Telegram | Giữ ngưỡng tối đa 3 bài sẵn sàng; giao diện có dự báo sớm | Thêm ngưỡng nhắc chuẩn bị 7–10 ngày nếu người dùng muốn |
| Giám sát chuyên dụng | Bản đầu có monitor ngoài Cloudflare bằng GitHub Actions theo mục 19 | Nâng dịch vụ/tần suất khi cần, không giả định lịch Actions có SLA |
| Tự thu kết quả nội dung | Nhập thủ công trong bản đầu | API Insights sau khi kiểm chứng quyền/metric |

Không thay phần cuối bắt buộc, không tự tái đăng bài lịch sử, không bổ sung duyệt hằng ngày, không bật AI hoặc tự sinh thêm bài. Việc cập nhật kế hoạch không tự kích hoạt các tài khoản ngoài hoặc lượt xuất bản.

## 16. GitHub, kiểm tra tự động và phát hành

### Vai trò và cấu hình repository

Codex xây dựng/kiểm tra mã tại project; GitHub lưu mã và lịch sử thay đổi; Cloudflare chạy giao diện, API và scheduler. Đưa code lên GitHub hỗ trợ phát hành kiểm soát được, không tự bảo đảm ổn định.

- Tạo một repository riêng tư trong tài khoản người dùng; tên repo chọn khi thiết lập, chưa tạo trong giai đoạn lập kế hoạch. Bản đầu không cần nhiều repo hay nhánh tồn tại lâu.
- Nhánh main giữ code đã qua kiểm tra. Mỗi thay đổi đáng kể dùng nhánh ngắn và pull request để xem diff/kết quả CI; một chủ sở hữu không cần giả lập người duyệt thứ hai.
- Tag/release đánh dấu bản nghiệm thu, chẳng hạn v0.1.0 cho bản thử đầu và v1.0.0 cho bản chính thức đầu. Lưu commit SHA, phiên bản schema, cấu hình không bí mật, kết quả kiểm thử và hướng dẫn nâng cấp/rollback.
- Commit code, lockfile, cấu hình môi trường mẫu, migrations, templates, tests và hướng dẫn. Font/logo/tài sản chuẩn chỉ commit khi phù hợp quyền sử dụng và kích thước; ảnh kho xuất bản, backup và dữ liệu vận hành lưu riêng trên D1/R2 và gói sao lưu. PDF nguồn không tự tải lên GitHub chỉ vì repo riêng tư; lưu chỉ mục/manifest nguồn, chọn phạm vi đồng bộ tài liệu khi thiết lập.
- .gitignore loại .env/.dev.vars, token, secrets, build output, dữ liệu DB cục bộ, backup, log, file tạm và dữ liệu riêng. .env.example chỉ có tên biến/giá trị mẫu. Secret đã lộ phải thay, xóa file khỏi commit mới không đủ xử lý lịch sử Git.
- Có README, SETUP, RUNBOOK, BACKUP-RESTORE, RELEASE và TEST-PLAN trong docs; phiên bản kế hoạch/spec đi cùng mã nguồn để tránh vận hành theo mô tả cũ.

### Lựa chọn CI/CD cho bản đầu

Chọn GitHub Actions làm một đầu mối kiểm tra và triển khai bằng Wrangler. Cloudflare Workers Builds có tích hợp GitHub, nhưng không bật đồng thời hai pipeline tự triển khai cùng một Worker. Nếu đổi sang Workers Builds sau này, giữ điều kiện kiểm tra đạt và bỏ pipeline triển khai trùng. Nguồn: https://developers.cloudflare.com/workers/ci-cd/builds/ và https://developers.cloudflare.com/workers/wrangler/environments/.

| Sự kiện | Việc chạy | Điều kiện |
|---|---|---|
| Pull request / thay đổi code | Cài theo lockfile, lint, typecheck, build web/Worker, test nghiệp vụ/tích hợp giả lập | Không dùng production secrets; không tự gọi Facebook để đăng |
| main sau kiểm tra đạt | Triển khai staging và kiểm tra sức khỏe/đích/cấu hình | Dùng riêng D1/R2/secrets thử; scheduler thử chỉ bật khi test plan cần |
| Live test trên fanpage thử | Chủ động bấm “Đăng thử ngay” hoặc bật lịch thử có kiểm soát | Có fanpage thử đã xác nhận; lưu ID, phiên bản, kết quả và Telegram |
| Phát hành chính thức | Workflow khởi chạy có chủ đích từ release/commit đã nghiệm thu | Chạy lại kiểm tra cần thiết trên đúng SHA; chặn chạy đồng thời; backup/migration/config được kiểm tra |
| Sau triển khai | Smoke test login/API/DB/assets/môi trường/last-run và đối chiếu phiên bản | Không tạo bài thử tự động trên fanpage chính thức |

Không tự triển khai production chỉ vì có commit mới. Tách việc phát hành code khỏi bật lịch xuất bản: bản mới có thể được triển khai khi lịch vẫn dừng; bật lần đầu sau khi xác nhận fanpage và ngày bắt đầu. Đây là kiểm soát phát hành phần mềm, không thêm bước duyệt từng bài hằng ngày.

Workflow production dùng commit SHA bất biến đã thử, không lấy một HEAD khác trong lúc triển khai. Giữ lockfile, phiên bản công cụ và build config; dựng đúng SHA với cấu hình môi trường đích, ghi deployment ID để truy nguyên. Không đưa lịch sử runtime/secret staging sang production khi chuyển bản.

### Bí mật, quyền và kiểm soát triển khai

Runtime secrets Google/Meta/Telegram lưu ở Cloudflare theo môi trường. GitHub chỉ cần thông tin triển khai tối thiểu, chẳng hạn token Cloudflare được giới hạn tài nguyên/quyền cần thiết và account ID; không sao chép token fanpage vào CI nếu workflow không cần. Dữ liệu secret không vào artifact hoặc output. Test dùng adapter giả lập/môi trường thử.

Ngoại lệ có phạm vi cho hai job vận hành ở mục19: GitHub giữ credential đọc health, export/backup và Telegram secret phục vụ monitor ngoài Cloudflare; không có quyền publish Facebook hay đổi cài đặt. Backup credential được gọi begin/status/finish của chính backup để đặt/gỡ maintenance có owner; không được sửa paused_by_user, block/unknown hoặc đích/kết nối. Export D1 dùng quyền nền tảng tối thiểu kiểm chứng riêng. Backup chỉ dùng public recipient key để mã hóa, không giữ private identity key. Không đưa runtime secrets vào artifact backup.

Dùng concurrency cho triển khai cùng môi trường và không hủy giữa chừng migration đã bắt đầu. Migration cần trình tự, bản sao trước khi đổi, kiểm chứng schema và khả năng tương thích code; retry deployment không tự áp dụng thao tác phá dữ liệu lần nữa. Khi cần migration rủi ro, dừng gửi mới theo mục 6, giải quyết lượt đang bay và xác nhận trạng thái trước thay đổi.

Khả năng branch protection, required checks và deployment approval phụ thuộc gói GitHub và loại repo. Kiểm tra tài khoản khi thiết lập, không giả định repo riêng tư miễn phí có mọi tính năng duyệt. Dù thiếu cơ chế duyệt nền tảng, workflow vẫn phải kiểm tra đúng SHA, điều kiện đạt và chỉ phát hành production có chủ đích; không coi đây là bảo đảm chống chủ repo cố tình bỏ qua. Nguồn: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments.

### Khi phát hành có lỗi

1. Nếu có nguy cơ đăng trùng/nhầm đích, dừng yêu cầu xuất bản mới; tiếp tục nhận kết quả và đối chiếu lượt đang gửi.
2. Xác định release, cấu hình/schema và phạm vi ảnh hưởng qua nhật ký đã loại secrets.
3. Rollback về code tương thích đã biết hoặc sửa tiến; không phục hồi DB cũ chỉ để rollback code.
4. Nếu phải restore dữ liệu, áp dụng quy trình mặc định dừng, cách ly job/outbox, phục hồi ảnh và đối chiếu remote ở mục 9.
5. Smoke test và xác nhận mốc tiếp tục trước bật lại; không tự đăng bù ngày cũ hoặc gọi Facebook như một phép kiểm tra sức khỏe.

## 17. Checklist triển khai và bàn giao

### Đầu ra theo thứ tự phụ thuộc

| Bước | Đầu ra bắt buộc | Điều kiện chuyển bước |
|---|---|---|
| A. Đặc tả chi tiết | Quy tắc trạng thái, bất biến, schema/migrations, API, test plan và cấu hình môi trường | Không còn mơ hồ về pause, pin, unknown, stock, restore và đích |
| B. Nền tảng GitHub/cloud | Repo riêng tư, CI, local/staging/production tách, secrets đúng nơi và docs thiết lập | Build/test giả lập đạt; xác thực và kết nối thử được kiểm chứng |
| C. Luồng mẫu hoàn chỉnh | 3–5 bài có nguồn/ảnh, 2–3 mẫu, đăng thử, lịch sử và Telegram | Kết quả Facebook thật đúng fanpage, caption, ảnh và ID |
| D. Độ tin cậy | Retry/dự phòng, pause, phiên bản, reconciliation, D1/R2, khóa, export/restore | Những tình huống nghiệm thu rủi ro đạt; không còn lỗi chặn production |
| E. Staging và mở rộng | Lịch cloud, benchmark, đủ 40 bài/ảnh, 4–6 mẫu, toàn bộ GUI và hồ sơ biên tập | Mobile QA, tỷ lệ, nguồn, lịch, dự phòng và mục tiêu chi phí đạt |
| F. Release chính thức | Tag/SHA nghiệm thu, backup, migration, cấu hình đích và ngày bắt đầu | Người dùng xác nhận kết quả thử và fanpage/ngày bắt đầu; smoke test đạt |
| G. Bàn giao | Hướng dẫn sửa/bổ sung, dừng/bật, đối chiếu, token, backup/restore, update/rollback và báo cáo đợt | Người dùng thực hiện được thao tác chính; biết giới hạn và tình huống cần xử lý |

Codex thực hiện đặc tả, code, tests, mẫu, biên soạn và tài liệu; thao tác đăng nhập/cấp quyền ngoài cần người dùng tham gia đúng lúc. Tiến độ đo bằng đầu ra nghiệm thu, không hứa ngày hoàn thành trước khi quyền Meta và tài khoản triển khai được kiểm chứng.

### Điều kiện đưa vào vận hành

- Kho 40 bài/ảnh hoàn tất, nguồn và footer đúng, lịch/dự phòng đủ điều kiện; không có bản đang sửa nằm trong lượt tự động.
- Các nhánh P0 và khả năng backup/restore đạt; staging/production tách thực tế; không có lượt chưa xác minh bị bỏ quên khi chuyển đích.
- Release truy nguyên được, CI đạt, tải/hạn mức và cấu hình chi phí được kiểm tra; code rollback không làm phát lại dữ liệu.
- Google allowlist hoạt động phía máy chủ, secrets không xuất hiện ở repo/trình duyệt/log, Telegram và các trạng thái sự cố thử thành công.
- Fanpage chính thức và ngày bắt đầu được xác nhận; production chỉ bật lịch theo cấu hình đó. Cập nhật kế hoạch này chưa thực hiện bất kỳ bước kết nối, push code, triển khai hoặc đăng nào.

### Tóm tắt các lần cập nhật

Giữ yêu cầu vận hành đã chốt; bổ sung ma trận giao nhau và mức độ nội dung, mẫu thử khó và phiên bản renderer, pause/pin/slot/unknown, giao dịch D1 và hoàn tất R2, khóa có generation, restore mặc định dừng, benchmark đại diện, GitHub/CI/CD và release/rollback. Đổi thứ tự xây dựng để chứng minh luồng mẫu và sự cố trước khi hoàn thiện cả kho. Những mở rộng ở mục 15 vẫn là lựa chọn chưa bật.

Phiên bản 4.0 bổ sung success theo giai đoạn, ngày xuất bản thực tế, ưu tiên reserve mềm, phạm vi sự cố, facts/ảnh có dữ liệu cấu trúc, monitor và backup trong bản đầu, 36 ca nghiệm thu cùng cổng hoàn tất kế hoạch trước code. Không biến 40 brief thành 40 bài ready và không coi việc viết kế hoạch là kiểm thử đạt.

Phiên bản 4.1 tích hợp DANH-GIA-KE-HOACH-V4.md: rubric năm tiêu chí, coverage theo bài đủ điều kiện, nghiệm thu ảnh theo ngữ cảnh; page gate nguyên tử, evidence ngoài finalization, usage theo bài gốc; full export D1 phối hợp bảo trì, monitor gần giờ đăng và benchmark dung lượng/retention. Đồng bộ THIET-KE-TRUOC-CODE.md; chưa tạo code hoặc tài khoản dịch vụ.

Phiên bản 4.2 ngày 05/10 tích hợp DANH-GIA-WORKFLOW-V4-1.md và đính chính bài thủ công: một bài tự động/ngày, bài trực tiếp bổ sung độc lập. Thêm giao thức maintenance–intent, finalizer, bảng trạng thái chính, tách export/assets/package, serialize backup/migration và checkpoint monitor ngoài Cloudflare; Telegram có retry riêng. Giữ chiến lược, giờ đăng, footer, logo, no-AI runtime; chưa viết ứng dụng.

## 18. Quyết định nghiệp vụ và hợp đồng dữ liệu trước code

### Các giá trị hiện hành

| Hạng mục | Quyết định của bản kế hoạch này |
|---|---|
| Ngành / chuyên ngành / khóa / thời gian | Kinh tế số / Kinh doanh số / 2026 / 3,5 năm theo xác nhận người dùng |
| Lịch xuất bản / kiểm tra lịch sử | 10:00 / 08:00 Asia/Ho_Chi_Minh; cron kiểm tra công việc đến hạn mỗi phút |
| Retry / hạn gửi mới của ngày | Tối đa 3 lần tổng cộng mỗi ứng viên, mặc định 5 phút cho lỗi hợp lệ; không gửi mới từ 00:00 ngày kế tiếp |
| Giới hạn chính thức | Một bài tự động/ngày theo slot và ngày remote của lượt hệ thống; bài admin đăng trực tiếp là bổ sung độc lập, không tiêu slot/usage, không yêu cầu skip/pause và không chặn lịch |
| Kho / AI | 30 chính + 10 reserve, không tự sinh/recycle, không API AI lúc vận hành |
| Chất lượng | Kiểm tra trước nhập ready và sau sửa; không duyệt từng lượt đăng hằng ngày |
| Reserve | Nhóm trước đối tượng, rồi mức khác góc; điều kiện hợp lệ cứng không đổi |
| Ngưỡng kho | Báo ≤3 bài hợp lệ; 0 thì dừng và báo; giao diện dự báo sớm, chưa có Telegram nhắc kho 7–10 ngày |
| Unknown | Báo lần đầu; nếu chưa xử lý sau 60 phút thì nhắc tối đa một lần mỗi ngày/sự cố; không tự gỡ block hoặc đặt kết luận theo timeout |
| Giám sát / backup | Bắt buộc trước production, mặc định ở mục 19; không yêu cầu máy tính người dùng bật |
| Triển khai | Một pipeline Actions/Wrangler, staging tự động sau CI; production có chủ đích theo SHA đã nghiệm thu, không tự bật lịch |

Giới hạn theo ngày áp dụng ở mức hệ thống gửi yêu cầu và bằng chứng thu được; không bảo đảm tuyệt đối thời gian hoàn tất của dịch vụ ngoài. Khi phát hiện remote publication ngoài ngày dự kiến, ghi publication/actual-day guard nguyên tử và đối chiếu mọi slot ảnh hưởng. Lượt ngày mới chưa gửi được đánh dấu replaced_by_late_publication, chuyển ứng viên về reserve nếu vẫn hợp lệ; lượt đã gửi thì giữ sự cố/đối chiếu, không tự xóa hoặc giả kết quả. Bài chính bị bỏ do lỗi/qua ngày không đẩy lùi toàn bộ lịch đã xếp.

### Dữ kiện chuẩn và đủ điều kiện đăng

program_facts lưu key, value, cohort, source_id hoặc user_confirmation, confirmed_at, version và ghi chú đính chính. fact_references nối phiên bản bài với fact/version được sử dụng. Không tự thay mọi con số trong PDF. Khi fact/source thay đổi, đánh dấu bản liên quan needs_review, giữ lịch sử và snapshots đã pin. Nếu xác nhận bản pin sai thì đặt block_reason cho yêu cầu mới của bản đó; lượt đã gửi vẫn đối chiếu, không gửi bản sửa để thay thế khi kết quả cũ chưa rõ. Xử lý xong bản lỗi rồi đưa về reserve theo quy tắc hiện có.

Đối tượng tối thiểu của một post_version: body, caption_title, image_headline, image_points, image_description, group, primary_audience, secondary_audiences, concept_id, angle, learning_level, learning_outcome, source_refs, fact_refs, template/renderer/font_version, asset_id/checksum, editorial_check_version, review_due_at, status và version. Metadata biên tập có thể lưu JSON với schema; không cần tạo một bảng cho từng trường.

Một bộ đánh giá eligibility trả eligible và reason_codes cho phiên bản/đích/ngày cụ thể; dùng cho UI, stock, forecast, cảnh báo và selection. Điều kiện gồm nguồn/facts còn hợp lệ, nội dung/ảnh đồng bộ được xác nhận, asset hoàn tất, footer hợp lệ, chưa dùng trên đích, không reserved/blocked/unknown, mốc rà soát và tiền đề chuỗi. Publish claim kiểm tra lại điều kiện và unique constraints trong thao tác nguyên tử; số hiển thị chỉ là snapshot, không đặt quyền gửi dựa vào count của trình duyệt.

Cấu hình footer hiện hành được kiểm tra trước claim và pin trong payload. Sửa thông tin liên hệ không thay payload đang bay; đính chính quan trọng đã xác nhận có thể chặn yêu cầu mới của bản pin và đưa lượt vào xử lý giống fact. Nếu preview/import có footer dán sẵn, phải tách/xác minh trước ready để chỉ nối một lần, không xóa tự động phần thân dựa vào đoán chuỗi.

### Chuyển trạng thái và hành động hợp lệ

Đây là bảng chuyển trạng thái làm căn cứ chính; schema/API/runbook tham chiếu, không duy trì bảng hành vi khác. Các ghi “nguyên tử” là giao dịch nội bộ có conditional writes/constraints đã kiểm thử, không phải giao dịch xuyên mạng.

| Trạng thái / Sự kiện | Kết quả | Điều kiện và thay đổi bền vững | Mạng được phép / phục hồi |
|---|---|---|---|
| draft / kiểm tra đạt | ready | Rubric, nguồn/facts, ảnh/check_version hoàn tất | Chưa publish; lỗi giữ needs_review |
| ready / claim | held | Slot/ứng viên/page gate/generation và payload được giữ nguyên tử; claim 0 dòng không có ghi phụ sai | Chưa publish; đọc lại trạng thái nếu mất phản hồi D1 |
| held hoặc retry_wait đến hạn / gửi | publish_requested | Cùng giao dịch kiểm tra owner/page gate/day/pause/block/maintenance và ghi attempt/intent; quyền môi trường phải cho phép gửi | Gửi đúng request đã ghi; crash sau intent giữ unknown, không tự gửi lại |
| requested / phản hồi adapter | evidence_pending | Intake idempotent riêng, gắn đúng page/job/attempt/remote; không cần worker cũ còn ownership | Không publish thêm; finalizer được tiếp tục sau crash |
| evidence_pending / confirmed đủ căn cứ | confirmed_published, evidence_applied | Finalizer có quyền hiện hành ghi publication/slot/day/usage/outbox nguyên tử, không xóa intake khi lỗi | Không gọi lại Facebook; retry finalization nội bộ nếu D1 lỗi |
| evidence_pending / conflict ngày/usage/remote ID | evidence_conflict, page_blocked | Lưu sự thật và incident, không bỏ evidence để thỏa unique | Đối chiếu; không gửi mới, không tự xóa bài |
| requested / từ chối rõ đủ điều kiện retry | retry_wait | Evidence xử lý, attempts còn, payload giữ, next_at; giải phóng quyền gửi an toàn | Chờ lịch; retry phải claim lại quyền môi trường/page |
| retry hết hoặc lỗi không thể retry / verified failure | failed | Giữ bài lỗi/evidence; slot trong ngày có thể chọn reserve | Không sửa nội dung để né chính sách; reserve theo cùng claim |
| requested / phản hồi không rõ | unknown | Giữ page gate và evidence/intent; báo, lưu lịch đối chiếu | Chỉ đọc/đối chiếu; không release vì timeout/không thấy caption |
| unknown / bằng chứng đủ | evidence_pending → confirmed hoặc verified_failed | Kiểm tra đúng đích/request, ngày remote; finalizer áp dụng theo các hàng trên | Không nhận bài admin trùng caption làm kết quả job |
| môi trường rảnh / backup begin | export_maintenance | Quyền bảo trì có owner/generation được giữ nguyên tử, không có request đang bay; intent mới bị chặn | Export D1; nếu publish thắng trước thì backup deferred |
| export đang chạy / kết thúc được xác minh | database_export_finished | DB hoạt động, manifest tài sản snapshot/pin có căn cứ; gỡ riêng export maintenance đúng owner | Copy/mã hóa/upload tài sản, chưa backup_complete; giữ pause/block/unknown |
| assets/package / đủ checksum và file | backup_complete | Có đủ snapshot/manifest/tài sản/gói; giải phóng pin theo run | Restore chỉ nhận complete; lỗi partial không được coi là bản tốt |
| pause hoặc resume | Cho phép/chặn yêu cầu mới | Chỉ đổi pause của owner; không gỡ block/maintenance/unknown hay dồn ngày bỏ | Lượt đã gửi vẫn thu bằng chứng; không hứa hủy mạng |
| fact/asset/template sai | needs_review hoặc blocked | Chặn đúng phạm vi gồm retry chưa gửi, không sửa snapshot cũ | Lượt đã gửi đối chiếu, không tự đăng bản sửa |
| restore | restored_quarantined | Jobs/outbox/gates/usage/evidence được cách ly, đối chiếu sau mốc backup | Không xuất bản tới khi owner chọn mốc tiếp tục an toàn |

held quá hạn chỉ được giải phóng nếu chứng minh chưa có ý định gửi ra ngoài; nếu đã publish_requested thì chuyển/giữ unknown. UI tránh thao tác “reset” biến unknown thành unsent. Mọi hành động thay trạng thái lưu actor, time, previous/new state và reason, không chứa bí mật.

### API và màn hình cần đặc tả

Trước code xác định schema request/response và kiểm soát quyền cho: auth/session; facts/sources; posts/versions/render-assets; import/export; stock/schedule/skip; pause/resume; trial-publish; jobs/reconcile; publications/history; metrics; settings/connections; backup/restore; health-monitor. Đây là nhóm API logic, không buộc một endpoint/bảng riêng cho mỗi tên.

Mutation dùng validation phía server và request ID khi có nguy cơ lặp. Import có batch_id/post_id/version, preview lỗi từng dòng và commit đợt hợp lệ; nhập lại cùng đợt không tạo bản trùng hoặc reset lịch/attempts. Không nhúng tokens vào JSON kho. Chuẩn bị wireframe các màn hình chính và thông điệp trạng thái; health-monitor/backup là quyền dịch vụ riêng, không mở API quản trị công khai.

## 19. Giám sát độc lập, sao lưu và bảo trì của bản đầu

### Giám sát ngoài Cloudflare

Dùng GitHub Actions chạy độc lập với Worker mỗi giờ, ở phút 17 để tránh lịch tập trung đầu giờ. Job đọc endpoint health có xác thực chỉ trả metadata tối thiểu: deployment/environment, checked_at, scheduler last_run/last_success, lượt đến hạn/trạng thái, unknown, outbox và backup gần nhất. Không trả caption, dữ liệu cá nhân hoặc credentials. Job không có quyền xuất bản Facebook. Với app chết không trả health, monitor vẫn có thể gửi Telegram trực tiếp bằng secret riêng.

Phương án trạng thái monitor bản đầu: checkpoint JSON nhỏ trong artifact repo private GitHub, độc lập Cloudflare; không dùng Actions cache làm sổ incident. Schema gồm environment, observation_seq/time, incident_key, first_seen, last_alert, delivery_state/message_id, recovery và checksum/schema_version. Monitor runs cùng môi trường serialize, không cancel run đang gửi. Đọc checkpoint hợp lệ mới nhất theo thứ tự observation, kể cả run có kết luận failed nhưng đã lưu checkpoint; không chọn chỉ theo tên hoặc workflow success. Ghi send intent trước và kết quả sau Telegram, đặt retention tối thiểu bảy ngày nếu quota/API đã kiểm chứng, tính cả dung lượng/số artifact vào budget. Không lưu caption, secret hoặc quyền publish. Nếu checkpoint thiếu/hỏng/hết hạn hoặc ghi thất bại thì báo best effort có thể lặp, log giới hạn, không coi đã giao/gộp thành công. Chỉ gửi tin phục hồi nếu có incident trước với bằng chứng cảnh báo đã được tiếp nhận; trạng thái delivery_unknown không được gọi là đã giao. Đây là quyết định cần thử quyền/API artifact trước production; nếu không đạt phải trình giải pháp trạng thái tương đương, không âm thầm bỏ gộp cảnh báo.

Mặc định cảnh báo khi scheduler heartbeat quá 15 phút (ngoài trạng thái bảo trì đã ghi), có lượt hợp lệ trễ hơn 30 phút hoặc health không truy cập được sau một lần kiểm tra lại trong job. Lượt đang retry/rate limit/unknown/pause có lý do phải được phân loại, không quy thành “scheduler chết”. Unknown nhắc theo mục 18. Monitor không đăng bài bù hoặc tự restart publishing; chỉ báo và ghi sự cố. Cảnh báo cùng incident gộp; khi phục hồi gửi một tin và đóng incident.

Monitor theo giờ có độ trễ phát hiện phụ thuộc lịch chạy/queue, không SLA 15 phút. GitHub schedule có thể trễ hoặc bị bỏ khi tải cao; runbook kiểm tra Actions bị tắt/quota khi monitor im lặng. Nếu Telegram hỏng, lưu kết quả job và sự cố, sử dụng thông báo lỗi workflow của GitHub theo cấu hình tài khoản; không coi đó là kênh Telegram đã giao thành công. Giám sát chuyên dụng tần suất cao hơn là nâng cấp tùy nhu cầu. [Giới hạn schedule của Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Bổ sung kiểm tra trước giờ đăng 09:47 và sau giờ đăng 10:47 Việt Nam (02:47/03:47 UTC), kiểm chứng quota cùng hourly monitor trước production. Lượt 09:47 kiểm tra kết nối/kho/heartbeat; lượt 10:47 áp dụng phân loại trễ/unknown như hourly, không tự đăng bù. Nếu chỉ chạy hourly, ngưỡng stale 15 phút có thể dẫn tới khoảng 75 phút mới phát hiện trong kịch bản bình thường, chưa tính queue. Hai lượt thêm vẫn best effort, không SLA. GitHub đồng thời giữ CI/monitor/backup nên mất GitHub có thể ảnh hưởng cả ba; ghi giới hạn này khi bàn giao, không mô tả là độc lập mọi điểm hỏng.

### Sao lưu ngoài điểm hỏng

Mặc định sao lưu tự động một lần/ngày lúc 04:20 giờ Việt Nam (21:20 UTC ngày trước), bằng job GitHub Actions; lịch này độc lập 08h kiểm tra/10h đăng và không cần máy tính cá nhân. Tạo thêm bản trước migration, nhập đợt lớn và chuyển production. Không hứa job luôn chạy chính xác giờ; ghi thời điểm hoàn tất thực tế và báo nếu không có backup thành công trong 30 giờ.

Gói gồm dữ liệu theo snapshot nhất quán, mốc backup/schema/deployment, manifest, checksum và ảnh/tài sản thực tế được tham chiếu. Lấy mốc dữ liệu trước rồi xuất tài sản bất biến theo manifest; không dọn ảnh đang được backup tham chiếu. Chia phần/stream, không gom toàn bộ PNG vào RAM Worker. Backup thiếu file, checksum sai hoặc xuất dữ liệu không nhất quán không được đánh dấu complete.

Chọn full export D1 được nền tảng hỗ trợ cho bản đầu, chạy từ job GitHub với quyền nền tảng tối thiểu đã kiểm chứng; token monitor/API đọc logic không mặc nhiên có quyền export D1. Không dùng phân trang JSON trong lúc ghi để giả định snapshot nhất quán. Chưa dùng FTS5 trong D1 chính; tìm kiếm ban đầu theo metadata/SQL phù hợp quy mô. Export D1 đang chạy chặn yêu cầu database khác và có hạn chế virtual tables. [Tài liệu export D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Runbook backup: tạo maintenance với owner/reason/time riêng trước export; chặn mutation nghiệp vụ và request publish mới, chờ các request đang bay về trạng thái có căn cứ hoặc unknown được giữ nguyên. Không coi lease hết hạn là chưa đăng. Lấy snapshot/manifest rồi sao chép tài sản bất biến; pin tham chiếu tới khi complete/fail. Mặc định không bắt đầu export định kỳ trong khoảng 09:30–11:00 Việt Nam hoặc khi một request publish còn đang bay; job đến muộn phải ghi deferred, thử ngoài khoảng này và vẫn theo dõi tuổi backup 30 giờ. Export đã chạy quá lâu phải cảnh báo, xử lý trạng thái nền tảng trước khi kết thúc bảo trì; không hứa tự hủy nếu API chưa kiểm chứng hỗ trợ. Trước production đo thời gian export để đặt timeout/runbook cụ thể. Hết job/lease không tự bật lại publishing; chỉ bỏ maintenance của chính backup khi xác nhận export đã kết thúc và database truy cập được, giữ nguyên paused_by_user/block/unknown.

Backup begin/maintenance và publish intent phải tranh quyền môi trường như mục 18; không thực hiện check-then-set rời. Pha export chỉ giữ bảo trì trong thời gian lấy snapshot/manifest nhất quán. Sau khi export kết thúc và DB truy cập được, gỡ riêng maintenance của export đúng owner, tiếp tục copy/mã hóa/upload các tài sản bất biến đã pin; package chưa đủ vẫn partial, không dùng restore. Dữ liệu mới sau snapshot không nhập lẫn vào gói. Pin tài sản và snapshot manifest được hoàn tất/kiểm chứng trước khi cho dọn tài sản; lỗi pin/manifest giữ trạng thái lỗi an toàn để xử lý.

Daily/manual/pre-migration backup và thao tác migration/production release có nhóm concurrency theo môi trường, không cancel-in-progress đối với thao tác có tác động dữ liệu. Backup trước migration chạy trong cùng luồng đã giữ quyền, không dispatch một workflow cùng nhóm rồi chờ gây deadlock. Khóa ứng dụng vẫn authoritative với các đường ngoài Actions. Run bị hủy/crash chỉ được tiếp tục sau kiểm tra trạng thái export/maintenance/owner; không tự gỡ khóa theo lease. [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

Phương án đầu: mã hóa gói trước upload thành artifact trong repo riêng tư GitHub, giữ tối thiểu ba bản ngày gần nhất hoàn tất theo ngân sách kiểm chứng, kèm bản trước migration cho đến khi xác nhận nâng cấp đạt. Công cụ mã hóa và định dạng manifest ghi rõ trong BACKUP-RESTORE trước triển khai; dùng public key cho job mã hóa, private key do chủ tài khoản giữ ngoài repo/Cloudflare/CI. Phải diễn tập giải mã và restore; không có private key là không phục hồi được. Không chứa runtime secrets trong gói. Artifact không commit vào lịch sử Git và không phải lưu trữ vĩnh viễn.

Retention/ngân sách có thể phải điều chỉnh trước production nếu dung lượng thực tế vượt hạn mức. Kiểm tra tổng quota còn lại của tài khoản, cả CI/monitor/artifact, không chỉ project. Đặt mục tiêu giữ tối thiểu ba bản hoàn chỉnh trong ngân sách lưu trữ đã kiểm chứng; nếu không đạt miễn phí, tối ưu kích thước/định dạng hoặc trình phương án kho backup khác/gói trả phí trước bật production, không bỏ backup hoặc âm thầm phát sinh phí. Nếu backup mới lỗi, không chủ động xóa bản cuối tốt; theo dõi hạn hết hiệu lực của artifact để cảnh báo trước nguy cơ không còn bản dùng được. Có hướng dẫn tải bản sao mã hóa về nơi người dùng giữ lâu dài. [Hạn mức và tính phí Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Benchmark dùng dung lượng PNG thực tế và lịch sử tăng dần, gồm ba bản daily, bản trước migration, CI và monitor của cả tài khoản; 5MB là trần upload, không phải trung bình. Dashboard ghi dung lượng, tuổi và thời điểm artifact hết hạn. Một bản tuần giữ lâu hơn là nâng cấp tùy chọn nếu quota đã đủ, không làm giảm tối thiểu ba bản daily hoặc tự phát sinh phí. Tần suất backup ngày không bảo đảm phục hồi một sai sót chỉ phát hiện sau nhiều ngày; giới hạn retention phải được nêu khi bàn giao.

Không thể bảo đảm lưu backup ngoài điểm hỏng nếu cả GitHub/artifact/quota không hoạt động; thông báo và trạng thái phải phản ánh việc chưa có bản sao. Restore theo mục 9 luôn dừng, đối chiếu remote và không phục hồi secrets/enabled như quyền tự gửi.

### Bảo trì và mục tiêu vận hành

Hằng tuần người quản lý xem kho theo nhóm, unknown, lỗi notification, backup, quota và các nguồn đến mốc review trên dashboard. Kiểm tra token/quyền/API version theo cơ chế thực tế của Meta; cảnh báo thông tin hết hạn khi có dữ liệu đáng tin, không đoán token dùng mãi. Cập nhật dependency theo PR/CI/staging/release, không auto deploy production.

Các chỉ số bản đầu: scheduler freshness, số confirmed publication, độ trễ lịch, unknown chưa giải quyết, success notification chưa giao, reserve hợp lệ và tuổi backup. Retry nominal 10:00/10:05/10:10 là mục tiêu lập lịch, không bảo đảm mạng/API đúng phút. Mục tiêu giảm thao tác thường nhật; ngừng đúng khi thiếu căn cứ quan trọng hơn cố đăng thêm. Không có SLA/uptime hay RPO tuyệt đối; sao lưu ngày có thể mất thay đổi từ bản cuối nếu sự cố, publication sau backup phải đối chiếu trước resume.

## 20. Điều kiện hoàn tất kế hoạch trước khi bắt đầu code

### Kết luận sẵn sàng bản 4.3

Đã có scope/quy tắc, schema logic/constraints, state transitions, API/auth/idempotency, wireframe/design spec, test plan và runbook. Không thấy quyết định nghiệp vụ còn thiếu buộc phải dừng lập trình local. Đủ để bắt đầu code một luồng chạy thử với dữ liệu mẫu và adapter giả lập; SQL/index/SDK cụ thể và chất lượng render sẽ được kiểm chứng trong triển khai, không cần kết quả live trước dòng code đầu tiên. Lượt này chỉ cập nhật tài liệu và thông báo mức sẵn sàng, chưa tự chuyển sang code.

| Cổng | Điều kiện | Trạng thái hiện tại |
|---|---|---|
| A — bắt đầu code/local | Bộ thiết kế thống nhất, phạm vi chạy thử, fixture và phiếu nghiệm thu xác định | Đủ ở mức thiết kế; chưa có ứng dụng/test pass |
| B — đăng thật fanpage thử/cloud | Fanpage thử được cung cấp, quyền Meta/Google/Telegram/cloud đã cấu hình, đích và secrets tách, luồng mock đạt | Chưa đạt; là phụ thuộc triển khai, không chặn code local |
| C — bật production | Ca rủi ro/restore/monitor/quota đạt, kho 40 ready, release/config đúng, fanpage và ngày bắt đầu xác nhận | Chưa đạt; không đăng chính thức trước cổng này |

Thứ tự triển khai thử: dựng schema/backend và bộ adapter fake → GUI kho/lịch/preview/lịch sử → năm mẫu P02/P04/P05/P06/P08 và ba bố cục → luồng claim/intent/evidence/finalizer/outbox xuyên suốt → inject lỗi/retry/reserve/pause/maintenance/restore → khi có fanpage thử mới tích hợp live và kiểm tra cloud. Có thể song hành biên tập mẫu và mô-đun, nhưng phải nghiệm thu mẫu trước sản xuất đủ kho. Fake adapters chỉ được bật ở local/test, không thay xác thực/quyền Meta thật trên staging/production; UI và bằng chứng phải ghi rõ giả lập.

### Các cải tiến nghiệm thu bổ sung

Phiếu NGHIEM-THU-CHAY-THU.md ghi từng mẫu: người đọc/ngữ cảnh/đầu ra, nguồn/facts/check_version, file PNG/caption đầy đủ footer, lỗi và bản sửa, QA 1080/360px/Facebook. Từng ca có trạng thái đầu, failpoint, remote request count, dữ liệu cuối, notification và đường phục hồi; kết quả mặc định chưa chạy. Không dùng số test hoặc tên ca làm bằng chứng đạt.

Checkpoint monitor là snapshot bất biến: tên/identity gồm environment, run_id, run_attempt và phase/sequence; intent và delivery result dùng artifact riêng, không overwrite. Reader chọn checkpoint hợp lệ mới nhất theo observation/sequence trong đúng môi trường. Khi khỏe và không có thay đổi, refresh tối đa mỗi 24 giờ để tránh hết hạn; khi gửi cảnh báo vẫn lưu intent trước/kết quả sau. Retention mục tiêu ít nhất bảy ngày và tổng quota/phút Actions/API calls cần thử trước production. State thiếu/hỏng áp dụng best effort có thể lặp, không giả đã giao. Không commit checkpoint vào Git. [Tài liệu upload-artifact](https://github.com/actions/upload-artifact).

Backup scope chỉ chứa dữ liệu nghiệp vụ và tài sản; không lưu OAuth ID/access/refresh token, cookie phiên hoặc signing key trong D1 được full export. Phiên owner dùng cookie ký phía server, key ở secret store; xác minh Google thực sự trước cấp phiên. Khi restore phải vô hiệu phiên cũ/đổi signing key và yêu cầu đăng nhập lại, không khôi phục quyền truy cập từ backup. Test kiểm tra gói giải mã/schema/files/checksum, quarantine publication/outbox và đối chiếu remote; tải file thành công chưa chứng minh restore đạt. Nếu thiết kế session thay đổi trong triển khai phải giữ yêu cầu này và ghi quyết định.

Diễn tập owner qua giao diện/hướng dẫn tiếng Việt: tìm/sửa bài lỗi, bổ sung kho và chọn mốc tiếp tục, đọc một lượt unknown. Việc cần hỗ trợ kỹ thuật phải có trạng thái và bước hỗ trợ rõ, không đòi owner thao tác SQL/lease/artifact. Đo thời gian biên tập và xử lý ngoại lệ cùng metric marketing để đánh giá công sức thực tế; không tự đưa ra ước tính chi phí hoặc đổi tỷ lệ.

Ưu tiên v4.2: chốt giao thức quyền môi trường, finalizer và bảng trạng thái chính trước hoàn tất module đăng/backup; nghiệm thu conditional writes D1 trước phát hành. Trước sản xuất cả kho nghiệm thu năm mẫu; trước production thử tách pha/kill backup, checkpoint monitor, Telegram delivery_unknown và quyền/quotas. Luồng tự động luôn độc lập bài admin trực tiếp; không đưa lại yêu cầu skip/pause. Vòng đánh giá tiếp theo nên dùng mẫu và kết quả test, không thêm tính năng để kéo dài kế hoạch.

Thứ tự bản 4.1: trước lập trình luồng đăng phải rõ page gate/evidence/usage và chuyển trạng thái; trước lập trình backup phải rõ full export/bảo trì/quyền/manifest. Sau cổng thiết kế, sản xuất năm mẫu P02/P04/P05/P06/P08 và ba bố cục, nghiệm thu rubric/mobile/fanpage thử trước làm đủ kho. Trước production phải có quyền Meta chạy thật, diễn tập restore, benchmark quota/retention và các ca cạnh tranh mới mở rộng. Sau đợt đầu mới điều chỉnh cách triển khai nội dung theo dữ liệu; không tự đổi tỷ lệ, giờ đăng hoặc mở phạm vi.

Yêu cầu của người dùng: hoàn thiện kế hoạch trước code. Phiên bản này hoàn tất cập nhật chiến lược và quyết định vận hành; chỉ chuyển sang code khi bộ tài liệu thiết kế dưới đây đã đủ. Việc tài khoản/Meta chưa được cấp quyền là phụ thuộc triển khai, không được gọi là đã kiểm chứng chỉ để đóng kế hoạch.

| Đầu ra trước code | Nội dung phải có | Cách kiểm tra |
|---|---|---|
| PRD/scope cuối | Yêu cầu, phạm vi bản đầu, ngoài phạm vi, chính sách hiện hành và thuật ngữ | Không còn xung đột giữa kế hoạch, brief và facts |
| Đặc tả dữ liệu | Schema logic, khóa/unique/index, version/fact/asset, snapshot/outbox và migration strategy | Mô phỏng claim/tranh chấp, reuse reserve, restore và actual-day guard trên giấy |
| Đặc tả workflow | Transition/action/evidence, owner, pause/block/unknown/qua ngày/backup | Mỗi ca có trước–sự kiện–sau và hành động remote được phép |
| Hợp đồng API | Request/response/schema/auth/error/idempotency và giới hạn upload/export | UI/server/adapter cùng định nghĩa trạng thái, không có mutation từ health |
| Wireframe và design spec | Luồng màn hình, thông điệp trạng thái, 2–3 bố cục ảnh, quy tắc chữ/logo/tràn | Xác định mọi thao tác quản lý đã chốt và lỗi cần xử lý |
| Test plan | 36 ca ở mục 11, expected result và bằng chứng cần thu; giả lập vs live | Không coi mock pass là quyền Meta thật hoặc chi phí thật |
| Triển khai/vận hành | Config local/staging/prod, CI/release, monitor, backup format/keys/retention, runbook | Không có secret trong tài liệu; bước rollback và resume cụ thể |
| Phụ thuộc ngoài | Checklist GitHub/Cloudflare/Google/Meta/Telegram, quyền và fanpage thử cần cung cấp | Phân biệt việc đã có với việc cần thiết lập; có phương án nếu quyền/free limit không đạt |

Đã lập THIET-KE-TRUOC-CODE.md và NGHIEM-THU-CHAY-THU.md để cụ thể hóa thiết kế, mapping36test, định dạng backup và bằng chứng cần thu. Mục 18–19 là quyết định nền; cổng A/B/C mục 20 phân biệt thiết kế đủ với phần mềm/quyền/live/quota đã kiểm chứng. Chưa có ứng dụng hoặc kết quả chạy; lượt này chỉ cập nhật tài liệu. Khi bắt đầu triển khai dùng cổng A, không chờ các kết quả chỉ có thể thu sau xây dựng.

Những lựa chọn ở mục 15 đã có mặc định cho bản đầu nên không chặn kế hoạch. Không cần chốt ngày bắt đầu hoặc fanpage chính thức trước thiết kế; cần xác nhận chúng trước xuất bản thật. Các khả năng Meta, alt text, CPU/quota và chất lượng ảnh được ghi thành thử nghiệm bắt buộc ở đúng chặng, không hứa kết quả chưa có.

Sau hoàn tất bộ thiết kế trước code, trình người dùng bản có thể xem gồm phạm vi/quy tắc, sơ đồ dữ liệu/luồng, wireframe và bảng nghiệm thu. Sau đó mới xây luồng mẫu, kiểm thử thật và hoàn thiện kho. Kế hoạch có thể phiên bản hóa nếu bằng chứng triển khai buộc đổi giải pháp; mọi thay đổi lịch/chiến lược/chi phí cần ghi rõ, không âm thầm đổi yêu cầu.

## Cập nhật triển khai bước 8 — 05/10/2026

Biên tập và phiên bản local đã hoàn tất: năm bài mẫu nhập vào đúng mã trong kho 40 bài,
SQLite giữ dữ liệu sau restart, sửa/khôi phục tạo bản mới cần dựng ảnh và rà soát lại.
Caption luôn có dòng ============ trước footer. Mỗi bài vẫn needs_review, lịch chưa bật.
Kiểm thử 135 mã nguồn, 27 trình duyệt và 9 ảnh đạt. Xem docs/steps/08-local-editor.md
và TIEN-DO-TRIEN-KHAI.md cho tiến độ hiện hành. Chưa có Google/Meta/Telegram live/cloud.

## Cập nhật triển khai bước 9 — 05/10/2026

Quản lý nguồn theo trang và kiểm định kho local đã hoàn tất theo phê duyệt.
Mỗi bài có thể thêm/thay/xóa căn cứ cùng phiên bản caption; thư viện 13 PDF + xác nhận
khóa 2026/3,5 năm. Kiểm tra từng bài hoặc toàn kho, chặn trang sai/nguồn thiếu hoặc thay đổi,
caption trùng nguyên văn. Bài giới thiệu ngành cần nguồn chương trình chính thức và xác nhận
người quản lý. Người quản lý vẫn đối chiếu nhận định và ảnh; chưa tự xác minh ý nghĩa nguồn.
145 Node, 35 browser, 9 image đạt. Xem docs/steps/09-source-review.md và tiến độ hiện hành.
Dừng trước bước 10, đề xuất sao lưu/khôi phục kho local; chưa nối dịch vụ thật hoặc cloud.

## Cập nhật triển khai bước 10 — 05/10/2026

Đã hoàn tất gói sao lưu local và khôi phục kho riêng theo phê duyệt. Manifest SHA-256,
SQLite integrity/FK/migration kiểm tra trước hoàn tất và trước khôi phục. Kho phục hồi
quarantined/paused, giữ lịch sử, dùng tài nguyên riêng và không thay kho đang dùng.
154 Node, 42 browser, 9 image đạt. Xem docs/steps/10-local-backups.md.
Đây là adapter local cho backup: chưa thực hiện age/cloud/cron/retention production;
yêu cầu thiết kế production giữ nguyên. Dừng trước bước 11, đề xuất GitHub và CI.

## Cập nhật triển khai bước 11 — 05/10/2026

Repository riêng tư GitHub johntroger/nttu-digital-economics-publisher đã có mã nguồn/main và CI.
CI Node24 Ubuntu/Windows đã kiểm chứng thành công: strict TypeScript, 121 portable tests và
repository guard. Kiểm thử local đầy đủ 157 Node/SQLite/HTTP + 9 image đạt, giữ private assets
ngoài Git. Hook pre-push bắt buộc kiểm tra local trên checkout đã cài hook; không coi nó là
branch protection máy chủ. Ứng dụng vẫn local, chưa dùng GitHub như scheduler production.
Xem docs/steps/11-github-ci.md. Dừng trước bước 12, đề xuất chuẩn bị staging cloud để kiểm thử.
