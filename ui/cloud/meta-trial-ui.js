import {loadDesignAssets,renderArtwork,pngBlob} from './artwork.js';
export function createTrialPanel({api,message,csrf}){
 const panel=document.createElement('section');panel.className='media-section';
 panel.innerHTML='<h3>Đăng thử một bài kỹ thuật</h3><p>Chỉ Trang Tập Viết · 551227411605506. Bài thử được ghi nhận riêng; xem trạng thái lịch hằng ngày trong bảng lịch. Nếu mất phản hồi, không tự đăng lại.</p><pre id="trial-caption"></pre><canvas id="trial-canvas" width="1080" height="1080" hidden role="img" aria-label="Ảnh kiểm thử với ba logo"></canvas><p id="trial-state" role="status"></p><button type="button" id="trial-prepare">Dựng và lưu bản xem trước</button><p><label><input id="trial-approve" type="checkbox">Tôi đã xem caption, ảnh và đồng ý đăng một bài này lên Tập Viết.</label></p><button type="button" id="trial-send" disabled>Đăng bài thử lên Tập Viết</button><p><label>ID bài Facebook cần đối chiếu <input id="trial-remote" placeholder="551227411605506_…"></label> <button type="button" id="trial-reconcile" disabled>Đối chiếu bằng cách đọc Facebook</button></p>';
 const $=id=>panel.querySelector('#'+id);let current,busy=false,requestId=crypto.randomUUID();
 const spec={layout:'infographic',motif:'process',headline:'Kiểm thử hệ thống đăng bài',points:['Caption và footer','Ảnh vuông với ba logo','Lịch hằng ngày vẫn dừng'],note:'Fanpage thử nghiệm: Tập Viết',paper:'#f2f6fa',ink:'#163348',accent:'#07559d'};
 const errors={TRIAL_TOKEN_TOO_SHORT:'Token hoặc quyền dữ liệu còn dưới 24 giờ. Cấp token phù hợp trước khi đăng thử.',TRIAL_META_NOT_VERIFIED:'Chưa xác minh được Meta. Kiểm tra kết nối và token.',TRIAL_CONFIG_CHANGED:'Ứng dụng hoặc Trang đã thay đổi so với bản xem trước.',TRIAL_PAGE_BLOCKED:'Chỉ cho phép fanpage thử Tập Viết.',TRIAL_APPROVAL_REQUIRED:'Cần xem và xác nhận caption, ảnh và fanpage thử.',TRIAL_IMAGE_CHANGED:'Ảnh không còn đúng checksum.',TRIAL_BUSY:'Kho đang bảo trì.',TRIAL_REMOTE_ID_INVALID:'ID bài phải có dạng 551227411605506_số.',TRIAL_ALREADY_PREPARED:'Đã có bản kiểm thử. Tải lại trạng thái.'};
 function controls(){const s=current?.state;$('trial-prepare').disabled=busy||Boolean(current);$('trial-send').disabled=busy||s!=='prepared'||!$('trial-approve').checked;$('trial-reconcile').disabled=busy||!['unknown','intent'].includes(s);$('trial-approve').disabled=busy||s!=='prepared';}
 async function load(){const data=await api('/api/meta/trial');current=data.trial;$('trial-caption').textContent=current?.caption??data.caption;
  const labels={prepared:'Bản xem trước đã lưu. Chưa gửi Facebook.',intent:'Đã ghi ý định gửi. Nếu chưa có kết quả, đối chiếu; không đăng lại.',unknown:'Chưa xác minh được kết quả gửi. Đối chiếu; không đăng lại.',rejected:'Meta từ chối bài thử. Giữ bằng chứng; không tự thử lại.',published:'Đã xác minh bài thử trên Facebook.'};$('trial-state').textContent=labels[current?.state]??'Chưa có bản xem trước.';
  if(current?.remoteId)$('trial-remote').value=current.remoteId;
  if(current?.url){const a=document.createElement('a');a.href=current.url;a.textContent=' Mở bài thử';a.target='_blank';a.rel='noopener';$('trial-state').append(a);}
  if(current&&$('trial-canvas').hidden){const response=await fetch(current.imageUrl);if(!response.ok)throw Error('Chưa tải được ảnh thử.');const bmp=await createImageBitmap(await response.blob());$('trial-canvas').getContext('2d').drawImage(bmp,0,0);bmp.close();$('trial-canvas').hidden=false;}
  controls();
 }
 async function action(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){message(errors[e.code]??e.message,true);}finally{busy=false;await load().catch(e=>message(e.message,true));controls();}}
 $('trial-approve').addEventListener('change',controls);
 $('trial-prepare').addEventListener('click',()=>action(async()=>{const resources=await api('/api/design/resources'),assets=await loadDesignAssets(resources);let blob;
  try{renderArtwork($('trial-canvas'),spec,resources,assets);blob=await pngBlob($('trial-canvas'));}finally{assets.dispose();}
  const response=await fetch('/api/library/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-CSRF-Token':csrf(),'X-File-Metadata':encodeURIComponent(JSON.stringify({kind:'image',contentType:'image/png',filename:'meta-trial.png'}))},body:blob});const file=await response.json();if(!response.ok)throw Object.assign(Error(file.code),{code:file.code});
  await api('/api/meta/trial/prepare',{requestId,libraryId:file.file.id});$('trial-canvas').hidden=false;message('Bản xem trước đã lưu. Chưa đăng Facebook.');
 }));
 $('trial-send').addEventListener('click',()=>action(async()=>{await api('/api/meta/trial/send',{requestId:current.requestId,confirmPageId:'551227411605506',approveCaption:true,approveImage:$('trial-approve').checked});message('Đã xử lý yêu cầu. Xem trạng thái bài thử.');}));
 $('trial-reconcile').addEventListener('click',()=>action(async()=>{await api('/api/meta/trial/reconcile',{requestId:current.requestId,remoteId:$('trial-remote').value.trim()||current.remoteId});}));
 return {mount(root){root.append(panel);},load};
}
