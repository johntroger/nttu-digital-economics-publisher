export function createContentTrialPanel({api,message}){
 const panel=document.createElement('section');panel.className='media-section';
 panel.innerHTML='<h3>Đăng thử nội dung P01</h3><p>Một bảng doanh thu có thể kể điều gì? · Chỉ đăng một lần lên Tập Viết (551227411605506). Lịch hằng ngày được điều khiển riêng trong bảng lịch.</p><pre id="content-trial-caption"></pre><img id="content-trial-image" alt="Thiết kế P01 đã được duyệt" width="540" hidden><p id="content-trial-state" role="status"></p><button id="content-trial-prepare" type="button">Lưu bản đăng thử P01 đã duyệt</button><p><label><input id="content-trial-approve" type="checkbox">Tôi đồng ý đăng caption và ảnh P01 này lên Tập Viết.</label></p><button id="content-trial-send" type="button" disabled>Đăng P01 lên Tập Viết</button><p><label>ID bài P01 cần đối chiếu <input id="content-trial-remote" placeholder="551227411605506_…"></label> <button id="content-trial-reconcile" type="button" disabled>Đối chiếu P01 trên Facebook</button></p>';
 const $=id=>panel.querySelector('#content-trial-'+id);let current,busy=false,versionId,requestId=crypto.randomUUID();
 const labels={prepared:'Bản đăng thử đã lưu; chưa gửi Facebook.',intent:'Đã ghi ý định gửi. Cần đối chiếu, không gửi lại.',unknown:'Chưa xác minh được kết quả. Cần đối chiếu, không gửi lại.',rejected:'Meta từ chối. Giữ bằng chứng để xử lý.',published:'Đã xác minh P01 trên Facebook.'};
 function controls(){$('prepare').disabled=busy||!!current||!versionId;$('send').disabled=busy||current?.state!=='prepared'||!$('approve').checked;$('approve').disabled=busy||current?.state!=='prepared';$('reconcile').disabled=busy||!['intent','unknown'].includes(current?.state);}
 async function load(){const data=await api('/api/meta/content-trial');current=data.trial;
  if(!current){const catalog=await api('/api/catalog'),post=catalog.posts.find(p=>p.key==='P01');if(post){versionId=post.versionId;const detail=await api('/api/posts/'+encodeURIComponent(post.id));$('caption').textContent=detail.caption;if(detail.imageUrl){$('image').src=detail.imageUrl;$('image').hidden=false;}}}
  else{$('caption').textContent=current.caption;$('image').src=current.imageUrl;$('image').hidden=false;if(current.remoteId)$('remote').value=current.remoteId;}
  $('state').textContent=labels[current?.state]??'Chưa có bản đăng thử. Kho P01 giữ nguyên.';
  if(current?.url){const a=document.createElement('a');a.href=current.url;a.textContent=' Mở bài P01';a.target='_blank';a.rel='noopener';$('state').append(a);}controls();
 }
 async function action(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){message('Chưa hoàn tất: '+(e.code??e.message),true);}finally{busy=false;await load().catch(e=>message(e.message,true));controls();}}
 $('approve').addEventListener('change',controls);
 $('prepare').addEventListener('click',()=>action(async()=>{await api('/api/meta/content-trial/prepare',{requestId,expectedVersion:versionId});message('Đã lưu caption và ảnh P01; lịch hằng ngày vẫn dừng.');}));
 $('send').addEventListener('click',()=>action(async()=>{await api('/api/meta/content-trial/send',{requestId:current.requestId,confirmPageId:'551227411605506',approveCaption:true,approveImage:$('approve').checked});message('Đã xử lý yêu cầu đăng P01. Xem kết quả đối chiếu bên dưới.');}));
 $('reconcile').addEventListener('click',()=>action(async()=>{await api('/api/meta/content-trial/reconcile',{requestId:current.requestId,remoteId:$('remote').value.trim()||current.remoteId});}));
 return{mount(root){root.append(panel);},load};
}
