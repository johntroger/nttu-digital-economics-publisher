# Bước 5 — điều phối workflow local

Ngày: 05/10/2026. Phê duyệt: “phê duyệt bước 5”.
Trạng thái: hoàn thành phạm vi chạy thử local, kiểm thử đạt; dừng trước bước 6.

## Đã xây

- runLocalTick nối claim → intent → FakePublisher → intake → finalizer/outbox.
  Không giữ giao dịch SQLite qua thao tác async; hai lượt tick đồng thời nhìn thấy intent đã commit
  và không gọi publisher lần thứ hai cho cùng lượt.
- Fake workflow cần simulation marker được bật rõ ràng và tất cả page_id mang tiền tố fixture:.
  Marker mặc định tắt. Đích thật hoặc adapter khác FakePublisher bị từ chối trước gửi.
  environment production trong database fixture chỉ dùng kiểm tra quy tắc production, không phải fanpage thật.
  Không nối fake workflow vào Worker/API đang chạy.
- Lịch bắt đầu phải được cấu hình rõ, không lấy ngày hiện tại làm mặc định để tự bật lịch.
  Xếp các bài scheduled theo thứ tự; tại mỗi ngày từ mốc bắt đầu, tạo slot nếu thiếu.
  Trước 10h Việt Nam không gửi. Actual-day guard và trạng thái slot đã hoàn tất chặn gửi thêm trong ngày.
- Mỗi tick xử lý tối đa 20 evidence đến hạn trước lượt mới. Pending chưa xử lý hoặc finalization lỗi
  dừng đường gửi. Intent bị gián đoạn được chuyển unknown khi lease hết, có alert, không replay request.
  Unknown giữ chờ đối chiếu, gồm khi đã sang ngày sau.
- Bài planned không còn hợp lệ bị bỏ qua trước gửi; dự phòng dùng eligibility hiện hành,
  ưu tiên cùng nhóm/đối tượng với ứng viên lỗi gần nhất, rồi các nhánh đã chốt.
  Claim/intent tiếp tục kiểm tra lại trong giao dịch, không tin kết quả chọn ngoài giao dịch.
- Verified retry chờ next_attempt_at, nhận lại ownership và giữ nguyên caption/checksum/footer.
  Hết ba lượt thì giữ bài sửa chữa và dùng reserve trong ngày. Policy quarantine;
  global block thì dừng, không tiêu reserve. Timeout/exception không rõ được chuẩn hóa unknown.
- Reserve thất bại có thể lấy tiếp reserve khác. Budget mặc định 16 vòng/tick (cho phép cấu hình 1–100),
  không phải giới hạn ba bài dự phòng. Hết budget trả trạng thái để tick kế tiếp tiếp tục từ DB.
- Slot ngày cũ chưa gửi được expire, bài planned chưa dùng về reserve. Held không có attempt có thể hủy an toàn;
  retry đã xác nhận thất bại nhưng qua ngày được giữ needs_review và báo nguyên nhân ngày đã kết thúc.
  Requested/unknown không bị reset hoặc nhả khóa. Không dồn các lượt bỏ lỡ vào ngày mới.
- Late confirmed qua nửa đêm được xử lý trước tick đăng mới, dùng actual-day guard;
  bài planned bị thay bởi publication muộn về reserve theo finalizer bước 4.
- Kho thấp <=3 bài đủ điều kiện tạo outbox cảnh báo coverage; empty tạo cảnh báo bổ sung và block riêng stock_empty.
  Chỉ phát một cảnh báo cho mỗi đợt/trạng thái kho, không tạo lại event mỗi tick.
  Refill không tự resume. Hàm resume rõ ràng kiểm tra đã có stock, chỉ gỡ stock_empty của page,
  giữ user pause, block khác và maintenance. Không sinh thêm bài hoặc tái đăng lịch sử.
- Pause chặn request mới; pause đến sau intent không bỏ bằng chứng của lượt đã cấp quyền.
  Maintenance không tạo slot/expire/stock mutation hoặc gửi request mới trong runner.
  Audit và outbox ghi trạng thái, không lưu owner token hoặc lỗi transport thô.

File chính: migrations/0005_simulation.sql, src/workflow/local-runner.ts,
src/workflow/fake-adapter.ts, scripts/simulate.mjs và tests/runner.test.mjs.

## Kiểm thử

`npm.cmd run check`: TypeScript strict đạt; **116 PASS, 0 FAIL, 0 SKIP**.
89 test các bước trước tiếp tục đạt; 27 test tích hợp bước 5 bổ sung.
Log: docs/steps/05-test-log.txt.

Các ca: trước/đúng 10h, cùng ngày tick nhiều lần, cùng chủ đề ưu tiên reserve,
planned hết hạn kiểm định, nhiều reserve lỗi, retry 5 phút/ba attempt/snapshot,
unknown/transport exception, policy/global, budget continuation, stock empty/refill/resume,
cảnh báo trước ba ngày theo số bài đủ điều kiện, mất ngày/held/retry qua ngày,
crash sau intent, evidence pending/retry finalizer, hai tick đồng thời, pause giữa request,
maintenance, late publication sang ngày mới, đích thật bị từ chối, adapter không được phép,
và kho 40 brief thật giữ nguyên 0 publication.

Hai ca fail ban đầu do fixture kho rỗng chưa được bật lịch/thoát trạng thái paused:
helper chỉ unpause khi có bài. Đã sửa helper đặt điều kiện test rõ kể cả kho rỗng;
không sửa mặc định paused của application_state trong migration.

## Demo đã chạy

```powershell
npm.cmd run simulate
```

Demo dùng in-memory và clock kiểm soát, không chờ năm phút thực và không dùng kho thật.
Kết quả đã lưu: docs/steps/05-simulation-result.json.

| Ca | Số request giả | Publication giả | Kết quả |
|---|---:|---:|---|
| 09:59:59 →10h →11h cùng ngày | 1 | 1 | Chỉ bài p1, không gửi trước giờ hoặc gửi lại |
| 10h →10h05 →10h10, bài p1 lỗi ba lần | 4 | 1 | Ba attempt p1, rồi reserve r1 thành công |
| Timeout rồi tick ngày sau | 1 | 0 | Giữ reconciliation_required, không lấy reserve hoặc repost |

Outbox trong demo đều pending; đây không phải tin Telegram đã được gửi.
Demo harness dùng helper fixture dưới tests/helpers; không thuộc bundle Worker hoặc kho nội dung thật.

## Giới hạn

Đây là tick local được gọi bằng code/test/demo, chưa có cron chạy nền hoặc cloud chạy khi tắt máy.
Chưa có history check 8h/Meta remote reconciliation, Telegram delivery/retry,
UI sửa/import/render PNG, Google OAuth, D1/R2 live, GitHub repository/CI/deploy/backup.
Clock và ID do backend tin cậy cấp trong local tests; trước D1/live phải kiểm tra lại thời gian
sau lấy quyền thực tế và nghiệm thu cơ chế conditional writes/ownership tương ứng.

Budget giới hạn số vòng và batch evidence, không chứng minh một SLA về thời gian chạy
hoặc retry cadence trên Cloudflare. Ưu tiên queue và khóa đã kiểm thử local; chưa có exactly-once network guarantee.
Cảnh báo kho dựa eligibility hiện tại, không bảo đảm dịch vụ ngoài sẽ đăng thành công trong số ngày phủ kho đó.
Stock-empty resume là hàm backend local chưa có UI, không yêu cầu người dùng thao tác SQL trong sản phẩm tương lai.

**Kho thật: 40 đề cương nháp, 0 bài đủ điều kiện đăng.** Chỉ fixture đầy đủ giả được dùng trong demo.
Không gọi AI, Facebook, Telegram hoặc tạo account/remote/deploy trong bước 5.

## Bước 6 đề xuất — chờ phê duyệt

Xây giao diện quản lý bản local: xem kho bài/điều kiện sẵn sàng, lịch, lịch sử và cảnh báo;
chạy demo giả lập từ giao diện với nhãn rõ. Kiểm thử giao diện và các thao tác xem/chạy demo.
Chưa kết nối Google/Facebook/Telegram thật hoặc triển khai cloud; biên tập/render ảnh và các tích hợp
sẽ được xác định phạm vi riêng trước khi thực hiện.
