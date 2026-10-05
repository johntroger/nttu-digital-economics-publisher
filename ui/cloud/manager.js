const $ = id => document.getElementById(id);
let session, catalog, selected, resources, pendingSave, pendingImage, saving = false, opening = 0;
const mediaSection = document.createElement('section'); mediaSection.className = 'media-section';
const mediaHeading = document.createElement('h3'); mediaHeading.textContent = 'Ảnh minh họa của phiên bản';
const mediaImage = document.createElement('img'); mediaImage.id = 'post-image'; mediaImage.hidden = true;
const mediaStatus = document.createElement('p'); mediaStatus.id = 'image-status'; mediaStatus.className = 'muted';
const mediaLabel = document.createElement('label'); mediaLabel.textContent = 'Chọn ảnh đã tải lên';
const mediaSelect = document.createElement('select'); mediaSelect.id = 'image-picker'; mediaLabel.append(mediaSelect);
const mediaButton = document.createElement('button'); mediaButton.id = 'attach-image'; mediaButton.type = 'button'; mediaButton.textContent = 'Gắn ảnh vào phiên bản mới';
mediaSection.append(mediaHeading,mediaImage,mediaStatus,mediaLabel,mediaButton); $('editor').append(mediaSection); mediaSection.hidden = true;
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
async function api(path, input) {
  const response = await fetch(path, input === undefined ? {} : { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf,
  }, body: JSON.stringify(input) });
  if (response.status === 401) { location.assign('/?login=expired'); throw new Error('Phiên đăng nhập đã hết hạn.'); }
  const body = await response.json();
  if (!response.ok) {
    const errors = { VERSION_CONFLICT: 'Bài đã có phiên bản mới. Mở lại bài trước khi lưu.', VERSION_CONFLICT_OR_BUSY: 'Bài đang được xử lý hoặc đã thay đổi. Mở lại bài để kiểm tra.', DUPLICATE_CAPTION: 'Nội dung trùng với một bài khác trong kho.', REQUEST_REUSED: 'Yêu cầu lưu cũ không khớp. Mở lại bài và thử lại.', CSRF_REQUIRED: 'Phiên không hợp lệ. Đăng nhập lại để tiếp tục.', INVALID_CAPTION: 'Kiểm tra tiêu đề và nội dung. Không dán phần kết bài vào ô nội dung.', CLOUD_DATABASE_UNAVAILABLE: 'Kho cloud chưa sẵn sàng. Thử lại sau.' };
    throw new Error(errors[body.code] ?? 'Không thực hiện được thao tác. Thử lại sau.');
  }
  return body;
}
function renderPosts() {
  const search = $('search').value.trim().toLocaleLowerCase('vi'), group = $('group').value;
  const posts = catalog.posts.filter(post => (group === 'all' || post.group === group) && `${post.key} ${post.title} ${post.body}`.toLocaleLowerCase('vi').includes(search));
  $('rows').replaceChildren(); $('count').textContent = `${posts.length} bài`; $('empty').hidden = posts.length > 0;
  for (const post of posts) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'post-button';
    button.setAttribute('aria-pressed', String(post.id === selected?.id));
    const key = document.createElement('small'); key.textContent = `${post.key} · ${post.pool === 'reserve' ? 'Dự phòng' : 'Theo kế hoạch'}`;
    const title = document.createElement('strong'); title.textContent = post.title;
    const status = document.createElement('small'); status.textContent = `Phiên bản ${post.version} · ${post.stage === 'brief' ? 'Đề cương' : 'Caption cần rà soát'}`;
    button.append(key, title, status); button.addEventListener('click', () => openPost(post.id)); $('rows').append(button);
  }
}
async function loadCatalog() { catalog = await api('/api/catalog'); $('total').textContent = catalog.posts.length; $('captions').textContent = catalog.posts.filter(post => post.stage === 'caption').length; renderPosts(); }
async function openPost(id) {
  if (saving) return;
  if (selected && ($('body').value !== selected.body || $('title').value !== selected.title || $('source-note').value !== selected.sourceNote)
    && !confirm('Bỏ các thay đổi chưa lưu để mở bài khác?')) return;
  const sequence = ++opening;
  try {
    const post = await api('/api/posts/' + encodeURIComponent(id));
    if (sequence !== opening) return;
    selected = post; pendingSave = null; pendingImage = null; refreshImage();
    $('choose').hidden = true; $('edit-form').hidden = false; $('post-key').textContent = post.key;
    $('version-label').textContent = `Phiên bản ${post.version}`; $('title').value = post.title;
    $('body').value = post.body; $('source-note').value = post.sourceNote;
    $('source-hint').textContent = post.sourceHint ? 'Nguồn gợi ý: ' + post.sourceHint : 'Cần đối chiếu nguồn trước khi kiểm định.';
    preview(); $('versions').replaceChildren();
    for (const version of post.versions) {
      const row = document.createElement('div'); row.className = 'version-row';
      const text = document.createElement('p'); text.textContent = `Phiên bản ${version.version}: ${version.title}${version.actor ? ' — ' + version.actor : ''}`; row.append(text);
      if (version.id !== post.versionId) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Khôi phục thành bản mới';
        button.addEventListener('click', () => restore(version.id)); row.append(button);
      }
      $('versions').append(row);
    }
    renderPosts(); message('Đã mở bài. Các thay đổi chỉ được lưu khi bấm Lưu phiên bản mới.');
  } catch (error) { message(error.message, true); }
}
function preview() { $('caption-preview').textContent = $('body').value.trim() + '\n\n' + catalog.separator + '\n\n' + catalog.footer; }
function lock(value) { saving = value; for (const field of $('edit-form').querySelectorAll('input,textarea,button')) field.disabled = value; refreshImage(); }
$('edit-form').addEventListener('submit', async event => {
  event.preventDefault(); if (saving || !selected) return;
  const draft = { expectedVersion: selected.versionId, title: $('title').value, body: $('body').value, sourceNote: $('source-note').value };
  const signature = JSON.stringify(draft);
  if (!pendingSave || pendingSave.signature !== signature) pendingSave = { signature, input: { ...draft, requestId: crypto.randomUUID() } };
  lock(true);
  try {
    await api('/api/posts/' + encodeURIComponent(selected.id) + '/save', pendingSave.input);
    const id = selected.id; selected = null; lock(false); await loadCatalog(); await openPost(id); message('Đã lưu phiên bản mới trên cloud.');
  } catch (error) { message(error.message, true); } finally { lock(false); }
});
async function restore(version) {
  if (saving || !confirm('Tạo phiên bản mới từ caption cũ? Những sửa đổi chưa lưu sẽ bị bỏ. Lịch sử được giữ nguyên.')) return;
  lock(true);
  try {
    await api('/api/posts/' + encodeURIComponent(selected.id) + '/restore', { requestId: crypto.randomUUID(), expectedVersion: selected.versionId, restoreVersion: version });
    const id = selected.id; selected = null; lock(false); await loadCatalog(); await openPost(id); message('Đã khôi phục thành phiên bản mới.');
  } catch (error) { message(error.message, true); } finally { lock(false); }
}
for (const id of ['search', 'group']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderPosts);
$('body').addEventListener('input', preview);
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
  for (const item of document.querySelectorAll('[data-view]')) item.removeAttribute('aria-current'); button.setAttribute('aria-current', 'page');
  const view = button.dataset.view; $('posts-view').hidden = view !== 'posts'; $('library-view').hidden = view !== 'library'; $('other-view').hidden = view === 'posts' || view === 'library';
  if(view === 'library') {loadLibrary().catch(error=>message(error.message,true));return;}
  $('other-content').replaceChildren();
  const heading = document.createElement('h2'), text = document.createElement('p');
  const labels = { schedule: 'Lịch đăng', history: 'Lịch sử', notifications: 'Cảnh báo' };
  heading.textContent = labels[view] ?? 'Kho bài';
  text.textContent = view === 'schedule' ? 'Lịch tự động đang dừng. Thời gian dự kiến: 10:00 mỗi ngày theo giờ Việt Nam. Bài đăng thủ công trên fanpage độc lập.' : view === 'history' ? 'Chưa có bài đăng Facebook thật trong môi trường staging.' : 'Telegram chưa được kết nối trong môi trường staging.';
  $('other-content').append(heading, text);
  for (const row of catalog[view === 'history' ? 'publications' : view === 'schedule' ? 'schedule' : 'notifications'] ?? []) {
    const item = document.createElement('p');
    item.textContent = view === 'history' ? `${row.confirmed_at} · ${row.caption_snapshot}`
      : view === 'schedule' ? `${row.business_date} · ${row.status}` : `${row.event_id} · ${row.state}`;
    $('other-content').append(item);
  }
});
$('logout').addEventListener('click', async () => { try { await api('/auth/logout', {}); location.assign('/'); } catch (error) { message(error.message, true); } });
window.addEventListener('beforeunload', event => { if (selected && ($('body').value !== selected.body || $('title').value !== selected.title || $('source-note').value !== selected.sourceNote)) { event.preventDefault(); event.returnValue = ''; } });
const fileErrors = {STORAGE_NOT_CONFIGURED:'Kho file cloud chưa được kết nối.',FILE_TOO_LARGE:'File vượt giới hạn dung lượng.',FILE_FORMAT_INVALID:'Định dạng bên trong file không hợp lệ.',FILE_TYPE_UNSUPPORTED:'Loại file không được hỗ trợ.',IMAGE_MUST_BE_SQUARE:'Ảnh bài phải là PNG 1080 × 1080.',FILE_METADATA_INVALID:'Tên file hoặc mã nguồn chưa hợp lệ.',FILE_INTEGRITY_FAILED:'File không khớp dữ liệu đã lưu. Cần kiểm tra kho lưu trữ.',LIBRARY_QUOTA_OR_BUSY:'Kho đã chạm giới hạn hoặc đang bảo trì.',STORAGE_WRITE_FAILED:'Chưa lưu được file. Thử tải lại cùng file để tiếp tục.'};
async function loadLibrary() {
  resources=await api('/api/library');
  $('storage-status').textContent=resources.configured ? `${resources.files.length} file · ${(resources.usedBytes/1048576).toFixed(1)} / ${resources.maxBytes/1048576} MiB. Kho chỉ dành cho tài khoản quản lý.` : 'R2 chưa được kết nối. Bạn vẫn có thể biên tập caption.';
  $('upload-file').disabled=!resources.configured; $('library-files').replaceChildren();
  for(const file of resources.files) {
    const row=document.createElement('article');row.className='file-row';
    const title=document.createElement('h3');title.textContent=file.filename;
    const detail=document.createElement('p');detail.className='muted';detail.textContent=`${({document:'Tài liệu',logo:'Logo',image:'Ảnh bài'})[file.kind]} · ${(file.size/1024).toFixed(0)} KiB${file.sourceKey?' · '+file.sourceKey:''} · ${file.state==='complete'?'Đã lưu':'Chưa hoàn tất — tải lại cùng file để tiếp tục'}`;
    row.append(title,detail);
    if(file.url) {
      if(file.kind!=='document'){const img=document.createElement('img');img.src=file.url;img.alt=file.filename;img.loading='lazy';row.append(img);}
      const link=document.createElement('a');link.href=file.url;link.textContent=file.kind==='document'?'Tải PDF':'Xem ảnh gốc';link.target='_blank';link.rel='noopener';row.append(link);
    }
    $('library-files').append(row);
  }
  if(!resources.files.length){const empty=document.createElement('p');empty.textContent='Chưa có tài nguyên được tải lên.';$('library-files').append(empty);}
  const selectedImage=$('image-picker').value; $('image-picker').replaceChildren();
  for(const file of resources.files.filter(file=>file.kind==='image'&&file.state==='complete')) {const option=document.createElement('option');option.value=file.id;option.textContent=file.filename;$('image-picker').append(option);}
  if(selectedImage)$('image-picker').value=selectedImage; refreshImage();
}
function refreshImage() {
  mediaSection.hidden=!selected;
  $('attach-image').disabled=saving||!selected||!resources?.configured||!$('image-picker').options.length;
  $('image-picker').disabled=saving;
  if(selected?.imageUrl){$('post-image').src=selected.imageUrl;$('post-image').alt=selected.title;$('post-image').hidden=false;}
  else {$('post-image').removeAttribute('src');$('post-image').hidden=true;}
  $('image-status').textContent=selected?.imageUrl?'Ảnh đã gắn; bài vẫn cần rà soát trước khi đăng.':'Chưa gắn ảnh. Lưu hoặc khôi phục caption sẽ tạo bản mới cần chọn ảnh lại.';
}
$('post-image').addEventListener('error',()=>{$('post-image').hidden=true;$('image-status').textContent='Chưa đọc được ảnh từ kho. Kiểm tra file trong thư viện.';});
$('attach-image').addEventListener('click',async()=>{
  if(saving||!selected||!$('image-picker').value)return;
  if($('body').value!==selected.body||$('title').value!==selected.title||$('source-note').value!==selected.sourceNote){message('Lưu thay đổi caption trước khi gắn ảnh.',true);return;}
  const imageId=$('image-picker').value;
  if(!pendingImage||pendingImage.libraryId!==imageId||pendingImage.expectedVersion!==selected.versionId)pendingImage={libraryId:imageId,expectedVersion:selected.versionId,requestId:crypto.randomUUID()};
  lock(true);
  try {await api('/api/posts/'+encodeURIComponent(selected.id)+'/image',pendingImage);const id=selected.id;selected=null;lock(false);await loadCatalog();await openPost(id);message('Đã gắn ảnh vào phiên bản mới; bài vẫn cần rà soát.');}
  catch(error){message(error.message,true);}finally{lock(false);}
});
$('file-kind').addEventListener('change',()=>{const kind=$('file-kind').value;$('file-input').accept=kind==='document'?'application/pdf':kind==='logo'?'image/png,image/jpeg':'image/png';$('file-source').disabled=kind!=='document';if(kind!=='document')$('file-source').value='';});
$('upload-form').addEventListener('submit',async event=>{
  event.preventDefault();const file=$('file-input').files[0];if(!file||!resources?.configured)return;
  const kind=$('file-kind').value,max=kind==='document'?12*1048576:5*1048576;
  if(file.size>max){message(fileErrors.FILE_TOO_LARGE,true);return;}
  $('upload-file').disabled=true;
  try {
    const metadata={kind,filename:file.name,contentType:file.type,sourceKey:kind==='document'?$('file-source').value.trim()||null:null};
    const response=await fetch('/api/library/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-CSRF-Token':session.csrf,'X-File-Metadata':encodeURIComponent(JSON.stringify(metadata))},body:file});
    if(response.status===401){location.assign('/?login=expired');return;}
    const result=await response.json();if(!response.ok)throw new Error(fileErrors[result.code]??'Chưa tải file lên được. Thử lại sau.');
    await loadLibrary();message(result.reused?'File đã có trong thư viện; đã dùng lại bản đã lưu.':'Đã lưu file vào thư viện riêng tư.');
  } catch(error){message(error.message,true);}finally{$('upload-file').disabled=!resources?.configured;}
});
(async () => { try { session = await api('/api/me'); $('account').textContent = session.email; await loadCatalog(); await loadLibrary(); message('Kho staging đã tải. Lịch đăng vẫn đang dừng.'); } catch (error) { message(error.message, true); } })();
