const $ = id => document.getElementById(id);
let session, catalog, selected, pendingSave, saving = false, opening = 0;
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
    selected = post; pendingSave = null;
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
function lock(value) { saving = value; for (const field of $('edit-form').querySelectorAll('input,textarea,button')) field.disabled = value; }
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
  const view = button.dataset.view; $('posts-view').hidden = view !== 'posts'; $('other-view').hidden = view === 'posts';
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
(async () => { try { session = await api('/api/me'); $('account').textContent = session.email; await loadCatalog(); message('Kho staging đã tải. Lịch đăng vẫn đang dừng.'); } catch (error) { message(error.message, true); } })();
