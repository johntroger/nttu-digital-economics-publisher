export function createDailyPanel({api,message}){
 const panel=document.createElement('section');panel.className='media-section';
 panel.innerHTML='<h3>Lịch đăng hằng ngày</h3><p>Fanpage thử Tập Viết · Một bài mỗi ngày lúc 10:00, giờ Việt Nam.</p><p data-status role="status"></p><p><label>Ngày bắt đầu <input data-date type="date"></label> <button data-config type="button">Lưu lịch và giữ tạm dừng</button></p><p><label><input data-approve type="checkbox">Tôi đồng ý bật lịch đăng hằng ngày lên Tập Viết từ ngày đã lưu.</label></p><button data-activate type="button" disabled>Bật lịch đăng</button> <button data-pause type="button">Tạm dừng lịch</button><h4>Kết quả cần đối soát</h4><div data-jobs></div>';
 const $=key=>panel.querySelector('[data-'+key+']');let state,busy=false;
 const labels={held:'Đang chuẩn bị',publish_requested:'Đã ghi ý định gửi',evidence_pending:'Đang lưu kết quả',unknown:'Chưa rõ kết quả',retry_wait:'Chờ thử lại',confirmed:'Đã xác minh',failed:'Cần xử lý',cancelled:'Đã dừng'};
 function controls(){$('config').disabled=busy||!state?.paused;$('config').textContent=state?.startDate?'Xác nhận lại kết nối, giữ lịch dừng':'Lưu lịch và giữ tạm dừng';$('date').disabled=busy||Boolean(state?.startDate);$('activate').disabled=busy||!state?.deploymentGate||!state?.startDate||!$('approve').checked||state.enabled;$('pause').disabled=busy||state?.paused;}
 async function action(fn){if(busy)return;busy=true;controls();try{await fn();await load();}catch(e){message(e.code==='DAILY_DEPLOYMENT_GATE_CLOSED'?'Chưa mở quyền bật lịch. Cần hoàn tất kiểm thử và phê duyệt.':e.message,true);}finally{busy=false;controls();}}
 async function load(){state=await api('/api/daily');$('status').textContent=state.enabled?'Lịch đang bật.':state.deploymentGate?'Lịch đang tạm dừng.':'Lịch đang tạm dừng; quyền bật lịch chưa được mở trong giai đoạn kiểm thử.';if(state.startDate)$('date').value=state.startDate;$('jobs').replaceChildren();
  for(const job of state.jobs){const row=document.createElement('p');row.textContent=job.title+' — '+(labels[job.state]??job.state)+' ('+job.attempt_count+'/3)';
   if(['unknown','publish_requested','evidence_pending'].includes(job.state)){const input=document.createElement('input');input.placeholder='551227411605506_ID bài';input.setAttribute('aria-label','ID bài trên Facebook');const button=document.createElement('button');button.textContent='Đọc Facebook để đối soát';button.addEventListener('click',()=>action(()=>api('/api/daily/reconcile',{jobId:job.id,remoteId:input.value.trim()})));row.append(input,button);}
   $('jobs').append(row);
  }controls();
 }
 $('approve').addEventListener('change',controls);
 $('config').addEventListener('click',()=>action(()=>api('/api/daily/configure',{requestId:crypto.randomUUID(),startDate:$('date').value,confirmPageId:'551227411605506'})));
 $('activate').addEventListener('click',()=>action(()=>api('/api/daily/activate',{approveDailyPublication:$('approve').checked,confirmPageId:'551227411605506'})));
 $('pause').addEventListener('click',()=>action(()=>api('/api/daily/pause',{})));
 return {mount(root){root.append(panel);},load};
}
