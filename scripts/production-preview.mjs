// Reproducible local review of approved bytes. No remote connection or writes to live D1.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {productionWarehouseFixture} from '../tests/helpers/production-warehouse-fixture.mjs';
import {productionPreview} from '../src/production/preview.ts';
const f=productionWarehouseFixture();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
 const preview=await productionPreview(f.env,process.argv[2]);
 if(preview.valid!==40||!preview.warehouseComplete)throw Error('Approved preview incomplete');
 const dir=resolve('assets/reviews/step36');mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'preview.json'),JSON.stringify(preview,null,2)+'\n');
 const card=p=>`<details><summary>${escape(p.day??'Dự phòng')} · ${escape(p.key)} · ${escape(p.title)}</summary><p>Đối chiếu: ${p.approvalValid?'Khớp biên nhận duyệt':escape(p.reasons.join(', '))}</p><img loading="lazy" src="../../batch/v1/${escape(p.key)}.png" alt="Ảnh đã duyệt ${escape(p.key)}"><pre>${escape(p.caption)}</pre><p>Nguồn: ${p.sourceRefs.map(r=>escape(r.id)+' · trang '+escape(r.pages.join(', '))).join('; ')}</p></details>`;
 writeFileSync(resolve(dir,'preview.html'),`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bước 36 · Bản xem trước</title><style>@font-face{font-family:Work;src:url('../../fonts/WorkSans-Regular.ttf')}body{font-family:Work,system-ui;max-width:1000px;margin:40px auto;padding:0 24px;background:#f5f8fb;color:#18324b}h1{font-size:36px}details{background:white;padding:18px;margin:10px 0;border:1px solid #d9e2eb;border-radius:8px}summary{cursor:pointer;font-weight:600}img{width:360px;max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit;line-height:1.6}.note{padding:18px;border-left:4px solid #0059a3;background:white}</style><h1>Bản xem trước 30 ngày</h1><p>Ngành Kinh tế số · NTTU · ${escape(preview.startDate)} · 10:00 Việt Nam</p><p class="note">40/40 bài khớp duyệt · 30 bài chính · 10 dự phòng. Bản xem trước không lưu lịch và không cấp quyền đăng bài. Đăng thật: chưa thực hiện.</p><h2>Bài chính</h2>${preview.calendar.map(card).join('')}<h2>Dự phòng</h2>${preview.reserves.map(card).join('')}</html>`);
 console.log(JSON.stringify({review:resolve(dir,'preview.html'),valid:preview.valid,main:preview.main,reserve:preview.reserve,liveWrites:0}));
}finally{f.db.close();}
