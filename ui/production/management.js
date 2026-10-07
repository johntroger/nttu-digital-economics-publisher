const panel=document.querySelector('#panel'),error=document.querySelector('#error');
let data,identity,view='overview';
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
  panel.append(table(['Thiết lập','Giá trị'],[['Trạng thái','Chưa bật'],['Giờ đăng','10:00 · Việt Nam'],['Tần suất','1 bài tự động/ngày'],['Fanpage','Ngành Kinh tế số – NTTU']]));
  panel.append(data.schedule.length?table(['Ngày','Trạng thái'],data.schedule.map(x=>[x.business_date,x.status])):empty('Chưa có bài được lên lịch','Sau khi kho chính thức và kết nối được nghiệm thu, lịch sẽ được cấu hình với ngày bắt đầu do bạn phê duyệt.'));
 }else if(view==='history'){
  if(!data.history.length)panel.append(empty('Chưa có bài đăng chính thức','Lịch sử thử nghiệm trên Tập Viết được giữ riêng tại staging.'));
  else data.history.forEach(x=>{const d=el('details');d.append(el('summary',x.remote_id+' · '+x.confirmed_at),el('pre',x.caption_snapshot));panel.append(d);});
 }else if(view==='notifications'){
  panel.append(data.notifications.length?table(['Sự kiện','Trạng thái'],data.notifications.map(x=>[x.event_id,x.state])):empty('Chưa có thông báo vận hành','Kết nối Telegram cho production sẽ được thiết lập và kiểm thử ở bước tích hợp.'));
 }else{
  panel.append(table(['Kết nối','Hiện trạng'],[['Google',identity.email],['Facebook','Chưa xác minh Page ID và token production'],['Telegram','Chưa thiết lập production'],['Giám sát và phục hồi','Chưa nghiệm thu production']]));
  const p=el('p'),a=el('a','Mở fanpage Ngành Kinh tế số – NTTU');a.href=data.targetPageUrl;a.target='_blank';a.rel='noopener noreferrer';p.append(a);panel.append(p);
 }
}
async function get(path){const r=await fetch(path,{cache:'no-store',redirect:'error'});if(r.status===401){location.assign('/');throw Error('Phiên đăng nhập hết hạn.');}if(!r.ok)throw Error('Chưa đọc được dữ liệu. Hãy làm mới hoặc đăng nhập lại.');return r.json();}
async function load(){error.hidden=true;try{[identity,data]=await Promise.all([get('/api/me'),get('/api/management')]);document.querySelector('#owner').textContent=identity.email;render();}catch(e){error.textContent=e.message;error.hidden=false;}}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{if(!data)return;view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>{x.classList.toggle('selected',x===button);if(x===button)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});render();}));
document.querySelector('#refresh').addEventListener('click',load);
document.querySelector('#logout').addEventListener('click',async()=>{if(!identity)return;try{const r=await fetch('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:'{}',redirect:'error'});if(!r.ok)throw Error('Chưa đăng xuất được. Hãy thử lại.');location.assign('/');}catch(e){error.textContent=e.message;error.hidden=false;}});
load();
