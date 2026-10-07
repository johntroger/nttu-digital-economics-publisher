const panel=document.querySelector('#panel'),error=document.querySelector('#error');
let data,identity,preview,preflight,sendReview,view='overview';
function el(tag,text){const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x;}
function empty(title,body){const box=el('div');box.className='empty';box.append(el('strong',title),el('p',body));return box;}
function table(head,rows){const t=el('table'),h=el('thead'),tr=el('tr');head.forEach(x=>tr.append(el('th',x)));h.append(tr);t.append(h);const b=el('tbody');rows.forEach(row=>{const r=el('tr');row.forEach(x=>r.append(el('td',x??'—')));b.append(r);});t.append(b);return t;}
function render(){
 panel.replaceChildren();const titles={overview:'Chuẩn bị fanpage chính thức',posts:'Kho nội dung',schedule:'Lịch đăng',history:'Lịch sử đăng bài',notifications:'Thông báo',connections:'Kết nối'};
 panel.append(el('h2',titles[view]));
 if(view==='overview'){
  panel.append(el('p',data.posts.length?'Kho đã nhập và đối chiếu nội dung, ảnh và biên nhận duyệt. Cần hoàn tất kết nối fanpage và nghiệm thu vận hành trước khi bật đăng bài.':'Kho và lịch sử dưới đây thuộc môi trường chính thức. Nội dung đã duyệt sẽ được nhập và kiểm tra trước khi kết nối đăng bài.'));
  panel.append(table(['Hạng mục','Hiện trạng'],[['Kho bài',data.posts.length+' bài'],['Ảnh và tài liệu',data.library.reduce((n,x)=>n+Number(x.count),0)+' tệp'],['Bài đã đăng',data.history.length===100?'100 bài gần nhất':data.history.length+' bài'],['Đăng nhập quản lý',identity.email],['Fanpage',data.connectionVerified?'Đã xác minh':'Chờ xác minh'],['Lịch đăng','Đang tắt']]));
  panel.append(el('p','Thời gian đăng dự kiến: 10:00 mỗi ngày, theo giờ Việt Nam. Chỉ bật sau khi hoàn tất kết nối, kho nội dung và nghiệm thu.'));
 }else if(view==='posts'){
  if(!data.posts.length)panel.append(empty('Chưa nhập kho nội dung','Kho 40 bài đã duyệt vẫn được giữ tại staging. Bước nhập kho chính thức sẽ đối chiếu caption, ảnh, nguồn và biên nhận duyệt.'));
  else {
   panel.append(el('p',data.posts.length+' bài · '+data.posts.filter(p=>p.pool==='scheduled').length+' bài chính · '+data.posts.filter(p=>p.pool==='reserve').length+' bài dự phòng. Chưa lên lịch đăng.'));
   data.posts.forEach(p=>{const d=el('details');d.append(el('summary',p.content_key+' · '+p.caption_title),el('p','Phiên bản '+p.version+' · '+(p.pool==='reserve'?'Dự phòng':'Bài chính')+' · '+(p.contentDesignApproved?'Đã duyệt nội dung và thiết kế':'Chờ đối chiếu duyệt')));
    if(p.imageUrl){const im=el('img');im.src=p.imageUrl;im.alt='Ảnh đã duyệt của '+p.content_key;im.loading='lazy';im.width=1080;im.height=1080;im.className='post-artwork';d.append(im);}
    d.append(el('pre',p.caption),el('h3','Căn cứ nội dung'));
    (p.sourceRefs??[]).forEach(r=>{const f=data.libraryFiles.find(x=>x.source_key===r.id),line=el('p');
     if(f){const a=el('a',r.id+' · trang '+r.pages.join(', '));a.href='/api/library/files/'+f.id;a.target='_blank';a.rel='noopener noreferrer';line.append(a);}else line.append(el('strong',r.id+' · xác nhận của người quản lý'));
     line.append(el('span',' — '+r.supports));d.append(line);});panel.append(d);
   });
   panel.append(el('h3','Tài liệu nguồn và logo'));
   data.libraryFiles.filter(f=>f.kind!=='image').forEach(f=>{const p=el('p'),a=el('a',f.filename);a.href='/api/library/files/'+f.id;a.target='_blank';a.rel='noopener noreferrer';p.append(a);panel.append(p);});
  }
 }else if(view==='schedule'){
  const reviewBox=el('div');reviewBox.className='send-review';reviewBox.append(el('h3','Chuẩn bị bài thử'),el('p','Chọn bài để kiểm tra caption, ảnh và kết nối fanpage. Thao tác này chưa cấp quyền đăng Facebook.'));
  const label=el('label','Bài thử '),select=el('select');select.id='send-review-post';
  [...(preview?.calendar??[]),...(preview?.reserves??[])].forEach(p=>{const option=el('option',p.key+' · '+p.title);option.value=p.versionId;option.disabled=!p.approvalValid;select.append(option);});label.append(select);
  if(sendReview)select.value=sendReview.dossier.versionId;
  const check=el('button','Kiểm tra chuẩn bị gửi');check.disabled=!select.options.length;
  check.addEventListener('click',async()=>{check.disabled=true;error.hidden=true;try{const r=await fetch('/api/production/send-preflight',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:JSON.stringify({versionId:select.value}),redirect:'error'});const result=await r.json();if(!r.ok)throw Error('Chưa kiểm tra được bài thử: '+(result.error??'Hãy thử lại.'));sendReview=result;render();}catch(e){sendReview=null;error.textContent=e.message;error.hidden=false;check.disabled=false;}});
  reviewBox.append(label,check);
  if(sendReview){const d=sendReview.dossier,format=n=>new Date(n).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});reviewBox.append(el('h3',d.key+' · '+d.title),el('p',sendReview.note),table(['Hồ sơ thử','Giá trị'],[['Fanpage',d.pageName+' · '+d.pageId],['Thời điểm thử đề xuất',format(d.dueAt)+' · Việt Nam'],['Hồ sơ hết hiệu lực',format(Math.min(d.reviewExpiresAt,d.dueAt))],['Trạng thái','Chuẩn bị đã kiểm tra · chưa được phép đăng'],['Phiên bản',d.versionId],['Mã ảnh đã duyệt',d.imageChecksum],['Mã hồ sơ',sendReview.dossierHash]]));const img=el('img');img.src=d.imageUrl;img.alt='Ảnh đã duyệt của bài thử '+d.key;img.className='post-artwork';reviewBox.append(img,el('pre',d.caption),el('p','Sau khi bạn duyệt riêng hồ sơ còn hiệu lực, hệ thống mới được chuẩn bị quyền đăng một lần. Lịch thường vẫn giữ tắt.'));}
  panel.append(reviewBox);
  panel.append(table(['Thiết lập','Giá trị'],[['Trạng thái','Chưa bật'],['Giờ đăng','10:00 · Việt Nam'],['Tần suất','1 bài tự động/ngày'],['Fanpage','Ngành Kinh tế số – NTTU']]));
  panel.append(data.schedule.length?table(['Ngày','Trạng thái'],data.schedule.map(x=>[x.business_date,x.status])):empty('Chưa có bài được lên lịch','Sau khi kho chính thức và kết nối được nghiệm thu, lịch sẽ được cấu hình với ngày bắt đầu do bạn phê duyệt.'));
  if(preview){
   panel.append(el('h3','Bản xem trước 30 ngày'),el('p',preview.note));
   const label=el('label','Ngày bắt đầu xem trước '),input=el('input');input.type='date';input.value=preview.startDate;label.append(input);
   const button=el('button','Xem trước');button.addEventListener('click',async()=>{button.disabled=true;try{preview=await get('/api/production/preview?startDate='+encodeURIComponent(input.value));render();}catch(e){error.textContent=e.message;error.hidden=false;button.disabled=false;}});
   panel.append(label,button,el('p',preview.valid+'/'+preview.total+' bài khớp biên nhận duyệt · '+preview.main+' bài chính · '+preview.reserve+' dự phòng.'));
   panel.append(table(['Ngày · 10:00 Việt Nam','Bài','Đối chiếu'],preview.calendar.map(p=>[p.day,p.key+' · '+p.title,p.approvalValid?'Khớp duyệt':p.reasons.join(', ')])));
   panel.append(el('h3','Bài dự phòng'),table(['Bài','Đối chiếu'],preview.reserves.map(p=>[p.key+' · '+p.title,p.approvalValid?'Khớp duyệt':p.reasons.join(', ')])));
  }
  if(preflight?.schemaReady){panel.append(el('h3','Kiểm tra trước khi đăng'),table(['Điều kiện','Hiện trạng'],[['Cửa triển khai',preflight.gates.deployment?'Mở':'Đóng'],['Cửa dữ liệu',preflight.gates.database?'Mở':'Đóng'],['Phê duyệt đăng bài',preflight.counts.permits?'Đã có quyền đăng cụ thể':'Chưa cấp'],['Nguồn kích hoạt đăng',preflight.gates.httpPublisher?'Đã cấp riêng':'Chưa cấp'],['Kết quả chưa xác định',preflight.counts.unknown],['Nhịp bộ đăng',preflight.runtime.heartbeat_count],['Ngày tại máy chủ',preflight.serverDate]]),el('p','Duyệt nội dung và thiết kế chưa cấp quyền đăng Facebook. Cần duyệt riêng bài, phiên bản và thời điểm thử.'));}
 }else if(view==='history'){
  if(!data.history.length)panel.append(empty('Chưa có bài đăng chính thức','Lịch sử thử nghiệm trên Tập Viết được giữ riêng tại staging.'));
  else data.history.forEach(x=>{const d=el('details');d.append(el('summary',x.remote_id+' · '+x.confirmed_at),el('pre',x.caption_snapshot));panel.append(d);});
 }else if(view==='notifications'){
  panel.append(data.operations.events.length?table(['Sự kiện','Trạng thái','Lần thử','Mã tin nhắn'],data.operations.events.map(x=>[x.event_id,x.state,x.tries,x.message_id])):empty('Chưa có thông báo vận hành','Thông báo được lưu trong hàng chờ riêng của production.'));
 }else{
  const meta=data.meta,check=meta.lastCheck;
  panel.append(table(['Kết nối','Hiện trạng'],[['Google',identity.email],['Facebook',check?.verifiedReadOnly?'Đã xác minh kết nối đọc với fanpage chính thức':'Cần xác minh kết nối production'],['Page ID',meta.pageId],['Ứng dụng Meta',meta.appId],['Phiên bản API',meta.apiVersion],['Telegram',data.operations.configured?'Đã cấu hình · xem kết quả trong Thông báo':'Chưa cấu hình production'],['Nguồn xử lý thông báo',data.operations.triggerSource==='http'?'Lịch ngoài · mỗi phút':'Cron cloud · mỗi 5 phút'],['Lượt xử lý hoàn tất',(data.operations.triggerSource==='http'?data.operations.http?.last_complete_at:data.operations.runtime?.last_scheduled_at)?new Date(data.operations.triggerSource==='http'?data.operations.http.last_complete_at:data.operations.runtime.last_scheduled_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chờ lượt xử lý đầu tiên'],['Giám sát bên ngoài','Kiểm tra kết quả trong GitHub Actions']]));
  const formatDate=n=>n?new Date(n).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Không có thời hạn trong phản hồi; vẫn có thể bị thu hồi';
  if(check){panel.append(table(['Kiểm tra gần nhất','Kết quả'],[['Trang',check.pageName],['Thời điểm',new Date(check.checkedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})],['Kết quả',check.verifiedReadOnly?'Đúng Trang, ứng dụng và quyền':check.current?(check.fresh?'Cần kiểm tra lại':'Kết quả đã quá 10 phút'):'Cấu hình đã đổi, cần kiểm tra lại'],['Mã kết quả',check.reason],['Quyền',check.scopes.join(', ')],['Token hết hạn',formatDate(check.expiresAt)],['Quyền dữ liệu hết hạn',formatDate(check.dataAccessExpiresAt)]]));}
  panel.append(el('p','Xác minh dùng yêu cầu đọc, không đăng bài và không bật lịch. Kết quả có hiệu lực 10 phút với cấu hình hiện tại.'));
  const verify=el('button','Xác minh fanpage chính thức');verify.disabled=!meta.configured||!meta.schemaReady;
  if(verify.disabled)panel.append(el('p','Cần cấu hình token Trang và App Secret trong Cloudflare trước khi xác minh.'));
  verify.addEventListener('click',async()=>{verify.disabled=true;error.hidden=true;try{const r=await fetch('/api/meta/check',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:JSON.stringify({requestId:crypto.randomUUID()}),redirect:'error'});if(!r.ok)throw Error('Chưa xác minh được. Kiểm tra cấu hình và đăng nhập lại nếu cần.');await load();}catch(e){error.textContent=e.message;error.hidden=false;verify.disabled=false;}});panel.append(verify);
  const p=el('p'),a=el('a','Mở fanpage Ngành Kinh tế số – NTTU');a.href=data.targetPageUrl;a.target='_blank';a.rel='noopener noreferrer';p.append(a);panel.append(p);
  const test=el('button','Gửi tin kiểm thử Telegram');test.disabled=!data.operations.configured||!data.operations.schemaReady;
  test.addEventListener('click',async()=>{test.disabled=true;error.hidden=true;try{const r=await fetch('/api/telegram/test',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:JSON.stringify({requestId:crypto.randomUUID()}),redirect:'error'});if(!r.ok)throw Error('Chưa tạo được tin kiểm thử Telegram.');await load();}catch(e){error.textContent=e.message;error.hidden=false;test.disabled=false;}});panel.append(test,el('p','Tin kiểm thử mang nhãn PRODUCTION, được xử lý bởi nguồn kích hoạt đang chọn. Lịch đăng Facebook vẫn tắt.'));
 }
}
async function get(path){const r=await fetch(path,{cache:'no-store',redirect:'error'});if(r.status===401){location.assign('/');throw Error('Phiên đăng nhập hết hạn.');}if(!r.ok)throw Error('Chưa đọc được dữ liệu. Hãy làm mới hoặc đăng nhập lại.');return r.json();}
async function load(){error.hidden=true;try{[identity,data,preview,preflight]=await Promise.all([get('/api/me'),get('/api/management'),get('/api/production/preview'),get('/api/production/preflight')]);document.querySelector('#owner').textContent=identity.email;render();}catch(e){error.textContent=e.message;error.hidden=false;}}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{if(!data)return;view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>{x.classList.toggle('selected',x===button);if(x===button)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});render();}));
document.querySelector('#refresh').addEventListener('click',load);
document.querySelector('#logout').addEventListener('click',async()=>{if(!identity)return;try{const r=await fetch('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:'{}',redirect:'error'});if(!r.ok)throw Error('Chưa đăng xuất được. Hãy thử lại.');location.assign('/');}catch(e){error.textContent=e.message;error.hidden=false;}});
load();
// Refresh short-lived verification receipts while the management page is visible.
setInterval(()=>{if(!document.hidden&&data&&['overview','connections'].includes(view))load();},60000);
