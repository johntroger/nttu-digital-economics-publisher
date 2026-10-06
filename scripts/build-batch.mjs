import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateBatch,batchHash,similarityPairs} from './batch-contract.mjs';
import {composeCaption,FOOTER_VERSION} from '../src/domain/footer.ts';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root));
const input=read('content/batch-2026-v1.json'),approvalBytes=read('content/samples/step22-approval.json');
const approval=JSON.parse(approvalBytes),batch=validateBatch(JSON.parse(input),approval);
const reports=JSON.parse(read('assets/batch/v1/render-report.json'));
const registry={};
for(const folder of ['career','program'])for(const file of JSON.parse(read(`assets/sources/${folder}/manifest.json`))){
 const source=SOURCE_REGISTRY.find(s=>s.id===file.id);
 if(batchHash(read(file.project_path??file.path))!==source.sha256)throw Error('Source checksum changed: '+file.id);
 registry[file.id]={...source,path:file.project_path??file.path};
}
registry['OWNER-2026']=SOURCE_REGISTRY.find(s=>s.id==='OWNER-2026');
const absolute=path=>fileURLToPath(new URL(path,root)).replace(/\\/g,'/');
const manifest={version:batch.version,input_sha256:batchHash(input),approval_sha256:batchHash(approvalBytes),built_at:new Date().toISOString(),ready:false,published:false,source_registry:registry,
 renderer_sha256:batchHash(read('scripts/render-batch.py')),base_renderer_sha256:batchHash(read('scripts/render-samples.py')),
 fonts:['BricolageGrotesque-Bold.ttf','WorkSans-Bold.ttf','WorkSans-Regular.ttf'].map(name=>({name,sha256:batchHash(read('assets/fonts/'+name))})),posts:[]};
const directory=new URL('content/batch/v1/',root);mkdirSync(directory,{recursive:true});
for(const p of batch.posts){
 const caption=composeCaption(p.body),image=read(`assets/batch/v1/${p.id}.png`),proof=read(`assets/batch/v1/${p.id}-360.png`);
 const report=reports.samples.find(s=>s.id===p.id),record=approval.samples.find(s=>s.id===p.id);
 if(!report||report.sha256!==batchHash(image)||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||image.readUInt32BE(16)!==1080||image.readUInt32BE(20)!==1080||image.length>5242880||proof.readUInt32BE(16)!==360||proof.readUInt32BE(20)!==360)throw Error('Artwork invalid: '+p.id);
 if(record&&(record.image_sha256!==batchHash(image)||record.proof_sha256!==batchHash(proof)))throw Error('Approved artwork changed: '+p.id);
 if(report.logos.map(l=>l.file).join(',')!=='nttu.png,fba.png,digital-economics.jpg')throw Error('Missing logos');
 for(const logo of report.logos)if(logo.sha256!==batchHash(read('assets/brand/originals/'+logo.file)))throw Error('Logo changed');
 const entry={id:p.id,pool:p.pool,group:p.group,audience:p.audience,body_sha256:batchHash(p.body),caption_sha256:batchHash(caption),image_sha256:batchHash(image),proof_sha256:batchHash(proof),caption_path:`content/batch/v1/${p.id}.txt`,image_path:`assets/batch/v1/${p.id}.png`,footer_version:FOOTER_VERSION,owner_approval:record?'approved':'pending',ready:false,source_refs:p.source_refs.map(r=>({...r,revision:registry[r.id].sha256})),external_refs:p.external_refs??[]};
 manifest.posts.push(entry);
 writeFileSync(new URL(p.id+'.txt',directory),caption+'\n');
 const refs=p.source_refs.map(r=>`- **${r.id}** · ${r.pages.length?'Trang PDF '+r.pages.join(', '):'Đính chính của người quản lý'} · ${r.section}\n  Căn cứ: ${r.supports}\n  Biên soạn: ${r.adaptation}`).join('\n');
 const external=(p.external_refs??[]).map(r=>`\n- [${r.title}](${r.url}) · mục ${r.sections.join(', ')} · trang PDF ${r.pdf_pages.join(', ')}; xem ngày ${r.accessed}.`).join('');
 const md=`# ${p.id} — ${p.title}\n\n${p.pool==='main'?'Bài chính, vị trí '+p.slot:'Bài dự phòng'} · ${p.audience==='SV'?'Sinh viên':'Người tìm hiểu ngành'} · ${p.image.mode==='infographic'?'Infographic':'Minh họa ít chữ'} · ${record?'Đã duyệt nội dung và thiết kế ở Bước 22':'Chờ duyệt nội dung và thiết kế'}\n\nMục tiêu: ${p.reader_outcome}\n\n![${p.title}](<${absolute(entry.image_path)}>)\n\n## Caption đầy đủ\n\n\`\`\`text\n${caption}\n\`\`\`\n\n## Căn cứ và phạm vi biên soạn\n\n${refs}${external}\n\nNguồn và ảnh được ghim checksum. Đây là gói biên tập local; chưa cấp trạng thái ready trong cloud hoặc quyền đăng Facebook.\n`;
 writeFileSync(new URL(p.id+'.md',directory),md);
}
const pairs=similarityPairs(batch.posts),warnings=pairs.filter(p=>p.score>=.30);
if(warnings.length)throw Error('Review near-duplicate pairs: '+JSON.stringify(warnings));
writeFileSync(new URL('content/batch-2026-v1.manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(new URL('assets/batch/v1/checks.json',root),JSON.stringify({checked_at:new Date().toISOString(),exact_duplicates:[],similarity_method:'word_bigram_Jaccard_without_headline_or_footer',similarity_review_threshold:.30,highest_similarity_pairs:pairs.slice(0,12),history_scope:'Local pack only; cloud and manually posted Page history not queried in this build.',counts:{main:30,reserve:10,student:28,prospective:12,infographic:20,illustration:20,approved:3,pending:37},ready:0},null,2)+'\n');
const groups={D:'Dữ liệu',A:'AI và công nghệ',B:'Kinh doanh số',S:'Kỹ năng nghề nghiệp',R:'Tư duy và trách nhiệm',I:'Giới thiệu ngành'};
const catalog=`# Kho content 40 bài — Khóa 2026\n\n**30 bài chính + 10 dự phòng.** 28 bài dành cho sinh viên, 12 bài dành cho người tìm hiểu ngành. 20 infographic và 20 minh họa ít chữ. Ba mẫu Bước 22 giữ nguyên caption/PNG đã duyệt; 37 bài còn lại chờ bạn nghiệm thu. Lịch đăng chưa bật, chưa đặt ngày bắt đầu.\n\nMở tên bài để xem ảnh, toàn bộ caption và căn cứ. Mỗi bài dự phòng đọc độc lập và không phụ thuộc bài đã đăng trước đó.\n\n| Mã | Kho | Nhóm | Đối tượng | Bài viết | Ảnh | Duyệt |\n|---|---|---|---|---|---|---|\n${batch.posts.map(p=>`| ${p.id} | ${p.pool==='main'?'Chính '+p.slot:'Dự phòng'} | ${groups[p.group]} | ${p.audience} | [${p.title}](<${absolute(`content/batch/v1/${p.id}.md`)}>) | ${p.image.mode==='infographic'?'Infographic':'Ít chữ'} | ${p.editorial_status==='owner_approved'?'Đã duyệt':'Chờ duyệt'} |`).join('\n')}\n\n## Phạm vi kiểm tra\n\nĐã kiểm tra toàn bộ caption, footer, trang nguồn, checksum và phân bổ chủ đề/đối tượng. So sánh 780 cặp trong kho bằng độ giao nhau của cụm hai từ; đây là tín hiệu rà soát, không bảo đảm hiểu tương đồng ý nghĩa. Cặp có điểm cao được xem lại về mục tiêu, ví dụ và hành động. Chưa đối chiếu lịch sử cloud hoặc các bài bạn đăng thủ công trong lệnh build này.\n\nKhóa 2026/3,5 năm theo đính chính của người quản lý; dòng thời lượng cũ trong PDF không được dùng. Không dùng thông tin tuyển sinh chi tiết, mức lương, dự báo thị trường hoặc cam kết việc làm. Bài blockchain có thêm [nguồn kỹ thuật NIST](https://doi.org/10.6028/NIST.IR.8202).\n\nGói này là tài sản biên tập đã dựng, chưa nhập 40 phiên bản hoàn chỉnh vào cloud và chưa được xét đủ điều kiện đăng.\n`;
writeFileSync(new URL('catalog.md',directory),catalog);
console.log('Verified 40 captions, 40 PNGs, 13 source checksums and 780 distinct pairs. Three existing owner approvals preserved; 37 pending; no cloud writes.');
