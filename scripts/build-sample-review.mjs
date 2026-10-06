// Local review artifact only. No cloud writes, publishing, AI or approval changes.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateSamples} from '../src/domain/samples.ts';
import {composeCaption, FOOTER, CAPTION_SEPARATOR} from '../src/domain/footer.ts';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const hash = data => createHash('sha256').update(data).digest('hex');
const imagePath = id => fileURLToPath(new URL(`assets/samples/v1/${id}.png`, root)).replace(/\\/g, '/');
const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ids = ['P02', 'P04', 'P05'];
const roles = ['Kiến thức · Sinh viên', 'Kỹ năng nghề nghiệp · Sinh viên', 'Giới thiệu ngành · Tìm hiểu khóa 2026'];
const input = read('content/samples-2026-v1.json');
const batch = validateSamples(JSON.parse(input));
const manifest = JSON.parse(read('content/samples-2026-v1.manifest.json'));
const rendered = JSON.parse(read('assets/samples/v1/render-report.json'));
if (manifest.input_sha256 !== hash(input) || manifest.renderInputs.renderer_sha256 !== hash(read('scripts/render-samples.py'))) throw new Error('Rebuild samples before creating review');
const samples = ids.map((id, index) => {
  const sample = batch.samples.find(item => item.id === id);
  const entry = manifest.samples.find(item => item.id === id);
  const report = rendered.samples.find(item => item.id === id);
  const image = read(`assets/samples/v1/${id}.png`);
  const caption = composeCaption(sample.body);
  if (entry.owner_approval !== 'pending' || entry.ready !== false || entry.facebook_qa !== 'not_run') throw new Error('Unexpected approval state');
  if (entry.caption_sha256 !== hash(caption) || entry.image_sha256 !== hash(image) || report.sha256 !== hash(image) || report.input_sha256 !== hash(input)) throw new Error('Stale sample artifact');
  if (caption.split(FOOTER).length !== 2 || caption.split(CAPTION_SEPARATOR).length !== 2 || !caption.endsWith(FOOTER)) throw new Error('Invalid footer');
  if (report.logos.map(logo => logo.file).join(',') !== 'nttu.png,fba.png,digital-economics.jpg') throw new Error('Three logos required');
  for (const ref of entry.source_refs) {
    const source = manifest.registry[ref.id];
    if (!source || source.sha256 !== ref.sha256 || (source.path && hash(read(source.path)) !== source.sha256)) throw new Error('Source integrity failed');
  }
  return {sample, entry, caption, image, role: roles[index]};
});
if (new Set(samples.map(({sample}) => sample.body.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase())).size !== 3) throw new Error('Duplicate body');

const refsText = sample => sample.source_refs.map(ref => `- **${ref.id}**${ref.pages.length ? ` — trang PDF ${ref.pages.join(', ')}` : ' — đính chính của người quản lý'}; ${ref.section}.\n  Căn cứ: ${ref.supports}\n  Biên soạn: ${ref.adaptation}`).join('\n');
const markdown = `# Bước 22 — Ba bài mẫu chờ duyệt\n\nNgày đối chiếu: 06/10/2026. Đây là ba mẫu được chọn từ bộ nháp đã có và dựng lại ảnh từ logo chuẩn. Chưa đăng Facebook, chưa đưa vào hàng chờ và chưa phê duyệt chất lượng thay người quản lý. Hai mẫu dành cho sinh viên và một mẫu tìm hiểu ngành; tỷ lệ 70/30 áp dụng cho cả kho 40 bài.\n\nMỗi ảnh 1080 × 1080px, ba logo Trường → Khoa → Ngành cùng hàng trên cùng. Footer bắt buộc, đường phân cách và nhóm hashtag xuất hiện đúng một lần. Ví dụ trong caption là giả định; không sử dụng mức lương hay cam kết việc làm.\n\n${samples.map(({sample,caption,role}) => `## ${sample.id} — ${sample.title}\n\n${role}. Mục tiêu: ${sample.reader_outcome}\n\n![${sample.title}](<${imagePath(sample.id)}>)\n\n### Caption đầy đủ\n\n\`\`\`text\n${caption}\n\`\`\`\n\n### Căn cứ và phạm vi biên soạn\n\n${refsText(sample)}\n`).join('\n')}\n## Ghi chú nghiệm thu\n\nCác trang nguồn được đối chiếu trực tiếp từ PDF. BM11 còn ghi khóa 2025/04 năm; thời lượng khóa 2026 trong P05 dùng đính chính 3,5 năm của người quản lý, không gán cho dòng thông tin cũ trong PDF. Kiểm tra trùng lặp ở gói này là so sánh nội dung giữa ba mẫu; kiểm tra với kho lịch sử sẽ chạy khi nhập phiên bản vào hệ thống.\n\nChờ người quản lý duyệt giọng văn, lượng chữ và thiết kế của ba mẫu trước khi triển khai bước kế tiếp.\n`;
mkdirSync(new URL('content/samples', root), {recursive:true});
writeFileSync(new URL('content/samples/step22-review.md', root), markdown);
const cards = samples.map(({sample,caption,image,role}) => `<article id="${sample.id}"><header><small>${escape(role)}</small><h2>${escape(sample.title)}</h2><p>${escape(sample.reader_outcome)}</p></header><div class="pair"><figure><img width="1080" height="1080" alt="${escape(sample.title)}" src="data:image/png;base64,${image.toString('base64')}"><figcaption>${sample.id} · 1080 × 1080 · Chờ duyệt</figcaption></figure><div><h3>Caption đầy đủ</h3><div class="caption">${escape(caption)}</div></div></div><details><summary>Căn cứ và phạm vi biên soạn</summary>${sample.source_refs.map(ref => `<p><strong>${escape(ref.id)}</strong> · ${ref.pages.length ? `Trang PDF ${ref.pages.join(', ')}` : 'Đính chính của người quản lý'}<br>${escape(ref.section)}<br>Căn cứ: ${escape(ref.supports)}<br>Biên soạn: ${escape(ref.adaptation)}</p>`).join('')}</details></article>`).join('');
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bước 22 · Ba bài mẫu NTTU</title><style>*{box-sizing:border-box}body{margin:0;background:#f1f4f7;color:#17324c;font:17px/1.65 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:40px 28px}h1{font-size:clamp(30px,4vw,52px);line-height:1.16;margin:12px 0}h2{font-size:30px;line-height:1.3}h3{margin-top:0}small{font-weight:700;color:#07579b}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}a{color:#07579b}article{background:white;padding:28px;margin:32px 0;border-top:4px solid #07579b;border-radius:4px}article header{max-width:900px}.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px;align-items:start}figure{margin:0;position:sticky;top:20px}img{width:100%;height:auto;display:block}figcaption{font-size:14px;margin-top:10px;color:#576b7c}.caption{white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:28px;padding-top:18px;border-top:1px solid #dce4eb}summary{cursor:pointer;font-weight:700}.notice{max-width:950px}footer{font-size:15px;color:#576b7c}@media(max-width:850px){main{padding:24px 14px}article{padding:18px}.pair{grid-template-columns:1fr}figure{position:static}h2{font-size:25px}}@media print{body{background:white}main{padding:0}.pair{grid-template-columns:1fr}figure{position:static;width:65%}article{break-before:page}nav{display:none}details{display:block}}</style><main><small>NGÀNH KINH TẾ SỐ · NTTU</small><h1>Ba bài mẫu để bạn duyệt</h1><p class="notice">Đã đối chiếu nguồn ngày 06/10/2026. Chưa đăng Facebook và chưa bật lịch. Chọn một bài bên dưới để xem ảnh, caption và căn cứ.</p><nav>${ids.map((id,i)=>`<a href="#${id}">${i+1}. ${escape(batch.samples.find(p=>p.id===id).title)}</a>`).join('')}</nav>${cards}<footer>Khóa 2026: 3,5 năm theo đính chính của người quản lý. BM11 còn thông tin thời lượng cũ. Ví dụ là giả định, không cam kết việc làm. Gói này kiểm tra trùng lặp giữa ba mẫu; đối chiếu lịch sử thực hiện khi nhập vào hệ thống.</footer></main></html>`;
mkdirSync(new URL('assets/samples/step22', root), {recursive:true});
writeFileSync(new URL('assets/samples/step22/review.html', root), html);
writeFileSync(new URL('assets/samples/step22/manifest.json', root), JSON.stringify({step:22,ids,owner_approval:'pending',ready:false,published:false,samples:samples.map(({entry})=>entry)},null,2)+'\n');
console.log('Step 22: three sourced captions and square images verified; local review HTML/Markdown built. Owner approval pending. No external calls.');
